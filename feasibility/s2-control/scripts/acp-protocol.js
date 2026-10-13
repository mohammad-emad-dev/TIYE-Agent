'use strict';
const { StringDecoder } = require('node:string_decoder');
const { acpFailure } = require('./acp-failure');

function rpcClient(state, evidence) {
  let buffer = '', nextID = 1;
  const decoder = new StringDecoder('utf8');
  const waiting = new Map();
  let closedFailure;
  let ownedSession, promptStarted = false, cancelled = false, messageID, chunks = 0, units = 0;
  const failAll = category => {
    if (closedFailure) return;
    closedFailure = acpFailure(category);
    for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(closedFailure); }
    waiting.clear();
  };
  const send = packet => {
    try { state.child.stdin.write(JSON.stringify(packet) + '\n', error => { if (error) failAll('acp.transport'); }); }
    catch { failAll('acp.transport'); }
  };
  const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
  const request = (method, params, timeout = 15000) => new Promise((resolve, reject) => {
    if (closedFailure) { reject(closedFailure); return; }
    const id = nextID++;
    const timer = setTimeout(() => { waiting.delete(id); reject(acpFailure('acp.deadline')); }, timeout);
    waiting.set(id, { timer, resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
  const receiveReply = packet => {
    const pending = waiting.get(packet.id);
    if (!pending) return; // Late replies cannot revive an expired request.
    waiting.delete(packet.id); clearTimeout(pending.timer);
    if (Object.hasOwn(packet, 'error')) pending.reject(acpFailure('acp.remote', packet.error?.code));
    else pending.resolve(packet.result);
  };
  const receiveUpdate = packet => {
    if (packet.method === 'session/request_permission') {
      evidence.permissionRequests = (evidence.permissionRequests || 0) + 1;
      send({ jsonrpc: '2.0', id: packet.id, result: { outcome: { outcome: 'cancelled' } } });
      return;
    }
    if (packet.method !== 'session/update' || packet.params?.sessionId !== ownedSession) return;
    const update = packet.params.update;
    if (/^tool_call/.test(update?.sessionUpdate || '')) evidence.toolCalls = (evidence.toolCalls || 0) + 1;
    if (!promptStarted || update?.sessionUpdate !== 'agent_message_chunk' || update.content?.type !== 'text'
      || typeof update.content.text !== 'string' || !update.content.text.length || typeof update.messageId !== 'string') return;
    if (messageID && messageID !== update.messageId) { evidence.assistantChanged = true; return; }
    messageID = update.messageId;
    chunks++; units += update.content.text.length;
    evidence.totalOwnTextChunks = chunks;
    evidence.totalOwnTextCodeUnits = units;
    if (cancelled) evidence.postCancelTextChunks = (evidence.postCancelTextChunks || 0) + 1;
    if (chunks === 1) evidence.firstTextCodeUnits = units;
    if (!cancelled && chunks >= 2 && units > evidence.firstTextCodeUnits) {
      evidence.sameAssistantTextChunks = true; evidence.secondTextCodeUnits = units;
      evidence.cancelNotificationSent = true; cancelled = true;
      notify('session/cancel', { sessionId: ownedSession });
    }
  };
  const receiveFrame = line => {
    let packet;
    try { packet = JSON.parse(line); } catch { return false; }
    if (!packet || typeof packet !== 'object' || Array.isArray(packet) || packet.jsonrpc !== '2.0') return false;
    if (typeof packet.method === 'string') { receiveUpdate(packet); return true; }
    if (!Object.hasOwn(packet, 'id') || Object.hasOwn(packet, 'result') === Object.hasOwn(packet, 'error')) return false;
    receiveReply(packet);
    return true;
  };
  state.child.stdout.on('data', bytes => {
    if (closedFailure) return;
    buffer += decoder.write(bytes);
    if (buffer.length > 1048576) { evidence.protocolOverflow = true; buffer = ''; failAll('acp.protocol'); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!receiveFrame(line)) { evidence.malformedProtocol = true; failAll('acp.protocol'); return; }
    }
  });
  for (const emitter of [state.child, state.child.stdin, state.child.stdout]) emitter.on('error', () => failAll('acp.transport'));
  state.child.on('close', () => failAll('acp.transport'));
  state.child.stdout.on('end', () => failAll('acp.transport'));
  return { request, close: () => failAll('acp.transport'),
    prompt: (sessionId, text) => { ownedSession = sessionId; promptStarted = true; return request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, 90000); } };
}

module.exports = { rpcClient };

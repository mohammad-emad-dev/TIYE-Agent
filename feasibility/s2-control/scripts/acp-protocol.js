'use strict';
function rpcClient(state, evidence) {
  let buffer = '', nextID = 1;
  const waiting = new Map();
  let ownedSession, promptStarted = false, cancelled = false, messageID, chunks = 0, units = 0;
  const send = packet => state.child.stdin.write(JSON.stringify(packet) + '\n');
  const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
  const request = (method, params, timeout = 15000) => new Promise((resolve, reject) => {
    const id = nextID++;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('ACP request deadline')); }, timeout);
    waiting.set(id, packet => { clearTimeout(timer); packet.error ? reject(new Error('ACP request failed')) : resolve(packet.result); });
    send({ jsonrpc: '2.0', id, method, params });
  });
  state.child.stdout.on('data', bytes => {
    buffer += bytes;
    if (buffer.length > 1048576) { evidence.protocolOverflow = true; buffer = ''; return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let packet;
      try { packet = JSON.parse(line); } catch { evidence.malformedProtocol = true; continue; }
      if (waiting.has(packet.id)) { const receive = waiting.get(packet.id); waiting.delete(packet.id); receive(packet); continue; }
      if (packet.method === 'session/request_permission') {
        evidence.permissionRequests = (evidence.permissionRequests || 0) + 1;
        send({ jsonrpc: '2.0', id: packet.id, result: { outcome: { outcome: 'cancelled' } } });
        continue;
      }
      if (packet.method !== 'session/update' || packet.params?.sessionId !== ownedSession) continue;
      const update = packet.params.update;
      if (/^tool_call/.test(update?.sessionUpdate || '')) evidence.toolCalls = (evidence.toolCalls || 0) + 1;
      if (!promptStarted || update?.sessionUpdate !== 'agent_message_chunk' || update.content?.type !== 'text'
        || typeof update.content.text !== 'string' || !update.content.text.length || typeof update.messageId !== 'string') continue;
      if (messageID && messageID !== update.messageId) { evidence.assistantChanged = true; continue; }
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
    }
  });
  return { request, prompt: (sessionId, text) => { ownedSession = sessionId; promptStarted = true; return request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, 90000); } };
}

module.exports = { rpcClient };

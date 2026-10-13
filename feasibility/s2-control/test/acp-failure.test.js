'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { rpcClient } = require('../scripts/acp-protocol');

function channels(t) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough() });
  const sent = [], evidence = {};
  child.stdin.on('data', bytes => sent.push(JSON.parse(bytes.toString())));
  const client = rpcClient({ child }, evidence);
  t.after(() => { client.close(); child.stdin.destroy(); child.stdout.destroy(); });
  return { child, sent, evidence, client, receive: packet => child.stdout.write(JSON.stringify(packet) + '\n') };
}

test('remote RPC errors retain only a category and integer code, and permit the next request', async t => {
  const { client, sent, receive } = channels(t);
  const rejected = assert.rejects(client.request('test/error', {}), error => {
    assert.equal(error.category, 'acp.remote'); assert.equal(error.rpcCode, 401);
    assert.doesNotMatch(JSON.stringify(error) + error.stack, /secret|credential/);
    return true;
  });
  receive({ jsonrpc: '2.0', id: sent[0].id, error: { code: 401, message: 'secret', data: { credential: 'secret' } } });
  await rejected;
  const next = client.request('test/next', {});
  receive({ jsonrpc: '2.0', id: sent[1].id, result: { healthy: true } });
  assert.deepEqual(await next, { healthy: true });
});

test('deadline expires only its own request; a late reply cannot satisfy a newer request', async t => {
  const { client, sent, receive } = channels(t);
  await assert.rejects(client.request('test/stall', {}, 25), { category: 'acp.deadline' });
  const next = client.request('test/next', {});
  receive({ jsonrpc: '2.0', id: sent[0].id, result: { stale: true } });
  receive({ jsonrpc: '2.0', id: sent[1].id, result: { fresh: true } });
  assert.deepEqual(await next, { fresh: true });
  assert.equal(sent.length, 2);
});

test('process close and pipe failure reject all outstanding calls before their long deadlines', async t => {
  for (const fault of ['close', 'pipe-error', 'stdout-end', 'explicit-shutdown']) {
    const { client, child } = channels(t);
    const first = assert.rejects(client.request('test/one', {}, 10000), { category: 'acp.transport' });
    const second = assert.rejects(client.request('test/two', {}, 10000), { category: 'acp.transport' });
    if (fault === 'close') child.emit('close', 23);
    if (fault === 'pipe-error') child.stdin.emit('error', new Error('secret transport detail'));
    if (fault === 'stdout-end') child.stdout.end();
    if (fault === 'explicit-shutdown') client.close();
    await Promise.all([first, second]);
    await assert.rejects(client.request('test/after-close', {}), { category: 'acp.transport' });
  }
});

test('malformed frames and oversized buffers reject pending calls without exposing the frame', async t => {
  for (const frame of ['{secret\n', 'null\n', '{"jsonrpc":"2.0","id":1}\n', 'x'.repeat(1048577)]) {
    const { client, child, evidence } = channels(t);
    const pending = assert.rejects(client.request('test/protocol', {}), error => {
      assert.equal(error.category, 'acp.protocol'); assert.doesNotMatch(error.stack, /secret/); return true;
    });
    child.stdout.write(frame);
    await pending;
    assert.equal(Boolean(evidence.malformedProtocol || evidence.protocolOverflow), true);
  }
});

test('split UTF-8 bytes preserve owned text before streaming cancellation', async t => {
  const { client, child, sent, receive, evidence } = channels(t);
  const pending = client.prompt('ses_owned', 'reply');
  const frame = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'ses_owned', update: {
    sessionUpdate: 'agent_message_chunk', messageId: 'a1', content: { type: 'text', text: 'مرحبا' }
  } } }) + '\n');
  const split = frame.indexOf(Buffer.from('م')) + 1;
  child.stdout.write(frame.subarray(0, split)); child.stdout.write(frame.subarray(split));
  assert.equal(evidence.firstTextCodeUnits, 5);
  receive({ jsonrpc: '2.0', id: sent[0].id, result: { stopReason: 'end_turn' } });
  assert.equal((await pending).stopReason, 'end_turn');
  assert.equal(evidence.cancelNotificationSent, undefined);
});

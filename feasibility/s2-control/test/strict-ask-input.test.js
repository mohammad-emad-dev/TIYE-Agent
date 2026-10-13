'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchWithStrictAsk } = require('../scripts/strict-ask-preflight');
const { createStrictAskInputGate } = require('../scripts/strict-ask-input');
const cwd = path.resolve('owned-input-root');
const row = { id: 'saved_1', projectID: 'owned-project', action: 'shell', resource: 'private command *', time: { created: 10, updated: 10 } };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(handlers) {
  const state = { rows: [] };
  const api = async (_cwd, method, route) => {
    assert.equal(method, 'GET');
    if (route === '/api/info') return { pid: 1234, version: '2.0.28' };
    if (route.startsWith('/api/location?')) return { directory: cwd, project: { id: 'owned-project', directory: cwd } };
    if (route.startsWith('/api/permission/saved?')) return { data: structuredClone(state.rows) };
    throw new Error('unexpected API route');
  };
  const context = (await launchWithStrictAsk({ cwd, api, launch: value => value })).value;
  return { state, gate: await createStrictAskInputGate({ context, api, intervalMs: 60000, ...handlers }) };
}

test('fresh permission conflicts close input before transport and verified stop', async () => {
  const sent = []; let stopped = false;
  const { state, gate } = await fixture({ send: text => { sent.push(text); return 'accepted'; }, stop: () => { stopped = true; return { verified: true }; } });
  try {
    assert.deepEqual(await gate.submit('first'), { status: 'submitted', value: 'accepted' });
    state.rows = [row];
    assert.deepEqual(await gate.submit('must not arrive'), { status: 'blocked', reason: 'saved-shell-allow' });
    state.rows = []; await gate.submit('still blocked');
    assert.deepEqual(sent, ['first']); assert.equal(stopped, true); assert.equal(gate.status().status, 'blocked');
  } finally { await gate.close(); }
});

test('suspension does not wait for an in-flight send and rejects queued input afterward', async () => {
  const entered = deferred(), release = deferred(); const sent = []; let stopped = false;
  const { state, gate } = await fixture({ send: async text => { sent.push(text); entered.resolve(); await release.promise; }, stop: () => { stopped = true; return { verified: true }; } });
  const first = gate.submit('in flight'), queued = gate.submit('queued');
  await entered.promise; state.rows = [row];
  assert.equal((await gate.check()).status, 'suspended'); assert.equal(stopped, true);
  release.resolve(); assert.equal((await first).status, 'submitted'); assert.equal((await queued).status, 'blocked');
  assert.deepEqual(sent, ['in flight']); await gate.close();
});

test('close waits for admitted input and suppresses later queued or new sends', async () => {
  const entered = deferred(), release = deferred(); const sent = [];
  const { gate } = await fixture({ send: async text => { sent.push(text); entered.resolve(); await release.promise; }, stop: () => ({ verified: true }) });
  const admitted = gate.submit('admitted'), queued = gate.submit('queued'); await entered.promise;
  let closed = false; const closing = gate.close().then(value => { closed = true; return value; });
  await Promise.resolve(); assert.equal(closed, false);
  release.resolve(); await admitted; assert.equal((await queued).status, 'blocked'); await closing;
  assert.equal((await gate.submit('after close')).status, 'blocked'); assert.deepEqual(sent, ['admitted']);
});

test('unknown input delivery latches subsequent sends without retry or raw error exposure', async () => {
  let deliveries = 0;
  const { gate } = await fixture({ send: () => { deliveries++; throw new Error('PRIVATE response token'); }, stop: () => ({ verified: true }) });
  try {
    assert.deepEqual(await gate.submit('maybe delivered'), { status: 'delivery-unverified' });
    assert.equal((await gate.submit('do not retry')).status, 'blocked'); assert.equal(deliveries, 1);
    assert.equal(JSON.stringify(gate.status()).includes('PRIVATE'), false);
  } finally { await gate.close(); }
});

test('failed suspension leaves input blocked and the owned stop unverified without a retry', async () => {
  let stops = 0, sends = 0;
  const { state, gate } = await fixture({ send: () => { sends++; }, stop: () => { stops++; throw new Error('PRIVATE stop output'); } });
  try {
    state.rows = [row]; assert.equal((await gate.check()).status, 'stop-unverified');
    state.rows = []; assert.equal((await gate.submit('blocked')).status, 'blocked');
    assert.equal(gate.status().monitor.status, 'stop-unverified'); assert.equal(stops, 1); assert.equal(sends, 0);
  } finally { await gate.close(); }
});

test('native active-gate qualification rejects failed stops, delivered blocked input and incomplete cleanup', () => {
  const { activeInputRunPassed } = require('../scripts/run-strict-ask-active');
  const run = require('../evidence/supplements/strict-ask-active/86f746c8fe81c2e61d6eb5811906b17a989cb77ed2f79b29bbcc20b74cb74e5e/2.0.28/strict-ask-active.json').run;
  assert.equal(activeInputRunPassed(run), true);
  for (const change of [
    { inputBlockedBeforeStop: false }, { suspendCalls: 2 }, { faultReads: 0 }, { inputTransportCalls: 1 },
    { rejectedInputMessagesUnchanged: false }, { stopOwnershipConfirmed: false }, { cancelledStableTwice: false },
    { commandProcessesGoneTwice: false }, { fallbackTerminationUsed: true }, { closedStatus: { status: 'open' } },
  ]) assert.equal(activeInputRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  assert.equal(activeInputRunPassed({ ...run, tempRemoved: false }), false);
});

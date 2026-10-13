'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchWithStrictAsk } = require('../scripts/strict-ask-preflight');
const { createStrictAskMonitor } = require('../scripts/strict-ask-monitor');
const cwd = path.resolve('owned-worktree');
const root = path.resolve('owned-root');
const row = { id: 'saved_1', projectID: 'owned-project', action: 'shell', resource: 'private command *', time: { created: 10, updated: 10 } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function transport() {
  const state = { rows: [], pid: 1234, projectID: 'owned-project', failure: false, barrier: null, entered: null };
  const api = async (_cwd, method, route) => {
    assert.equal(method, 'GET');
    if (state.failure) throw new Error('PRIVATE provider response token');
    if (state.barrier) { state.entered?.resolve(); await state.barrier.promise; }
    if (route === '/api/info') return { pid: state.pid, version: '2.0.28' };
    if (route.startsWith('/api/location?')) return { directory: cwd, project: { id: state.projectID, directory: root } };
    if (route.startsWith('/api/permission/saved?')) { const response = { data: structuredClone(state.rows) }; state.afterSavedRead?.(); return response; }
    throw new Error('unexpected API route');
  };
  return { state, api };
}
async function launchContext(api) {
  return (await launchWithStrictAsk({ cwd, api, launch: context => context })).value;
}

test('a later shell grant suspends once and removal never resumes the owned member', async () => {
  const { state, api } = transport(); let suspensions = 0;
  const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 60000,
    suspend: async () => { suspensions++; return { verified: true }; } });
  try {
    assert.equal(monitor.status().status, 'armed');
    state.rows = [row];
    assert.deepEqual(await monitor.check(), { status: 'suspended', reason: 'saved-shell-allow' });
    state.rows = [];
    assert.equal((await monitor.check()).status, 'suspended'); assert.equal(suspensions, 1);
    assert.equal(JSON.stringify(monitor.status()).includes(row.resource), false);
  } finally { await monitor.close(); }
});

test('transport failure, malformed state and replacement launch identities latch suspension', async () => {
  for (const change of [state => { state.failure = true; }, state => { state.rows = [null]; }, state => { state.pid++; }, state => { state.projectID = 'replacement-project'; }]) {
    const { state, api } = transport(); let suspended = false;
    const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 60000, suspend: async () => { suspended = true; return { verified: true }; } });
    try { change(state); assert.equal((await monitor.check()).status, 'suspended'); assert.equal(suspended, true); }
    finally { await monitor.close(); }
  }
});

test('concurrent checks share work and close waits for an already-started suspension', async () => {
  const { state, api } = transport(); const entered = deferred(), release = deferred(); let suspensions = 0;
  const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 60000,
    suspend: async () => { suspensions++; entered.resolve(); await release.promise; return { verified: true }; } });
  state.rows = [row];
  const first = monitor.check(), second = monitor.check();
  assert.equal(first, second);
  await entered.promise;
  let closed = false; const closing = monitor.close().then(result => { closed = true; return result; });
  await Promise.resolve(); assert.equal(closed, false);
  release.resolve(); await first;
  assert.deepEqual(await closing, { status: 'closed', disposition: 'suspended', reason: 'saved-shell-allow' });
  await monitor.check(); assert.equal(suspensions, 1);
});

test('close during a permission read suppresses a later callback and disposes polling', async () => {
  const { state, api } = transport(); let suspended = false;
  const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 20,
    suspend: () => { suspended = true; return { verified: true }; } });
  state.barrier = deferred(); state.entered = deferred(); state.rows = [row];
  const checking = monitor.check(); await state.entered.promise;
  const closing = monitor.close(); state.barrier.resolve(); await checking; await closing;
  await delay(45); assert.equal(suspended, false); assert.equal(monitor.status().status, 'closed');
});

test('polling detects a grant without a manual check and retains a failed stop without retry', async () => {
  const { state, api } = transport(); let attempts = 0;
  const called = deferred();
  const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 20,
    suspend: () => { attempts++; called.resolve(); throw new Error('PRIVATE stop error'); } });
  try {
    state.rows = [row];
    await Promise.race([called.promise, delay(1000).then(() => { throw new Error('poll deadline'); })]);
    assert.deepEqual(await monitor.check(), { status: 'stop-unverified', reason: 'saved-shell-allow' });
    state.rows = []; await delay(45); await monitor.check(); assert.equal(attempts, 1);
  } finally { await monitor.close(); }
});

test('a grant arriving before monitor startup suspends before the adapter may accept input', async () => {
  const { state, api } = transport(); const context = await launchContext(api); state.rows = [row];
  const monitor = await createStrictAskMonitor({ context, api, intervalMs: 60000, suspend: () => ({ verified: false }) });
  try { assert.equal(monitor.status().status, 'stop-unverified'); }
  finally { await monitor.close(); }
});

test('a native grant appearing between the two clear reads is reported as a shell conflict', async () => {
  // Regression: first native monitor attempt suspended safely but exposed only generic snapshot drift.
  const { state, api } = transport();
  const monitor = await createStrictAskMonitor({ context: await launchContext(api), api, intervalMs: 60000, suspend: () => ({ verified: true }) });
  try {
    state.afterSavedRead = () => { state.rows = [row]; };
    assert.deepEqual(await monitor.check(), { status: 'suspended', reason: 'saved-shell-allow' });
  } finally { await monitor.close(); }
});

test('native qualification requires owned suspension, no automatic resume and complete monitor cleanup', () => {
  const { monitorRunPassed } = require('../scripts/run-strict-ask-monitor');
  const run = require('../evidence/supplements/strict-ask-monitor/518a7d2d6438bf614830617d2cf50e8456091e5174dafb06244df8541db20fe0/2.0.28/strict-ask-monitor.json').run;
  const failed = require('../evidence/supplements/strict-ask-monitor/1081941951b53275db36c39ae56424cfcb17d44caaff7b1e4015a45d5c6272b4/2.0.28/strict-ask-monitor.json').run;
  assert.equal(monitorRunPassed(run), true); assert.equal(monitorRunPassed(failed), false);
  for (const change of [
    { detectedStatus: { status: 'stop-unverified', reason: 'saved-shell-allow' } }, { suspendCalls: 2 }, { stopOwnershipConfirmed: false },
    { idleNeverExecuted: false }, { noAutoResume: false }, { monitorClosed: false }, { idleSessionRemoved: false },
    { initialMonitorArmed: false }, { savedRuleRemoved: false }, { serviceVersionAfterCleanup: '2.0.29' },
  ]) assert.equal(monitorRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  assert.equal(monitorRunPassed({ ...run, tempRemoved: false }), false);
});

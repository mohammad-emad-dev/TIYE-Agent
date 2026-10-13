'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { strictAskPreflight, launchWithStrictAsk } = require('../scripts/strict-ask-preflight');
const cwd = path.resolve('owned-worktree');
const project = { id: 'owned-project', directory: path.resolve('owned-root') };
const shellRow = { id: 'saved_1', projectID: project.id, action: 'shell', resource: 'git status *', time: { created: 100, updated: 100 } };

// Only the external service API is substituted; native state objects and the launch gate are real.
function transport({ rows = [], update } = {}) {
  let savedReads = 0;
  return async (_cwd, method, route) => {
    assert.equal(method, 'GET');
    let response;
    if (route === '/api/info') response = { version: '2.0.28', pid: 1234 };
    else if (route.startsWith('/api/location?')) response = { directory: cwd, project: { ...project } };
    else if (route === `/api/permission/saved?projectID=${project.id}`) { savedReads++; response = { data: structuredClone(rows) }; }
    else throw new Error('unexpected route');
    return update ? update({ route, savedReads, response }) : response;
  };
}

test('a project shell allow blocks a worktree launch without exposing its pattern', async () => {
  let launched = false;
  const result = await launchWithStrictAsk({ cwd, api: transport({ rows: [shellRow] }), launch: () => { launched = true; } });
  assert.deepEqual(result, { status: 'blocked', reason: 'saved-shell-allow', conflictingRules: 1 });
  assert.equal(launched, false);
  assert.equal(JSON.stringify(result).includes(shellRow.resource), false);
});

test('clear checks are fresh on every launch, and unrelated saved grants permit the trusted callback', async () => {
  let rows = [{ ...shellRow, action: 'read' }], launches = 0;
  const api = transport({ update: ({ route, response }) => route.startsWith('/api/permission/saved?') ? { data: structuredClone(rows) } : response });
  const launch = async context => { launches++; assert.equal(context.cwd, cwd); assert.equal(context.projectID, project.id); return 'owned-session'; };
  const allowed = await launchWithStrictAsk({ cwd, api, launch });
  assert.equal(allowed.status, 'launched'); assert.equal(allowed.value, 'owned-session'); assert.equal(allowed.preflight.stableReads, 2);
  rows = [shellRow];
  assert.equal((await launchWithStrictAsk({ cwd, api, launch })).status, 'blocked');
  assert.equal(launches, 1);
});

test('saved permission changes, service replacement and native project drift prevent launch', async () => {
  const variants = [
    ({ route, savedReads, response }) => route.startsWith('/api/permission/saved?') && savedReads === 2 ? { data: [shellRow] } : response,
    ({ route, savedReads, response }) => route === '/api/info' && savedReads > 0 ? { ...response, pid: 4321 } : response,
    ({ route, savedReads, response }) => route.startsWith('/api/location?') && savedReads > 0 ? { ...response, project: { ...project, id: 'different-project' } } : response,
  ];
  for (const update of variants) {
    let launches = 0;
    const result = await launchWithStrictAsk({ cwd, api: transport({ update }), launch: () => { launches++; } });
    assert.notEqual(result.status, 'launched'); assert.equal(launches, 0);
  }
});

test('foreign, duplicate, malformed and unsupported action-pattern rows fail closed', async () => {
  for (const rows of [
    null, [null], [shellRow, shellRow], [{ ...shellRow, projectID: 'foreign' }], [{ ...shellRow, id: '../foreign' }],
    [{ ...shellRow, resource: '' }], [{ ...shellRow, action: '*' }], [{ ...shellRow, action: 'sh*' }],
    [{ ...shellRow, action: 'Shell' }], [{ ...shellRow, action: 'unreviewed-plugin-action' }],
    [{ ...shellRow, time: { created: 100, updated: 99 } }], [{ ...shellRow, effect: 'deny' }],
  ]) {
    let launches = 0;
    const result = await launchWithStrictAsk({ cwd, api: transport({ rows }), launch: () => { launches++; } });
    assert.deepEqual(result, { status: 'unavailable', reason: 'permission-state-unverified' }); assert.equal(launches, 0);
  }
});

test('bad locations, unreviewed versions and transport errors return redacted failures', async () => {
  for (const update of [
    ({ route, response }) => route === '/api/info' ? { ...response, version: '2.0.29' } : response,
    ({ route, response }) => route === '/api/info' ? { ...response, pid: 0 } : response,
    ({ route, response }) => route.startsWith('/api/location?') ? { ...response, directory: path.resolve('foreign') } : response,
    () => { throw new Error('PRIVATE provider token path'); },
  ]) assert.deepEqual(await strictAskPreflight({ cwd, api: transport({ update }) }), { status: 'unavailable', reason: 'permission-state-unverified' });
  assert.equal((await strictAskPreflight({ cwd: 'relative', api: transport() })).status, 'unavailable');
});

test('row order does not cause false conflict but a resource update does', async () => {
  const rows = [{ ...shellRow, action: 'read' }, { ...shellRow, id: 'saved_2', action: 'edit' }];
  const api = transport({ rows, update: ({ savedReads, response, route }) => route.startsWith('/api/permission/saved?') && savedReads === 2 ? { data: response.data.reverse() } : response });
  assert.equal((await strictAskPreflight({ cwd, api })).status, 'clear');
  const changed = transport({ rows, update: ({ savedReads, response, route }) => {
    if (route.startsWith('/api/permission/saved?') && savedReads === 2) response.data[0].resource = 'changed';
    return response;
  } });
  assert.deepEqual(await strictAskPreflight({ cwd, api: changed }), { status: 'blocked', reason: 'permission-snapshot-changed' });
});

test('launch failure propagates once without claiming the preflight prevented execution', async () => {
  let attempts = 0;
  const failure = new Error('execution may have started');
  await assert.rejects(launchWithStrictAsk({ cwd, api: transport(), launch: async () => { attempts++; throw failure; } }), error => error === failure);
  assert.equal(attempts, 1);
});

test('native qualification rejects bypassed launch gates, unverified idle state and incomplete cleanup', () => {
  const { preflightRunPassed } = require('../scripts/run-strict-ask-preflight');
  const native = require('../evidence/supplements/strict-ask-preflight/b740075158b02e94ebf77be5b11eaf7b7e5ae6ecfd2af312e0a19562fc54c975/2.0.28/strict-ask-preflight.json').run;
  assert.equal(preflightRunPassed(native), true);
  for (const change of [
    { conflictPreflight: { status: 'clear' } }, { blockedSessionSetUnchanged: false }, { launchCallbacks: 2 },
    { revokedLaunchStatus: 'blocked' }, { idleSessionSelectionConfirmed: false }, { idleSessionNeverExecuted: false }, { idleSessionRemoved: false },
    { savedRuleRemoved: false }, { originalClientCleanup: { verified: false } }, { serviceVersionAfterCleanup: '2.0.29' },
    { parentPermissionReplies: 1 }, { emptyPreflight: { status: 'clear', stableReads: 1 } }, { seed: { passed: true } },
  ]) assert.equal(preflightRunPassed({ ...native, cli: { ...native.cli, ...change } }), false);
  assert.equal(preflightRunPassed({ ...native, tempRemoved: false }), false);
  assert.equal(preflightRunPassed({ ...native, protectedFileUnchanged: false }), false);
});

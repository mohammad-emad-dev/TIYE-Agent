'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { deniedProfileSnapshot, deniedProfileMeasurementPassed } = require('../scripts/denied-profile-evidence');
const task = { expectedAction: 'read', prompt: 'read the protected fixture once', canary: 'TIYE_DENIED_PROFILE_random-private-value' };
const cwd = path.resolve('fixture-project');
const user = { type: 'user', text: task.prompt, time: { created: 11 } };
const tool = { type: 'tool', name: 'read', state: { status: 'error', input: { path: 'protected.txt' }, error: { type: 'permission.rejected' } } };
const assistant = { type: 'assistant', time: { created: 12, completed: 13 }, content: [tool] };
const snapshot = (messages, pending = [], otherTask = task) => deniedProfileSnapshot({ messages, pending, task: otherTask, cwd, submittedAt: 10, createdAt: 9 });

test('native denial needs the actual intended call and cannot be inferred from prose, scanner errors or another resource', () => {
  assert.equal(snapshot([user, assistant]).outcome, 'native-denial');
  const candidates = [
    { ...assistant, content: [{ type: 'text', text: 'Permission rejected' }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, error: { type: 'ShellScannerError' } } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, status: 'completed' } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, input: { path: '../outside/protected.txt' } } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, input: { path: 'protected.txt', unexpected: true } } }] },
    { ...assistant, content: [tool, tool] },
    { ...assistant, error: { type: 'provider.auth', status: 403 } },
  ];
  for (const candidate of candidates) assert.equal(snapshot([user, candidate]).nativeDenialObserved, false);
  assert.equal(snapshot([user, assistant], [{}]).outcome, 'unqualified');
  assert.equal(snapshot([{ ...user, time: { created: 8 } }, assistant]).outcome, 'unqualified');
  assert.equal(snapshot([user, user, assistant]).outcome, 'unqualified');
  assert.equal(snapshot([user, { ...assistant, time: { created: 8, completed: 13 } }]).outcome, 'unqualified');
});

test('provider auth failure before tools is diagnostic evidence, never a native permission denial', () => {
  const blocked = { ...assistant, content: [], error: { type: 'provider.auth', status: 403, message: 'private error details' } };
  const observed = snapshot([user, blocked]);
  assert.equal(observed.outcome, 'provider-blocked');
  assert.equal(observed.nativeDenialObserved, false);
  assert.deepEqual(observed.failure, { category: 'provider.auth', httpStatus: 403 });
  assert.equal(JSON.stringify(observed).includes('private error details'), false);
  for (const error of [{ type: 'provider.auth', status: 429 }, { type: 'other', status: 403 }]) {
    assert.equal(snapshot([user, { ...blocked, error }]).outcome, 'unqualified');
  }
  assert.equal(snapshot([user, { ...assistant, content: [] }]).outcome, 'no-attempt');
});

test('call boundaries cover the exact shell command, search resource and local search directory', () => {
  for (const [expectedAction, input, invalid] of [
    ['shell', { command: 'rtk proxy node marker.js', workdir: '.' }, { command: 'rtk proxy node marker.js', workdir: '../outside' }],
    ['glob', { pattern: 'protected*.txt', path: '.' }, { pattern: '*', path: '.' }],
    ['grep', { pattern: 'TIYE_DENIED_PROFILE_', path: '.', include: 'protected.txt' }, { pattern: 'TIYE_DENIED_PROFILE_', path: '../outside', include: 'protected.txt' }],
  ]) {
    const commandTask = { ...task, expectedAction, command: 'rtk proxy node marker.js', pattern: expectedAction === 'glob' ? 'protected*.txt' : 'TIYE_DENIED_PROFILE_' };
    const candidate = { ...assistant, content: [{ ...tool, name: expectedAction, state: { ...tool.state, input } }] };
    assert.equal(snapshot([user, candidate], [], commandTask).nativeDenialObserved, true);
    candidate.content[0].state.input = invalid;
    assert.equal(snapshot([user, candidate], [], commandTask).nativeDenialObserved, false);
  }
});

test('canary output, unfinished turns, version drift and incomplete cleanup cannot qualify measurement', () => {
  const leak = snapshot([user, { ...assistant, content: [tool, { type: 'text', text: task.canary }] }]);
  assert.equal(leak.noCanaryLeak, false);
  assert.equal(snapshot([user, { ...assistant, time: { created: 12 } }]).completedQuiescent, false);
  const run = structuredClone(require('../evidence/supplements/denied-profiles/c76bec928185266f07395d9d0c19cff7e019408855cac68c874067e4821d654f/2.0.28/denied-profiles.json').runs[0]);
  assert.equal(run.passed, false);
  assert.equal(deniedProfileMeasurementPassed(run), true);
  for (const change of [{ noCanaryLeak: false }, { observationTimedOut: true }, { stableOutcomeTwice: false },
    { serviceVersionAfterCleanup: '2.0.22' }, { permissionsConfirmed: false }, { approvalRepliesSent: 1 },
    { sessionRemoved: false }, { cleanup: { verified: true, jobVerified: false } }]) {
    assert.equal(deniedProfileMeasurementPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  }
  for (const change of [{ protectedFileUnchanged: false }, { commandMarkerAbsent: false }, { tempRemoved: false }, { serverReportCalls: 1 }]) {
    assert.equal(deniedProfileMeasurementPassed({ ...run, ...change }), false);
  }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conversationFingerprint, ownedCrashTarget, recoveryRunPassed } = require('../scripts/recovery-evidence');

test('a crash target must retain the captured creation identity and exclude root or shared service', () => {
  const identity = { ProcessId: 12, Created: '2026-10-13T16:00:00.000Z' };
  const observed = { pid: 12, captured: [identity], current: [identity], rootPID: 10, servicePID: 30 };
  assert.equal(ownedCrashTarget(observed), identity);
  for (const change of [{ pid: 10 }, { pid: 30 }, { pid: undefined }, { servicePID: undefined }, { captured: [] }, { captured: [{ ProcessId: 12 }] }, { current: [] }, { current: [{ ...identity, Created: '2026-10-13T17:00:00.000Z' }] }]) {
    assert.equal(ownedCrashTarget({ ...observed, ...change }), undefined);
  }
});

test('conversation integrity ignores listing order and UI metadata but detects edited or missing turns', () => {
  const user = { id: 'u1', type: 'user', text: 'remember checkpoint', time: { created: 10 } };
  const assistant = { id: 'a1', type: 'assistant', content: [{ type: 'text', text: '{"checkpoint":"old"}' }], model: { id: 'approved' }, time: { created: 11, completed: 12 } };
  const before = conversationFingerprint([user, assistant]);
  assert.equal(conversationFingerprint([{ ...assistant, metadata: { viewed: true } }, user]), before);
  for (const messages of [[user], [user, { ...assistant, content: [{ type: 'text', text: '{"checkpoint":"new"}' }] }], [{ ...user, text: 'changed' }, assistant], [user, { ...assistant, finish: 'error' }]]) assert.notEqual(conversationFingerprint(messages), before);
});

test('resume success requires a crash exit, preserved session/history, fresh input/recall and both client cleanups', () => {
  const base = require('../evidence/permissions-initial.json').runs.find(run => run.caseID === 'ask-shell');
  const recovery = { ...base, cli: { ...base.cli, recoveryObserved: true, seedAccepted: true, seedJsonMatched: true, seedStableIdle: true,
    crashTargetOwned: true, ptyExitObserved: true, ptyExitCode: 1, firstClientCleanup: { verified: true, jobVerified: true },
    historyPreserved: true, sessionIdentityPreserved: true, stoppedAfterClientCrash: true, servicePreservedAcrossCrash: true,
    resumeInputMatched: true, resumeOutputObserved: true, newClientVerified: true, recallAccepted: true, recallJsonMatched: true, recallStableIdle: true,
    noTools: true }, onlyFixtureFilesPresent: true };
  assert.equal(recoveryRunPassed(recovery), true);
  for (const change of [{ ptyExitCode: 0, ptyExitSignal: 0 }, { ptyExitCode: undefined }, { historyPreserved: false }, { sessionIdentityPreserved: false }, { resumeInputMatched: false },
    { newClientVerified: false }, { recallJsonMatched: false }, { noTools: false }, { firstClientCleanup: { verified: false, jobVerified: true } }, { cleanup: { verified: false, jobVerified: true } }]) {
    assert.equal(recoveryRunPassed({ ...recovery, cli: { ...recovery.cli, ...change } }), false);
  }
});

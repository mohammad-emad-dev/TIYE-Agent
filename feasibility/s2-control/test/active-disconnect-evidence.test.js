'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { activePendingSnapshot, cancelledSnapshot, activeDisconnectRunPassed } = require('../scripts/active-disconnect-evidence');
const task = { prompt: 'request command and wait', command: 'rtk proxy node marker.js' };
const pending = { id: 'per1', sessionID: 's1', action: 'shell', resources: [task.command], source: { type: 'tool', messageID: 'a1', id: 't1' } };
const tool = { type: 'tool', id: 't1', name: 'shell', state: { status: 'running', input: { command: task.command } } };
const user = { id: 'u1', type: 'user', text: task.prompt, time: { created: 10 } };
const assistant = { id: 'a1', type: 'assistant', content: [tool], time: { created: 11 } };
const input = { messages: [user, assistant], requests: [pending], sessionID: 's1', task, cwd: 'D:/disposable' };

test('active work requires the exact owned pending request and an unfinished correlated tool turn', () => {
  assert.equal(activePendingSnapshot(input).activePending, true);
  for (const change of [{ requests: [] }, { requests: [{ ...pending, sessionID: 'other' }] },
    { messages: [user, { ...assistant, time: { created: 11, completed: 12 } }] },
    { messages: [user, { ...assistant, content: [{ ...tool, state: { ...tool.state, status: 'completed' } }] }] },
  ]) assert.equal(activePendingSnapshot({ ...input, ...change }).activePending, false);
});

test('cancellation requires original tool abort, completed turns and no permissions; provider failures do not count', () => {
  const aborted = { ...tool, state: { ...tool.state, status: 'error', error: { type: 'aborted' } } };
  const messages = [user, { ...assistant, finish: 'error', error: { type: 'aborted' }, time: { created: 11, completed: 20 }, content: [aborted] }];
  const request = { messages, pending: [], createdAt: 9, originalToolID: 't1', snapshot: activePendingSnapshot({ ...input, messages, requests: [] }) };
  assert.equal(cancelledSnapshot(request), true);
  for (const change of [{ originalToolID: 'other' }, { pending: [pending] }, { createdAt: 21 }]) assert.equal(cancelledSnapshot({ ...request, ...change }), false);
  const failed = { ...messages[1], error: { type: 'ProviderError' }, content: [{ ...aborted, state: { ...aborted.state, error: { type: 'ProviderError' } } }] };
  assert.equal(cancelledSnapshot({ ...request, messages: [user, failed], snapshot: activePendingSnapshot({ ...input, messages: [user, failed], requests: [] }) }), false);
});

test('a disconnect cannot pass when client exit already cancelled work or owned interruption did not act', () => {
  const baseline = require('../evidence/client-recovery-first.json').run;
  const observed = { ...baseline, commandMarkerAbsent: true, cli: { ...baseline.cli, activeDisconnectObserved: true,
    pendingBeforeCrashTwice: true, pendingAfterCrashTwice: true, originalOperationPreserved: true, interruptAccepted: true,
    secondInterruptInactive: true, cancelledStableTwice: true, cancelledToolType: 'aborted', markerAbsentBeforeCrash: true,
    markerAbsentAfterCrash: true, markerAbsentAfterCancel: true, approvalRepliesSent: 0 } };
  assert.equal(activeDisconnectRunPassed(observed), true);
  for (const change of [{ pendingAfterCrashTwice: false }, { originalOperationPreserved: false }, { interruptAccepted: false }, { secondInterruptInactive: false },
    { cancelledStableTwice: false }, { cancelledToolType: 'ProviderError' }, { markerAbsentAfterCancel: false }, { approvalRepliesSent: 1 }, { cleanup: { verified: false } }]) {
    assert.equal(activeDisconnectRunPassed({ ...observed, cli: { ...observed.cli, ...change } }), false);
  }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approvalSnapshot, approvalOutcome } = require('../scripts/approval-evidence');
const cwd = 'D:/disposable';
const task = { prompt: 'run twice', command: 'rtk proxy node marker.js' };
const user = { type: 'user', text: task.prompt };
const call = (id, status) => ({ type: 'tool', id, name: 'shell', state: { status, input: { command: task.command }, ...(status === 'error' ? { error: { type: 'aborted' } } : {}) } });
const pending = { id: 'per2', sessionID: 's1', action: 'shell', resources: [task.command], source: { type: 'tool', messageID: 'a1', id: 't2' } };
const snapshot = (tools, requests = []) => approvalSnapshot({ messages: [user, { type: 'assistant', id: 'a1', content: tools }], requests, sessionID: 's1', task, cwd });

test('an approval cannot authorize a mismatched command, foreign cwd, tool or session', () => {
  assert.equal(snapshot([call('t2', 'running')], [pending]).evidence.correlatedPending, true);
  for (const invalid of [{ ...pending, sessionID: 'other' }, { ...pending, source: { ...pending.source, id: 'other' } }, { ...pending, resources: ['different'] }]) {
    assert.equal(snapshot([call('t2', 'running')], [invalid]).request, undefined);
  }
  for (const input of [{ command: 'different' }, { command: task.command, workdir: 'D:/elsewhere' }, { command: task.command, unexpected: true }]) {
    const tool = { ...call('t2', 'running'), state: { status: 'running', input } };
    assert.equal(snapshot([tool], [pending]).request, undefined);
  }
});

test('once requires original completion and a distinct second pending request for the same command', () => {
  const options = { snapshot: snapshot([call('t1', 'completed'), call('t2', 'running')], [pending]), decision: 'once', originalToolID: 't1', originalRequestID: 'per1', replyAccepted: true, pendingObservedTwice: true };
  assert.equal(approvalOutcome(options), true);
  for (const change of [{ replyAccepted: false }, { pendingObservedTwice: false }, { originalToolID: 't2' }, { originalRequestID: 'per2' }, { decision: 'always' }]) assert.equal(approvalOutcome({ ...options, ...change }), false);
  for (const candidate of [snapshot([call('t1', 'completed'), call('t2', 'completed')]), snapshot([call('t1', 'error'), call('t2', 'running')], [pending]), snapshot([call('t1', 'completed')])]) assert.equal(approvalOutcome({ ...options, snapshot: candidate }), false);
});

test('reject requires the replied-to tool to error, approval removal and a completed terminal turn', () => {
  const options = { snapshot: snapshot([call('t1', 'error')]), decision: 'reject', originalToolID: 't1', originalRequestID: 'per1', replyAccepted: true, stableTerminal: true };
  assert.equal(approvalOutcome(options), true);
  for (const change of [{ stableTerminal: false }, { replyAccepted: false }, { originalToolID: 'different' }]) assert.equal(approvalOutcome({ ...options, ...change }), false);
  for (const candidate of [snapshot([call('t1', 'completed')]), snapshot([call('t1', 'error')], [pending]), snapshot([call('t1', 'error'), call('retry', 'running')])]) assert.equal(approvalOutcome({ ...options, snapshot: candidate }), false);
  const unrelated = { ...call('t1', 'error'), state: { ...call('t1', 'error').state, error: { type: 'ProviderError' } } };
  assert.equal(approvalOutcome({ ...options, snapshot: snapshot([unrelated]) }), false);
});

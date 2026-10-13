'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { controlEvidence } = require('../scripts/control-evidence');
const { permissionRunPassed } = require('../scripts/permission-evidence');
const cwd = 'D:/disposable';

test('allowed edit requires exact target and replacement, completed operation and no fallback', () => {
  const task = { caseID: 'allow-edit-control', prompt: 'edit the editable file' };
  const tool = { type: 'tool', name: 'edit', state: { status: 'completed', input: { path: 'editable.txt', oldString: 'original editable bytes', newString: 'changed editable bytes' } } };
  const run = (candidate, requests = []) => controlEvidence({ messages: [{ type: 'user', text: task.prompt }, { type: 'assistant', content: candidate }], requests, task, cwd });
  assert.equal(run([tool]).permissionObserved, true);
  for (const candidate of [[], [{ type: 'text', text: 'Done' }], [tool, tool], [tool, { type: 'tool', name: 'read' }],
    [{ ...tool, state: { ...tool.state, status: 'error' } }],
    ...[{ path: 'protected.txt' }, { path: '../other/editable.txt' }, { oldString: 'different' }, { newString: 'original editable bytes' }].map(input => [{ ...tool, state: { ...tool.state, input: { ...tool.state.input, ...input } } }]),
  ]) assert.equal(run(candidate).permissionObserved, false);
  assert.equal(run([tool], [{ id: 'per1' }]).permissionObserved, false);
});

test('shell allow control rejects wrong command, external directory, unfinished calls and provider errors', () => {
  const task = { caseID: 'auto-shell', prompt: 'run once', command: 'rtk proxy node marker.js' };
  const tool = { type: 'tool', name: 'shell', state: { status: 'completed', input: { command: task.command } } };
  const observed = { messages: [{ type: 'user', text: task.prompt }, { type: 'assistant', content: [tool] }], requests: [], task, cwd };
  assert.equal(controlEvidence(observed).permissionObserved, true);
  for (const input of [{ command: 'different' }, { command: task.command, workdir: 'D:/elsewhere' }, { command: task.command, unknown: true }]) {
    assert.equal(controlEvidence({ ...observed, messages: [observed.messages[0], { type: 'assistant', content: [{ ...tool, state: { ...tool.state, input } }] }] }).permissionObserved, false);
  }
  for (const status of ['running', 'error']) assert.equal(controlEvidence({ ...observed, messages: [observed.messages[0], { type: 'assistant', content: [{ ...tool, state: { ...tool.state, status } }] }] }).permissionObserved, false);
  assert.equal(controlEvidence({ ...observed, messages: [observed.messages[0], { ...observed.messages[1], error: { type: 'ProviderError' } }] }).permissionObserved, false);
});

test('permissive controls cannot pass with missing files, an approval, replies or failed cleanup', () => {
  const base = require('../evidence/permissions-initial.json').runs.find(run => run.caseID === 'ask-shell');
  const control = { ...base, editableFileMatched: true, cli: { ...base.cli, stableIdle: true, approvalRepliesSent: 0, pendingEverObserved: false, fileBeforeStopMatched: true } };
  assert.equal(permissionRunPassed({ run: control, caseID: 'allow-edit-control' }), true);
  assert.equal(permissionRunPassed({ run: { ...control, editableFileMatched: false }, caseID: 'allow-edit-control' }), false);
  for (const change of [{ approvalRepliesSent: 1 }, { pendingEverObserved: true }, { fileBeforeStopMatched: false }, { sessionRemoved: false }]) {
    assert.equal(permissionRunPassed({ run: { ...control, cli: { ...control.cli, ...change } }, caseID: 'allow-edit-control' }), false);
  }
  const shell = { ...control, commandMarkerAbsent: false, commandMarkerMatched: true };
  assert.equal(permissionRunPassed({ run: shell, caseID: 'auto-shell' }), true);
  assert.equal(permissionRunPassed({ run: { ...shell, commandMarkerMatched: false }, caseID: 'auto-shell' }), false);
});

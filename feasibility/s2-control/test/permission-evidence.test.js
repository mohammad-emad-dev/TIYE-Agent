'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { permissionEvidence: evidenceFor, permissionRunPassed } = require('../scripts/permission-evidence');
const permissionEvidence = (messages, requests, sessionID, task) => evidenceFor({ messages, requests, sessionID, task });

test('edit denial requires an actual permission error and rejects prose or scanner failures', () => {
  const task = { caseID: 'deny-edit', prompt: 'edit the protected file' };
  const user = { type: 'user', text: task.prompt };
  const tool = { type: 'tool', id: 't1', name: 'edit', state: { status: 'error', input: { path: 'protected.txt' }, error: { type: 'permission.rejected' } } };
  const assistant = { type: 'assistant', id: 'a1', content: [tool] };
  assert.equal(permissionEvidence([user, assistant], [], 's1', task).permissionObserved, true);
  const rejected = [
    { ...assistant, content: [{ type: 'text', text: 'Permission denied, I cannot edit.' }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, error: { type: 'ShellScannerError' } } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, error: { type: 'PermissionDeniedError' } } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, input: { path: 'other.txt' } } }] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, input: { path: '../other/protected.txt' } } }] },
    { ...assistant, content: [tool, { type: 'tool', name: 'shell', state: { status: 'completed' } }] },
    { ...assistant, error: { type: 'ProviderError', status: 403 } },
    { ...assistant, content: [{ ...tool, state: { status: 'completed' } }] },
  ];
  for (const candidate of rejected) assert.equal(permissionEvidence([user, candidate], [], 's1', task).permissionObserved, false);
});

test('shell approval must belong to the accepted prompt, session and exact running tool', () => {
  const task = { caseID: 'ask-shell', command: 'rtk proxy node marker.js', prompt: 'request shell' };
  const tool = { type: 'tool', id: 't1', name: 'shell', state: { status: 'running', input: { command: task.command } } };
  const messages = [{ type: 'user', text: task.prompt }, { type: 'assistant', id: 'a1', content: [tool] }];
  const request = { id: 'per1', sessionID: 's1', action: 'shell', resources: [task.command], source: { type: 'tool', messageID: 'a1', id: 't1' } };
  assert.equal(permissionEvidence(messages, [request], 's1', task).permissionObserved, true);
  const rejected = [
    { ...request, sessionID: 'other' }, { ...request, action: 'edit' },
    { ...request, resources: ['different command'] }, { ...request, source: undefined },
    { ...request, source: { ...request.source, messageID: 'stale' } },
    { ...request, source: { ...request.source, id: 'another tool' } },
  ];
  for (const candidate of rejected) assert.equal(permissionEvidence(messages, [candidate], 's1', task).permissionObserved, false);
  assert.equal(permissionEvidence(messages, [], 's1', task).permissionObserved, false);
  assert.equal(permissionEvidence(messages, [request, request], 's1', task).permissionObserved, false);
  assert.equal(permissionEvidence([{ type: 'user', text: 'different' }, messages[1]], [request], 's1', task).permissionObserved, false);
  for (const status of ['completed', 'error']) {
    const finished = { ...messages[1], content: [{ ...tool, state: { ...tool.state, status } }] };
    assert.equal(permissionEvidence([messages[0], finished], [request], 's1', task).permissionObserved, false);
  }
});

test('a pending approval cannot pass after timeout, incomplete observation, cleanup failure or file mutation', () => {
  const runs = require('../evidence/permissions-initial.json').runs;
  const approvedGate = runs.find(run => run.caseID === 'ask-shell');
  assert.equal(permissionRunPassed({ run: approvedGate, caseID: 'ask-shell' }), true);
  assert.equal(permissionRunPassed({ run: approvedGate, caseID: 'unknown-case' }), false);
  for (const change of [{ observationTimedOut: true }, { pendingObservedTwice: false }, { sessionRemoved: false }, { cleanup: { verified: false, jobVerified: true } }]) {
    assert.equal(permissionRunPassed({ run: { ...approvedGate, cli: { ...approvedGate.cli, ...change } }, caseID: 'ask-shell' }), false);
  }
  for (const change of [{ protectedFileUnchanged: false }, { commandMarkerAbsent: false }, { tempRemoved: false }]) {
    assert.equal(permissionRunPassed({ run: { ...approvedGate, ...change }, caseID: 'ask-shell' }), false);
  }
  assert.equal(permissionRunPassed({ run: runs.find(run => run.caseID === 'deny-edit'), caseID: 'deny-edit' }), false);
});

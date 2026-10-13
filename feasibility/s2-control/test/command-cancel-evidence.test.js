'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commandIdentities, sameCommandIdentities, commandProcessesGone, heartbeatGrowth, executingSnapshot, cancelledSnapshot, commandCancelRunPassed } = require('../scripts/command-cancel-evidence');
const cwd = 'C:/owned/project', nonce = 'a'.repeat(32), submittedAt = Date.parse('2026-10-13T18:00:00Z');
const service = { ProcessId: 100, ParentProcessId: 1, Created: '2026-10-13T17:00:00Z' };
const root = { ProcessId: 200, ParentProcessId: 100, Created: '2026-10-13T18:00:01Z' };
const child = { ProcessId: 201, ParentProcessId: 200, Created: '2026-10-13T18:00:02Z' };
const markers = { root: { role: 'root', nonce, pid: 200, parentPID: 100 }, child: { role: 'child', nonce, pid: 201, parentPID: 200 } };
const identities = { markers, nonce, submittedAt, servicePID: 100, forbiddenPIDs: [300], inventory: [service, child, root] };
const task = { prompt: 'run the fixture once', command: 'rtk proxy node execution-fixture.cjs root nonce' };
const user = { type: 'user', text: task.prompt, time: { created: submittedAt + 1 } };
const tool = { type: 'tool', id: 't1', name: 'shell', state: { status: 'running', input: { command: task.command, workdir: cwd } } };
const assistant = { type: 'assistant', id: 'a1', time: { created: submittedAt + 2 }, content: [tool] };
const operation = { messages: [user, assistant], pending: [], sessionID: 'ses_owned', cwd, task, originalToolID: 't1', submittedAt };

test('execution ownership requires run-bound root and child identities under the service, excluding protected processes', () => {
  assert.deepEqual(commandIdentities(identities).map(entry => entry.ProcessId).sort(), [200, 201]);
  const changes = [
    { markers: { ...markers, root: { ...markers.root, nonce: 'wrong' } } },
    { markers: { ...markers, child: { ...markers.child, parentPID: 1 } } },
    { markers: { ...markers, child: { ...markers.child, pid: 202 } } },
    { inventory: [service, child, { ...root, Created: '2026-10-13T17:00:00Z' }] },
    { inventory: [service, child, { ...root, Created: 'invalid' }] },
    { inventory: [service, { ...child, Created: '2026-10-13T18:00:00Z' }, root] },
    { inventory: [service, child, { ...root, ParentProcessId: 1 }] },
    { forbiddenPIDs: [201] }, { servicePID: 200 }
  ];
  for (const change of changes) assert.equal(commandIdentities({ ...identities, ...change }), undefined);
});

test('PID reuse cannot establish ongoing execution; cancellation requires both captured creations gone', () => {
  const captured = [root, child];
  assert.equal(sameCommandIdentities(captured, [service, root, child]), true);
  assert.equal(sameCommandIdentities(captured, [root, { ...child, Created: '2026-10-13T18:00:03Z' }]), false);
  assert.equal(sameCommandIdentities(captured, [{ ...root, ParentProcessId: 1 }, child]), false);
  assert.equal(commandProcessesGone(captured, [service]), true);
  assert.equal(commandProcessesGone(captured, [service, root]), false);
  assert.equal(commandProcessesGone(captured, [{ ...root, Created: '2026-10-13T18:00:03Z' }]), true);
  assert.equal(commandProcessesGone([], []), false);
});

test('both command heartbeats must increase; a pending approval or unrelated tool is not executing proof', () => {
  assert.equal(heartbeatGrowth({ root: 1, child: 1 }, { root: 2, child: 2 }), true);
  for (const after of [{ root: 2, child: 1 }, { root: 1, child: 2 }, { root: 0, child: 2 }, { root: 2 }]) assert.equal(heartbeatGrowth({ root: 1, child: 1 }, after), false);
  assert.equal(executingSnapshot(operation).executing, true);
  const withTool = changed => [{ ...assistant, content: [changed] }];
  for (const change of [{ originalToolID: 'other' }, { pending: [{ sessionID: 'ses_owned' }] },
    { messages: [{ ...user, time: { created: submittedAt - 1 } }, assistant] },
    { messages: [user, { ...assistant, time: { created: submittedAt + 2, completed: submittedAt + 3 } }] },
    { messages: [user, ...withTool({ ...tool, state: { ...tool.state, status: 'completed' } })] },
    { messages: [user, ...withTool({ ...tool, state: { ...tool.state, input: { command: 'different' } } })] },
    { messages: [user, ...withTool({ ...tool, state: { ...tool.state, input: { command: task.command, workdir: 'C:/elsewhere' } } })] },
    { messages: [user, { ...assistant, content: [tool, { ...tool, id: 't2' }] }] }
  ]) assert.equal(executingSnapshot({ ...operation, ...change }).executing, false);
});

test('provider failure or completed command cannot satisfy the original cancelled-tool snapshot', () => {
  const aborted = { ...assistant, finish: 'error', error: { type: 'aborted' }, time: { ...assistant.time, completed: submittedAt + 10 },
    content: [{ ...tool, state: { ...tool.state, status: 'error', error: { type: 'aborted' } } }] };
  const matched = messages => cancelledSnapshot({ snapshot: executingSnapshot({ ...operation, messages }), messages, pending: [], createdAt: submittedAt, originalToolID: 't1' });
  assert.equal(matched([user, aborted]), true);
  for (const change of [{ error: { type: 'ProviderError' } },
    { content: [{ ...tool, state: { ...tool.state, status: 'completed' } }] },
    { content: [{ ...tool, id: 'other', state: aborted.content[0].state }] }
  ]) assert.equal(matched([user, { ...aborted, ...change }]), false);
});

test('tool cancellation cannot pass without independent process, heartbeat and final cleanup evidence', () => {
  const baseline = require('../evidence/active-disconnect-latest.json').run;
  const observed = { ...baseline, commandProcessesGoneAfterCleanup: true, heartbeatsStableAfterCleanup: true, commandMarkersUnchanged: true,
    completionMarkersAbsentAfterCleanup: true, scriptUnchanged: true, cli: { ...baseline.cli,
      commandCancelObserved: true, pendingBeforeApprovalTwice: true, replyAccepted: true, approvalRepliesSent: 1, executingTwice: true,
      commandIdentityVerified: true, bothHeartbeatsGrew: true, commandProcessesGoneTwice: true, heartbeatsStableTwice: true,
      completionMarkersAbsent: true, fallbackTerminationUsed: false, serviceIdentityPreserved: true } };
  assert.equal(commandCancelRunPassed(observed), true);
  for (const change of [{ commandProcessesGoneAfterCleanup: false }, { heartbeatsStableAfterCleanup: false }, { scriptUnchanged: false }, { commandMarkersUnchanged: false }, { tempRemoved: false }]) {
    assert.equal(commandCancelRunPassed({ ...observed, ...change }), false);
  }
  for (const change of [{ executingTwice: false }, { bothHeartbeatsGrew: false }, { commandProcessesGoneTwice: false }, { heartbeatsStableTwice: false },
    { completionMarkersAbsent: false }, { fallbackTerminationUsed: true }, { commandCleanupError: 'unverified' }, { interruptAccepted: false }, { approvalRepliesSent: 0 },
    { locationEvicted: false }, { serviceIdentityUnchanged: false }, { executedModelConfirmed: false }]) {
    assert.equal(commandCancelRunPassed({ ...observed, cli: { ...observed.cli, ...change } }), false);
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { TaskStore, approvalBinding } = require('../dist');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { session, plan, witness } = require('./mock-fixtures.cjs');

function enqueue(store, setup, memberId) {
  const task = command(); store.execute(bytes(task));
  const request = { type: 'team.task.enqueue', version: 1, commandId: randomUUID(),
    sessionId: setup.sessionId, taskId: task.taskId, memberId };
  return { request, result: store.member(setup.leaderId).enqueue(bytes(request)) };
}
function start(setup, queued) {
  return { type: 'team.task.start', version: 1, sessionId: setup.sessionId, memberId: queued.memberId,
    ...plan({ taskId: queued.taskId, expiresAt: Date.now() + 180000 }) };
}

test('closing 100 assignments frees occupancy but never restores the lifetime assignment budget', t => {
  const root = privateRoot(t), setup = session({ maxConcurrent: 1 });
  let store = TaskStore.createEngine(root), firstReport;
  try {
    store.owner().createSession(bytes(setup));
    const memberId = setup.members[1].memberId;
    for (let index = 0; index < 100; index++) {
      const queued = enqueue(store, setup, memberId); assert.equal(queued.result, 'accepted');
      const planned = start(setup, queued.request); assert.equal(store.scheduler().start(bytes(planned)), 'accepted');
      store.cancel(planned.effectId);
      const report = { type: 'team.task.report', version: 1, commandId: randomUUID(), sessionId: setup.sessionId,
        taskId: planned.taskId, status: 'failed', summary: 'Cancelled before dispatch' };
      assert.equal(store.member(memberId).report(bytes(report)), 'accepted');
      firstReport ??= report;
    }
    assert.equal(store.snapshot().assignments.length, 100);
    assert(store.snapshot().assignments.every(([, row]) => row.closed && row.remainingEvents === 0));
    assert(store.registry().every(row => row.state === 'failed'));
    assert.deepEqual(store.member(memberId).inbox(), { memberId, queuedTaskIds: [], activeTaskId: null });
    const excess = enqueue(store, setup, memberId); assert.equal(excess.result, 'rejected');
    assert.equal(store.registry().at(-1).state, 'created');
    const expected = store.snapshot(); store.close(); store = TaskStore.openEngine(root);
    assert.deepEqual(store.snapshot(), expected);
    assert.equal(store.member(memberId).report(bytes(firstReport)), 'accepted');
    assert.equal(store.member(setup.leaderId).enqueue(bytes(excess.request)), 'rejected');
    assert.deepEqual(store.snapshot(), expected);
    assert.equal(store.member(setup.leaderId).enqueue(bytes({ ...excess.request, commandId: randomUUID() })), 'rejected');
    assert.equal(store.snapshot().assignments.length, 100);
  } finally { store.close(); }
});

test('one mixed-work stop cancels queued and planned tasks while preserving dispatched uncertainty', t => {
  for (const recovered of [false, true]) {
    const root = privateRoot(t), setup = session(); let store = TaskStore.createEngine(root);
    try {
      store.owner().createSession(bytes(setup));
      const dispatched = start(setup, enqueue(store, setup, setup.members[1].memberId).request);
      const planned = start(setup, enqueue(store, setup, setup.leaderId).request);
      const queued = enqueue(store, setup, setup.members[1].memberId).request;
      assert.equal(store.scheduler().start(bytes(dispatched)), 'accepted');
      assert.equal(store.scheduler().start(bytes(planned)), 'accepted');
      store.approve(dispatched.effectId, approvalBinding(dispatched));
      const invocation = store.claim(dispatched.effectId), writtenRoot = privateRoot(t), emptyRoot = privateRoot(t);
      witness('create', writtenRoot, dispatched); witness('create', emptyRoot, planned);
      witness('write', writtenRoot, dispatched, invocation);
      if (recovered) {
        store.close(); store = TaskStore.openEngine(root);
        assert.equal(store.owner().recover(bytes({ type: 'team.session.recover', version: 1,
          commandId: randomUUID(), sessionId: setup.sessionId })), 'accepted');
      }
      const before = store.snapshot(), budget = new Map(before.assignments).get(dispatched.taskId).remainingEvents;
      const stop = { type: 'team.session.stop', version: 1, commandId: randomUUID(), sessionId: setup.sessionId };
      assert.equal(store.owner().stop(bytes(stop)), 'accepted');
      const after = store.snapshot(), assignments = new Map(after.assignments), tasks = new Map(after.tasks);
      assert.equal(after.commands.length, before.commands.length + 1);
      assert.equal(tasks.get(queued.taskId), 'cancelled'); assert.equal(tasks.get(planned.taskId), 'cancelled');
      assert.equal(tasks.get(dispatched.taskId), 'needs_attention');
      assert.equal(assignments.get(queued.taskId).remainingEvents, 0); assert.equal(assignments.get(planned.taskId).closed, true);
      assert.equal(assignments.get(dispatched.taskId).closed, false); assert.equal(assignments.get(dispatched.taskId).remainingEvents, budget);
      assert.throws(() => store.claim(planned.effectId), /mock-already-claimed-or-stopped/);
      assert.throws(() => store.claim(dispatched.effectId), /mock-already-claimed-or-stopped/);
      assert.equal(store.scheduler().start(bytes(start(setup, queued))), 'rejected');
      const proof = witness('observe', writtenRoot, dispatched, { effectId: dispatched.effectId, attemptId: dispatched.attemptId });
      assert.equal(proof.rows.length, 1);
      assert.equal(witness('observe', emptyRoot, planned, { effectId: planned.effectId, attemptId: planned.attemptId }).rows.length, 0);
      const attention = store.attention(dispatched.effectId);
      store.close(); store = TaskStore.openEngine(root); assert.deepEqual(store.attention(dispatched.effectId), attention);
      assert.equal(store.owner().stop(bytes(stop)), 'accepted');
      assert.equal(store.resolve({ commandId: randomUUID(), ...attention, outcome: 'confirm_completed' }, bytes(proof)), 'accepted');
      assert(store.snapshot().assignments.every(([, row]) => row.closed && row.remainingEvents === 0));
      assert(store.registry().every(row => row.state === 'cancelled'));
      assert.equal(witness('observe', writtenRoot, dispatched, { effectId: dispatched.effectId, attemptId: dispatched.attemptId }).rows.length, 1);
    } finally { store.close(); }
  }
});

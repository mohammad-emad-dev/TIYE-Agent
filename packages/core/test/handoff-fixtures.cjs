'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { TaskStore, approvalBinding } = require('../dist');
const { bytes, privateRoot } = require('./helpers.cjs');
const { session, plan } = require('./mock-fixtures.cjs');
const { startTask, complete, report } = require('./question-fixtures.cjs');
function fixture(t, setup = session()) {
  const root = privateRoot(t), store = TaskStore.createHandoffEngine(root);
  store.owner().createSession(bytes(setup)); return { root, store, setup };
}
function observe(f, planned) {
  const command = { type: 'team.task.failure', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    taskId: planned.taskId, memberId: planned.memberId, attemptId: planned.attemptId, reason: 'crash', summary: 'Private synthetic failure detail' };
  assert.equal(f.store.owner().observeFailure(bytes(command)), 'accepted'); return command;
}
function failed(t, f, options = {}) { const planned = startTask(f, options); observe(f, planned); return planned; }
function request(f, predecessor, changes = {}) {
  return { type: 'team.task.handoff', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    predecessorTaskId: predecessor.taskId, successorTaskId: randomUUID(), targetMemberId: predecessor.memberId,
    title: 'Explicit successor work', ...changes };
}
function handoff(f, command) { return f.store.member(f.setup.leaderId).handoff(bytes(command)); }
function queuedPlan(f, command, changes = {}) {
  return { type: 'team.task.start', version: 1, sessionId: f.setup.sessionId, memberId: command.targetMemberId,
    ...plan({ taskId: command.successorTaskId, expiresAt: Date.now() + 180000 }), ...changes };
}
function start(f, command, approved = false) {
  const planned = queuedPlan(f, command); assert.equal(f.store.scheduler().start(bytes(planned)), 'accepted');
  if (approved) f.store.approve(planned.effectId, approvalBinding(planned)); return planned;
}
function finish(t, f, planned) {
  const observed = complete(t, f, planned); assert.equal(f.store.member(planned.memberId).report(bytes(report(f, planned))), 'accepted');
  return observed;
}
function mission(f) {
  return f.store.member(f.setup.leaderId).completeMission(bytes({ type:'team.mission.complete', version:1,
    commandId:randomUUID(), sessionId:f.setup.sessionId, summary:'All work explicitly completed including recovery chains' }));
}
module.exports = { fixture, observe, failed, request, handoff, queuedPlan, start, finish, mission };

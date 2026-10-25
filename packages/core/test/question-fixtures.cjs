'use strict';
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { TaskStore, approvalBinding } = require('../dist');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { session, plan, witness } = require('./mock-fixtures.cjs');

function fixture(t, setup = session()) {
  const root = privateRoot(t), store = TaskStore.createQuestionEngine(root);
  assert.equal(store.owner().createSession(bytes(setup)), 'accepted');
  return { root, store, setup };
}
function enqueue(f, memberId = f.setup.members[1].memberId) {
  const task = command(); f.store.execute(bytes(task));
  const queued = { type: 'team.task.enqueue', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId, taskId: task.taskId, memberId };
  assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes(queued)), 'accepted');
  return { type: 'team.task.start', version: 1, sessionId: f.setup.sessionId, memberId, ...plan({ taskId: task.taskId, expiresAt: Date.now() + 180000 }) };
}
function startTask(f, options = {}) {
  const planned = enqueue(f, options.memberId); if (options.expiresAt !== undefined) planned.expiresAt = options.expiresAt;
  assert.equal(f.store.scheduler().start(bytes(planned)), 'accepted');
  if (options.approved) f.store.approve(planned.effectId, approvalBinding(planned));
  return planned;
}
function ask(f, planned, changes = {}) {
  return { type: 'team.question.ask', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    taskId: planned.taskId, questionId: randomUUID(), text: 'Which approach should continue?', options: ['Option A', 'Option B'], ...changes };
}
function escalate(question) {
  return { type: 'team.question.escalate', version: 1, commandId: randomUUID(), sessionId: question.sessionId, questionId: question.questionId };
}
function answer(question, response = { kind: 'text', text: 'Continue with the reviewed choice' }) {
  return { type: 'team.question.answer', version: 1, commandId: randomUUID(), sessionId: question.sessionId, questionId: question.questionId, answer: response };
}
function report(f, planned, status = 'done') {
  return { type: 'team.task.report', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    taskId: planned.taskId, status, summary: 'Explicit synthetic result' };
}
function ownerCommand(f, type = 'team.session.stop') {
  return { type, version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId };
}
function observer(t, planned) {
  const root = privateRoot(t); witness('create', root, planned);
  return { root, observe: () => witness('observe', root, planned, { effectId: planned.effectId, attemptId: planned.attemptId }) };
}
function complete(t, f, planned) {
  const observed = observer(t, planned), invocation = f.store.claim(planned.effectId);
  witness('write', observed.root, planned, invocation); const proof = observed.observe();
  f.store.settle(planned.effectId, bytes(proof)); return { ...observed, proof };
}
module.exports = { fixture, enqueue, startTask, ask, escalate, answer, report, ownerCommand, observer, complete };

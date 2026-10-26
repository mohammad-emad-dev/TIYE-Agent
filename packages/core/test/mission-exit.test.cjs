'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { TaskStore } = require('../dist');
const { bytes, privateRoot } = require('./helpers.cjs');
const { session } = require('./mock-fixtures.cjs');
const { startTask, ask, escalate, answer, complete, report } = require('./question-fixtures.cjs');

test('completed mission preserves both answered question routes and refuses fresh start reply escalation and resolution', t => {
  const root = privateRoot(t), setup = session(), f = { root, setup, store: TaskStore.createMissionEngine(root) };
  try {
    f.store.owner().createSession(bytes(setup));
    const questions = [], witnesses = [], starts = [], reports = [], escalations = [], answers = [];
    for (const memberId of [setup.members[1].memberId, setup.leaderId]) {
      const planned = startTask(f, { memberId, approved: true }), question = ask(f, planned);
      starts.push(planned); questions.push(question);
      assert.equal(f.store.member(memberId).ask(bytes(question)), 'accepted');
      if (memberId !== setup.leaderId) {
        const cmd = escalate(question); escalations.push(cmd);
        assert.equal(f.store.member(setup.leaderId).escalate(bytes(cmd)), 'accepted');
      }
      const reply = answer(question); answers.push(reply);
      assert.equal(f.store.owner().answer(bytes(reply)), 'accepted');
      witnesses.push(complete(t, f, planned));
      const result = report(f, planned); reports.push(result);
      assert.equal(f.store.member(memberId).report(bytes(result)), 'accepted');
    }
    const before = f.store.snapshot(), cmd = { type: 'team.mission.complete', version: 1,
      commandId: randomUUID(), sessionId: setup.sessionId, summary: 'Both question routes explicitly answered and all tasks done' };
    assert.equal(f.store.member(setup.leaderId).completeMission(bytes(cmd)), 'accepted');
    assert.deepEqual(f.store.snapshot().questions, before.questions);
    for (const planned of starts) {
      assert.equal(f.store.scheduler().start(bytes({ ...planned, commandId: randomUUID() })), 'rejected');
      assert.equal(f.store.scheduler().start(bytes(planned)), 'accepted');
      assert.equal(f.store.resolve({ commandId: randomUUID(), effectId: planned.effectId,
        attemptId: planned.attemptId, attentionSequence: 1, outcome: 'close_uncertain' }), 'rejected');
    }
    for (const question of questions) {
      assert.equal(f.store.member(setup.leaderId).escalate(bytes(escalate(question))), 'rejected');
      assert.equal(f.store.owner().answer(bytes(answer(question))), 'rejected');
      assert.equal(f.store.member(setup.leaderId).answer(bytes(answer(question))), 'rejected');
    }
    const afterRejections = f.store.snapshot();
    for (const key of ['tasks', 'effects', 'assignments', 'questions', 'approvals']) assert.deepEqual(afterRejections[key], before[key]);
    assert.equal(f.store.owner().mission().status, 'completed');
    f.store.close(); f.store = TaskStore.openMissionEngine(root);
    assert.deepEqual(f.store.snapshot(), afterRejections);
    for (let index = 0; index < starts.length; index++) {
      assert.equal(f.store.member(starts[index].memberId).ask(bytes(questions[index])), 'accepted');
      assert.equal(f.store.owner().answer(bytes(answers[index])), 'accepted');
      assert.equal(f.store.member(starts[index].memberId).report(bytes(reports[index])), 'accepted');
      assert.equal(witnesses[index].observe().rows.length, 1);
    }
    assert.equal(f.store.member(setup.leaderId).escalate(bytes(escalations[0])), 'accepted');
    assert.equal(f.store.member(setup.leaderId).completeMission(bytes(cmd)), 'accepted');
    assert.deepEqual(f.store.snapshot(), afterRejections);
    assert.deepEqual(f.store.owner().questions(), before.questions.map(([, { remainingEvents, ...visible }]) => visible));
  } finally { f.store.close(); }
});

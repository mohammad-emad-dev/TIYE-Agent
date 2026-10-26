'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore } = require('../dist');
const { bytes, privateRoot } = require('./helpers.cjs');
const { session, witness } = require('./mock-fixtures.cjs');
const { startTask, observer, ownerCommand } = require('./question-fixtures.cjs');

test('stopped failures reconcile completed and abandoned effects as failed with actual closure sequences and stable retries', t => {
  for (const order of ['stop-first', 'failure-first']) {
    const root = privateRoot(t), setup = session(), f = { root, setup, store: TaskStore.createFailureEngine(root) };
    f.store.owner().createSession(bytes(setup));
    try {
      const plans = [startTask(f, { approved: true }), startTask(f, { memberId: setup.leaderId, approved: true })];
      const observed = plans.map(planned => observer(t, planned));
      plans.forEach((planned, index) => {
        const invocation = f.store.claim(planned.effectId);
        if (index === 0) witness('write', observed[index].root, planned, invocation);
      });
      if (order === 'stop-first') f.store.owner().stop(bytes(ownerCommand(f)));
      const commands = plans.map((planned, index) => ({ type: 'team.task.failure', version: 1,
        commandId: randomUUID(), sessionId: setup.sessionId, taskId: planned.taskId,
        memberId: planned.memberId, attemptId: planned.attemptId, reason: index === 0 ? 'auth' : 'network',
        summary: 'Explicit synthetic task failure' }));
      for (const command of commands) assert.equal(f.store.owner().observeFailure(bytes(command)), 'accepted');
      const attention = plans.map(planned => f.store.attention(planned.effectId));
      if (order === 'failure-first') f.store.owner().stop(bytes(ownerCommand(f)));
      assert.deepEqual(plans.map(planned => f.store.attention(planned.effectId)), attention);
      assert(f.store.snapshot().assignments.every(([, row]) => !row.closed && row.result === null));
      const resolutions = attention.map((row, index) => ({ ...row, commandId: randomUUID(),
        outcome: index === 0 ? 'confirm_completed' : 'close_uncertain' }));
      const proof = bytes(observed[0].observe());
      assert.equal(f.store.resolve(resolutions[0], proof), 'accepted');
      assert.equal(f.store.snapshot().assignments[1][1].closed, false);
      assert.equal(f.store.resolve(resolutions[1]), 'accepted');
      const expected = f.store.snapshot();
      assert(expected.tasks.every(([, state]) => state === 'failed'));
      assert.deepEqual(expected.effects.map(([, row]) => row.state), ['completed', 'abandoned']);
      assert(expected.assignments.every(([, row]) => row.closed && row.result === null && row.remainingEvents === 0));
      assert(expected.failures.every(([, row]) => row.status === 'closed'));
      f.store.close();
      const database = new Database(path.join(root, 'core.sqlite'), { readonly: true });
      try {
        const events = database.prepare('SELECT sequence,type,body FROM events ORDER BY sequence').all();
        for (let index = 0; index < plans.length; index++) {
          const notice = expected.failures[index][1];
          const opening = events.find(row => row.type === 'team.task.failure' && JSON.parse(row.body).command.commandId === commands[index].commandId);
          const closing = events.find(row => row.type === 'resolve' && JSON.parse(row.body).request.commandId === resolutions[index].commandId);
          assert.equal(notice.observedSequence, opening.sequence);
          assert.equal(notice.closedSequence, closing.sequence);
        }
      } finally { database.close(); }
      f.store = TaskStore.openFailureEngine(root);
      assert.deepEqual(f.store.snapshot(), expected);
      for (const command of commands) assert.equal(f.store.owner().observeFailure(bytes(command)), 'accepted');
      assert.equal(f.store.resolve(resolutions[0], proof), 'accepted');
      assert.equal(f.store.resolve(resolutions[1]), 'accepted');
      assert.deepEqual(f.store.snapshot(), expected);
      assert.equal(observed[0].observe().rows.length, 1);
      assert.equal(observed[1].observe().rows.length, 0);
    } finally { f.store.close(); }
  }
});

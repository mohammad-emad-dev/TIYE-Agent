'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore } = require('../dist');
const { fixture, failed, observe, request, handoff, start, finish, mission } = require('./handoff-fixtures.cjs');

test('maximum ten-handoff chain completes with failed history intact and titles FIFO and lineage bound to stored events', t => {
  const f = fixture(t), commands = [];
  let predecessor = failed(t, f), written;
  try {
    for (let index = 0; index < 10; index++) {
      const cmd = request(f, predecessor, { title: `Explicit replacement ${index + 1}` });
      assert.equal(handoff(f, cmd), 'accepted'); commands.push(cmd);
      const successor = start(f, cmd, index === 9);
      if (index === 9) written = finish(t, f, successor);
      else observe(f, successor);
      predecessor = successor;
    }
    const before = f.store.snapshot(), registry = f.store.registry();
    assert.equal(before.handoffs.length, 10); assert.equal(before.assignments.length, 11);
    assert.deepEqual(before.tasks.map(([, state]) => state), [...Array(10).fill('failed'), 'done']);
    assert.equal(mission(f), 'accepted'); const expected = f.store.snapshot();
    for (const key of ['tasks','effects','assignments','questions','failures','handoffs']) assert.deepEqual(expected[key], before[key]);
    f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'), { readonly: true });
    try {
      const events = database.prepare('SELECT sequence,type,body FROM events ORDER BY sequence').all();
      const handoffs = events.filter(row => row.type === 'team.task.handoff');
      assert.equal(handoffs.length, 10);
      for (let index = 0; index < commands.length; index++) {
        const cmd = commands[index], event = handoffs[index], body = JSON.parse(event.body);
        const edge = expected.handoffs[index][1], assignment = expected.assignments[index + 1][1];
        assert.deepEqual(body.command, cmd); assert.equal(body.actor, f.setup.leaderId); assert.equal(body.result, 'accepted');
        assert.equal(edge.handoffSequence, event.sequence); assert.equal(assignment.enqueueSequence, event.sequence);
        assert.equal(edge.successorTaskId, cmd.successorTaskId); assert.equal(assignment.taskId, cmd.successorTaskId);
        assert.equal(registry[index + 1].title, body.command.title);
        assert.equal(events.filter(row => row.type === 'task.create' && JSON.parse(row.body).taskId === cmd.successorTaskId).length, 0);
      }
      const completion = events.find(row => row.type === 'team.mission.complete');
      assert.equal(expected.sessions[0][1].completion.sequence, completion.sequence);
    } finally { database.close(); }
    f.store = TaskStore.openHandoffEngine(f.root);
    assert.deepEqual(f.store.snapshot(), expected); assert.deepEqual(f.store.registry(), registry);
    for (const cmd of commands) assert.equal(handoff(f, cmd), 'accepted');
    assert.deepEqual(f.store.snapshot(), expected); assert.equal(written.observe().rows.length, 1);
  } finally { f.store.close(); }
});

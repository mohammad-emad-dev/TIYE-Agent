'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore, approvalBinding } = require('../dist');
const { commandHash } = require('../dist/command');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { session, plan, witness } = require('./mock-fixtures.cjs');
const { launch } = require('./processes.cjs');

function fixture(t, maxConcurrent = 2) {
  const root = privateRoot(t), setup = session({ maxConcurrent }), store = TaskStore.createEngine(root);
  store.owner().createSession(bytes(setup));
  return { root, store, setup };
}
function enqueue(setup, task, memberId = setup.members[1].memberId) {
  return { type: 'team.task.enqueue', version: 1, commandId: randomUUID(), sessionId: setup.sessionId, taskId: task.taskId, memberId };
}
function start(setup, queued) {
  return { type: 'team.task.start', version: 1, sessionId: setup.sessionId, memberId: queued.memberId,
    ...plan({ taskId: queued.taskId }) };
}
function leader(f) { return f.store.member(f.setup.leaderId); }

test('durable per-member FIFO permits only the queue head and one active reservation', t => {
  const f = fixture(t), tasks = [command(), command(), command()];
  let store = f.store;
  try {
    tasks.forEach(task => store.execute(bytes(task)));
    const queued = tasks.map((task, index) => enqueue(f.setup, task, f.setup.members[index === 2 ? 0 : 1].memberId));
    queued.forEach(request => assert.equal(leader(f).enqueue(bytes(request)), 'accepted'));
    const outOfOrder = start(f.setup, queued[1]);
    assert.equal(store.scheduler().start(bytes(outOfOrder)), 'rejected');
    const first = start(f.setup, queued[0]); assert.equal(store.scheduler().start(bytes(first)), 'accepted');
    assert.equal(store.scheduler().start(bytes(outOfOrder)), 'rejected');
    assert.equal(store.scheduler().start(bytes({ ...outOfOrder, commandId: randomUUID() })), 'rejected');
    const parallel = start(f.setup, queued[2]); assert.equal(store.scheduler().start(bytes(parallel)), 'accepted');
    assert.equal(store.snapshot().effects.length, 2);
    const expected = store.scheduler().inboxes();
    assert.equal(expected[1].activeTaskId, tasks[0].taskId);
    assert.deepEqual(expected[1].queuedTaskIds, [tasks[1].taskId]);
    const snapshot = store.snapshot(); store.close(); store = TaskStore.openEngine(f.root);
    assert.deepEqual(store.scheduler().inboxes(), expected);
    assert.equal(store.scheduler().start(bytes(first)), 'accepted');
    assert.equal(store.scheduler().start(bytes(outOfOrder)), 'rejected');
    assert.deepEqual(store.snapshot(), snapshot);
    assert.deepEqual(store.registry().map(row => row.state), ['waiting_approval', 'queued', 'waiting_approval']);
  } finally { store.close(); }
});

test('global cap includes waiting approval and approval cannot release a slot or enable dispatch', t => {
  const f = fixture(t, 1), witnessRoot = privateRoot(t), tasks = [command(), command()];
  try {
    tasks.forEach(task => f.store.execute(bytes(task)));
    const queued = tasks.map((task, index) => enqueue(f.setup, task, f.setup.members[index].memberId));
    queued.forEach(request => leader(f).enqueue(bytes(request)));
    const first = start(f.setup, queued[0]), second = start(f.setup, queued[1]);
    assert.equal(f.store.scheduler().start(bytes(first)), 'accepted');
    assert.equal(f.store.scheduler().start(bytes(second)), 'rejected');
    const effect = f.store.snapshot().effects[0][1].plan;
    witness('create', witnessRoot, effect);
    f.store.approve(effect.effectId, approvalBinding(effect));
    assert.equal(f.store.registry()[0].state, 'running');
    assert.equal(f.store.snapshot().assignments[0][1].remainingEvents, 6);
    const before = f.store.snapshot();
    assert.throws(() => f.store.claim(effect.effectId), /engine-dispatch-not-admitted/);
    assert.throws(() => f.store.cancel(effect.effectId), /engine-dispatch-not-admitted/);
    assert.throws(() => f.store.settle(effect.effectId, bytes({ scope: 'unavailable' })));
    assert.throws(() => f.store.resolve({ commandId: randomUUID(), effectId: effect.effectId,
      attemptId: effect.attemptId, attentionSequence: 1, outcome: 'close_uncertain' }), /engine-dispatch-not-admitted/);
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.scheduler().start(bytes({ ...second, commandId: randomUUID() })), 'rejected');
    assert.equal(witness('observe', witnessRoot, effect, { effectId: effect.effectId, attemptId: effect.attemptId }).rows.length, 0);
  } finally { f.store.close(); }
});

test('bound leader authority, shared command IDs and malformed requests cannot overwrite inboxes', t => {
  const f = fixture(t), task = command(), request = enqueue(f.setup, task);
  try {
    f.store.execute(bytes(task));
    const member = f.store.member(f.setup.members[1].memberId);
    assert.equal(member.scheduler, undefined); assert.equal(member.owner, undefined);
    assert.equal(member.enqueue(bytes(request)), 'rejected');
    assert.equal(member.enqueue(bytes(request)), 'rejected');
    assert.throws(() => leader(f).enqueue(bytes(request)), /mock-command-conflict/);
    const accepted = { ...request, commandId: randomUUID() };
    assert.equal(leader(f).enqueue(bytes(accepted)), 'accepted');
    assert.equal(leader(f).enqueue(bytes(accepted)), 'accepted');
    assert.throws(() => f.store.execute(bytes(command({ commandId: accepted.commandId }))), /mock-command-conflict/);
    assert.throws(() => f.store.scheduler().start(bytes({ ...start(f.setup, accepted), commandId: accepted.commandId })), /mock-command-conflict/);
    const before = f.store.snapshot();
    for (const changed of [{ actor: f.setup.leaderId }, { version: 2 }, { memberId: false }, { extra: true }])
      assert.throws(() => leader(f).enqueue(bytes({ ...accepted, ...changed })));
    for (const wire of [Buffer.from('{'), Buffer.alloc(16385), Buffer.from('\ufeffnull'),
      Buffer.from(' ' + JSON.stringify(accepted)), Buffer.from(JSON.stringify(accepted).replace('"version":1', '"version":1,"version":1'))])
      assert.throws(() => leader(f).enqueue(wire));
    assert.throws(() => f.store.scheduler().start(bytes(accepted)), /wrong-inbox-entry-point/);
    assert.deepEqual(f.store.snapshot(), before);
    const view = member.inbox(); view.queuedTaskIds.push(randomUUID());
    assert.deepEqual(member.inbox().queuedTaskIds, [task.taskId]);
  } finally { f.store.close(); }
});

test('semantic rejection stays rejected after missing task is created and raw planning cannot bypass assignment', t => {
  const f = fixture(t), task = command(), request = enqueue(f.setup, task);
  try {
    assert.equal(leader(f).enqueue(bytes(request)), 'rejected');
    f.store.execute(bytes(task));
    assert.equal(leader(f).enqueue(bytes(request)), 'rejected');
    assert.equal(leader(f).enqueue(bytes({ ...request, commandId: randomUUID(), memberId: randomUUID() })), 'rejected');
    assert.equal(leader(f).enqueue(bytes({ ...request, commandId: randomUUID(), sessionId: randomUUID() })), 'rejected');
    const accepted = { ...request, commandId: randomUUID() }; leader(f).enqueue(bytes(accepted));
    assert.equal(leader(f).enqueue(bytes({ ...accepted, commandId: randomUUID() })), 'rejected');
    assert.equal(f.store.planForTask(plan({ taskId: task.taskId })), 'rejected');
    assert.equal(f.store.plan(plan({ taskId: task.taskId })), 'rejected');
    assert.equal(f.store.snapshot().effects.length, 0);
    assert.equal(f.store.snapshot().assignments.length, 1);
    assert.equal(f.store.registry()[0].state, 'queued');
  } finally { f.store.close(); }
});

test('start refuses globally reused effect and attempt IDs from unassigned work', t => {
  const f = fixture(t), task = command(), legacy = plan();
  try {
    f.store.plan(legacy); f.store.execute(bytes(task));
    const queued = enqueue(f.setup, task); leader(f).enqueue(bytes(queued));
    for (const changes of [{ effectId: legacy.effectId }, { attemptId: legacy.attemptId }])
      assert.equal(f.store.scheduler().start(bytes({ ...start(f.setup, queued), ...changes })), 'rejected');
    assert.equal(f.store.snapshot().assignments[0][1].effectId, null);
    assert.equal(f.store.snapshot().effects.length, 1);
  } finally { f.store.close(); }
});

test('actual SQLite start abort restores queue head and leaves no effect or phantom reservation', t => {
  const f = fixture(t), task = command(), original = Database.prototype.exec;
  try {
    f.store.execute(bytes(task)); const queued = enqueue(f.setup, task); leader(f).enqueue(bytes(queued));
    const before = f.store.snapshot(), request = start(f.setup, queued);
    Database.prototype.exec = function (sql) {
      const result = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER reject_start BEFORE INSERT ON effects BEGIN SELECT RAISE(ABORT,'fixture-start-abort'); END");
      return result;
    };
    try { assert.throws(() => f.store.scheduler().start(bytes(request)), /fixture-start-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.scheduler().start(bytes(request)), 'accepted');
  } finally { f.store.close(); }
});

test('reserved assignment budget survives rejection pressure and still admits start and approval', t => {
  const f = fixture(t), task = command(), queued = enqueue(f.setup, task);
  f.store.execute(bytes(task)); leader(f).enqueue(bytes(queued)); f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE');
    const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)');
    const decision = database.prepare('INSERT INTO commands VALUES (?,?)');
    for (let sequence = 4; sequence <= 991; sequence++) {
      const rejected = command({ taskId: task.taskId }); event.run(sequence, JSON.stringify(rejected));
      decision.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  const store = TaskStore.openEngine(f.root);
  try {
    const lead = store.member(f.setup.leaderId);
    assert.equal(lead.enqueue(bytes(queued)), 'accepted');
    assert.throws(() => lead.enqueue(bytes({ ...queued, commandId: randomUUID() })), /mock-reserved-history-limit/);
    const request = start(f.setup, queued); assert.equal(store.scheduler().start(bytes(request)), 'accepted');
    const effect = store.snapshot().effects[0][1].plan;
    store.approve(effect.effectId, approvalBinding(effect));
    const before = store.snapshot(); store.approve(effect.effectId, approvalBinding(effect));
    assert.equal(store.scheduler().start(bytes(request)), 'accepted');
    assert.deepEqual(store.snapshot(), before);
    assert.equal(before.assignments[0][1].remainingEvents, 6);
    assert.throws(() => store.execute(bytes(command())), /mock-reserved-history-limit/);
  } finally { store.close(); }
});

test('capacity can bind before the lifetime assignment ceiling without corrupting the inbox', t => {
  const f = fixture(t), tasks = Array.from({ length: 100 }, () => command());
  try {
    tasks.forEach(task => f.store.execute(bytes(task)));
    const lead = leader(f);
    tasks.slice(0, 99).forEach(task => assert.equal(lead.enqueue(bytes(enqueue(f.setup, task))), 'accepted'));
    assert.throws(() => lead.enqueue(bytes(enqueue(f.setup, tasks[99]))), /mock-reserved-history-limit/);
    assert.equal(f.store.snapshot().assignments.length, 99);
    assert.equal(f.store.scheduler().inboxes()[1].queuedTaskIds.length, 99);
    assert.equal(f.store.registry()[99].state, 'created');
  } finally { f.store.close(); }
});

test('tampered queue actor, event type or materialized task status refuses reopen', t => {
  for (const kind of ['actor', 'type', 'task']) {
    const f = fixture(t), task = command(), queued = enqueue(f.setup, task);
    f.store.execute(bytes(task)); leader(f).enqueue(bytes(queued)); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      if (kind === 'actor') database.prepare('UPDATE events SET body=? WHERE type=\'team.task.enqueue\'')
        .run(JSON.stringify({ command: queued, actor: f.setup.members[1].memberId, result: 'accepted' }));
      else if (kind === 'type') database.prepare('UPDATE events SET type=\'team.task.start\' WHERE type=\'team.task.enqueue\'').run();
      else database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('created'));
    } finally { database.close(); }
    assert.throws(() => TaskStore.openEngine(f.root), /invalid-inbox-event-decision|inbox-event-type-binding|mock-projection-drift/);
  }
});

for (const operation of ['enqueue', 'startTask']) for (const barrier of ['before', 'after']) {
  test(`inbox ${operation} crash ${barrier} COMMIT recovers one decision and reservation`, async t => {
    const f = fixture(t), task = command(), queued = enqueue(f.setup, task);
    f.store.execute(bytes(task));
    if (operation === 'startTask') leader(f).enqueue(bytes(queued));
    f.store.close(); const request = operation === 'enqueue' ? queued : start(f.setup, queued);
    const host = launch('openEngine', f.root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true }); host.send(JSON.stringify({ op: operation, command: request }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('openEngine', f.root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true });
      recovery.send(JSON.stringify({ op: 'snapshot' })); const initial = (await recovery.read()).result;
      assert.equal(initial.commands.some(([id]) => id === request.commandId), barrier === 'after');
      assert.equal(initial.effects.length, operation === 'startTask' && barrier === 'after' ? 1 : 0);
      recovery.send(JSON.stringify({ op: operation, command: request })); assert.equal((await recovery.read()).result, 'accepted');
      recovery.send(JSON.stringify({ op: 'snapshot' })); const snapshot = (await recovery.read()).result;
      assert.equal(snapshot.commands.length, operation === 'enqueue' ? 3 : 4);
      assert.equal(snapshot.assignments.length, 1);
      assert.equal(snapshot.effects.length, operation === 'enqueue' ? 0 : 1);
      assert.equal(snapshot.assignments[0][1].remainingEvents, operation === 'enqueue' ? 8 : 7);
    } finally { await recovery.stop(); }
  });
}

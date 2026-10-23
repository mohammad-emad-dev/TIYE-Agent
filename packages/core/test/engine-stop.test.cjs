'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore, approvalBinding } = require('../dist');
const { commandHash } = require('../dist/command');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { session, plan } = require('./mock-fixtures.cjs');
const { launch } = require('./processes.cjs');

function stopRequest(setup, changes = {}) {
  return { type: 'team.session.stop', version: 1, commandId: randomUUID(), sessionId: setup.sessionId, ...changes };
}
function fixture(t) {
  const root = privateRoot(t), setup = session(), store = TaskStore.createEngine(root);
  store.owner().createSession(bytes(setup));
  const queued = Array.from({ length: 4 }, (_, index) => {
    const task = command(); store.execute(bytes(task));
    const request = { type: 'team.task.enqueue', version: 1, commandId: randomUUID(), sessionId: setup.sessionId,
      taskId: task.taskId, memberId: setup.members[index % 2].memberId };
    store.member(setup.leaderId).enqueue(bytes(request)); return request;
  });
  const started = queued.slice(0, 2).map(request => ({ type: 'team.task.start', version: 1,
    sessionId: setup.sessionId, memberId: request.memberId, ...plan({ taskId: request.taskId }) }));
  started.forEach(request => store.scheduler().start(bytes(request)));
  store.approve(started[0].effectId, approvalBinding(started[0]));
  return { root, store, setup, queued, started };
}
function assertStopped(store) {
  assert.equal(store.owner().session().status, 'stopped');
  assert(store.snapshot().assignments.every(([, row]) => row.closed && row.remainingEvents === 0));
  assert(store.snapshot().effects.every(([, row]) => row.state === 'cancelled'));
  assert(store.registry().every(row => row.state === 'cancelled'));
  assert(store.scheduler().inboxes().every(row => row.activeTaskId === null && row.queuedTaskIds.length === 0));
}

test('owner stop atomically closes all queued and planned reservations and preserves lifetime history', t => {
  const f = fixture(t), request = stopRequest(f.setup);
  let store = f.store;
  try {
    assert.equal(store.owner().stop(bytes(request)), 'accepted'); assertStopped(store);
    assert.equal(store.snapshot().assignments.length, 4);
    assert.equal(store.snapshot().effects.length, 2);
    const expected = store.snapshot(); store.close(); store = TaskStore.openEngine(f.root);
    assertStopped(store); assert.deepEqual(store.snapshot(), expected);
    assert.equal(store.owner().stop(bytes(request)), 'accepted');
    assert.deepEqual(store.snapshot(), expected);
    assert.equal(store.owner().stop(bytes(stopRequest(f.setup))), 'rejected');
    assert.equal(store.owner().createSession(bytes(session())), 'rejected');
  } finally { store.close(); }
});

test('stop closes every new engine admission path while exact earlier decisions remain stable', t => {
  const f = fixture(t);
  try {
    f.store.owner().stop(bytes(stopRequest(f.setup)));
    assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes(f.queued[0])), 'accepted');
    assert.equal(f.store.scheduler().start(bytes(f.started[0])), 'accepted');
    for (const request of f.queued)
      assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes({ ...request, commandId: randomUUID() })), 'rejected');
    for (const request of f.started) {
      assert.equal(f.store.scheduler().start(bytes({ ...request, commandId: randomUUID() })), 'rejected');
      assert.equal(f.store.planForTask(plan({ taskId: request.taskId })), 'rejected');
      assert.throws(() => f.store.approve(request.effectId, approvalBinding(request)), /mock-approval-mismatch/);
      assert.throws(() => f.store.claim(request.effectId), /mock-already-claimed-or-stopped/);
      assert.throws(() => f.store.settle(request.effectId, bytes({ scope: 'unavailable' })), /mock-not-dispatching/);
    }
    assertStopped(f.store);
  } finally { f.store.close(); }
});

test('stop is owner-bound with closed canonical wire and shared command namespace', t => {
  const f = fixture(t), request = stopRequest(f.setup);
  try {
    assert.equal(f.store.member(f.setup.leaderId).stop, undefined);
    assert.equal(f.store.scheduler().stop, undefined);
    const before = f.store.snapshot();
    for (const changes of [{ actor: 'owner' }, { version: 2 }, { type: 'team.task.start' },
      { sessionId: false }, { commandId: 'bad' }, { extra: null }])
      assert.throws(() => f.store.owner().stop(bytes({ ...request, ...changes })));
    for (const wire of [Buffer.from('{'), Buffer.alloc(16385), Buffer.from([0xff]), Buffer.from('\ufeffnull'),
      Buffer.from(' ' + JSON.stringify(request)),
      Buffer.from(JSON.stringify(request).replace('"version":1', '"version":1,"version":1'))])
      assert.throws(() => f.store.owner().stop(wire));
    assert.throws(() => f.store.owner().stop(bytes({ ...request, commandId: f.setup.commandId })), /mock-command-conflict/);
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.owner().stop(bytes(request)), 'accepted');
    assert.throws(() => f.store.execute(bytes(command({ commandId: request.commandId }))), /mock-command-conflict/);
    assert.throws(() => f.store.owner().stop(bytes({ ...request, sessionId: randomUUID() })), /mock-command-conflict/);
  } finally { f.store.close(); }
});

test('rejected missing-session stop cannot become accepted on redelivery', t => {
  const root = privateRoot(t), store = TaskStore.createEngine(root), setup = session(), request = stopRequest(setup);
  try {
    assert.equal(store.owner().stop(bytes(request)), 'rejected');
    store.owner().createSession(bytes(setup));
    const before = store.snapshot(); assert.equal(store.owner().stop(bytes(request)), 'rejected');
    assert.deepEqual(store.snapshot(), before); assert.equal(store.owner().session().status, 'active');
    assert.equal(store.owner().stop(bytes(stopRequest(setup))), 'accepted');
  } finally { store.close(); }
});

test('SQLite projection abort rolls back the entire composite stop including released budgets', t => {
  const f = fixture(t), request = stopRequest(f.setup), original = Database.prototype.exec;
  try {
    const before = f.store.snapshot();
    Database.prototype.exec = function (sql) {
      const result = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER reject_stop BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-stop-abort'); END");
      return result;
    };
    try { assert.throws(() => f.store.owner().stop(bytes(request)), /fixture-stop-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.owner().stop(bytes(request)), 'accepted'); assertStopped(f.store);
  } finally { f.store.close(); }
});

test('reserved stop commits as event 1000 and exact redelivery still works at the hard limit', t => {
  const root = privateRoot(t), store = TaskStore.createEngine(root), setup = session(), task = command();
  store.owner().createSession(bytes(setup)); store.execute(bytes(task)); store.close();
  const database = new Database(path.join(root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE');
    const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)');
    const decision = database.prepare('INSERT INTO commands VALUES (?,?)');
    for (let sequence = 3; sequence <= 999; sequence++) {
      const rejected = command({ taskId: task.taskId }); event.run(sequence, JSON.stringify(rejected));
      decision.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  const reopened = TaskStore.openEngine(root), request = stopRequest(setup);
  try {
    assert.throws(() => reopened.execute(bytes(command())), /mock-reserved-history-limit/);
    assert.throws(() => reopened.owner().stop(bytes(stopRequest(setup, { sessionId: randomUUID() }))), /mock-reserved-history-limit/);
    assert.equal(reopened.owner().stop(bytes(request)), 'accepted');
    assert.equal(reopened.snapshot().commands.length, 1000);
    const before = reopened.snapshot(); assert.equal(reopened.owner().stop(bytes(request)), 'accepted');
    assert.throws(() => reopened.owner().stop(bytes(stopRequest(setup))), /mock-history-limit/);
    assert.deepEqual(reopened.snapshot(), before);
  } finally { reopened.close(); }
});

test('tampered stop authority, result, target and materialized session/task views refuse reopen', t => {
  for (const kind of ['actor', 'result', 'target', 'session', 'task']) {
    const f = fixture(t), request = stopRequest(f.setup);
    f.store.owner().stop(bytes(request)); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      if (kind === 'session') database.prepare('UPDATE sessions SET value=?').run(JSON.stringify({
        sessionId: f.setup.sessionId, leaderId: f.setup.leaderId, members: f.setup.members,
        maxConcurrent: f.setup.maxConcurrent, status: 'active' }));
      else if (kind === 'task') database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('queued'));
      else database.prepare('UPDATE events SET body=? WHERE type=\'team.session.stop\'').run(JSON.stringify({
        command: kind === 'target' ? { ...request, sessionId: randomUUID() } : request,
        actor: kind === 'actor' ? f.setup.leaderId : 'owner', result: kind === 'result' ? 'rejected' : 'accepted' }));
    } finally { database.close(); }
    assert.throws(() => TaskStore.openEngine(f.root), /invalid-stop-authority-or-id|invalid-stop-event-decision|mock-projection-drift/);
  }
});

for (const barrier of ['before', 'after']) test(`session stop crash ${barrier} COMMIT recovers all or none`, async t => {
  const f = fixture(t), request = stopRequest(f.setup), before = f.store.snapshot(); f.store.close();
  const host = launch('openEngine', f.root, barrier, 'mock-host.cjs');
  try {
    assert.deepEqual(await host.read(), { ready: true });
    host.send(JSON.stringify({ op: 'sessionStop', command: request })); assert.deepEqual(await host.read(), { barrier });
  } finally { await host.stop(); }
  const recovery = launch('openEngine', f.root, null, 'mock-host.cjs');
  try {
    assert.deepEqual(await recovery.read(), { ready: true });
    recovery.send(JSON.stringify({ op: 'snapshot' })); const initial = (await recovery.read()).result;
    if (barrier === 'before') assert.deepEqual(initial, before);
    else {
      assert.equal(initial.sessions[0][1].status, 'stopped');
      assert(initial.assignments.every(([, row]) => row.closed && row.remainingEvents === 0));
      assert(initial.tasks.every(([, state]) => state === 'cancelled'));
    }
    recovery.send(JSON.stringify({ op: 'sessionStop', command: request })); assert.equal((await recovery.read()).result, 'accepted');
    recovery.send(JSON.stringify({ op: 'snapshot' })); const after = (await recovery.read()).result;
    assert.equal(after.commands.length, before.commands.length + 1);
    assert.equal(after.assignments.length, 4); assert(after.assignments.every(([, row]) => row.closed));
  } finally { await recovery.stop(); }
});

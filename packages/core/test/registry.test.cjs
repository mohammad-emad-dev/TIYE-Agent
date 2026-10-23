'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore, CoreStore, approvalBinding } = require('../dist');
const { privateRoot, command, bytes } = require('./helpers.cjs');
const { plan, witness } = require('./mock-fixtures.cjs');
const { launch } = require('./processes.cjs');

test('shared task creation preserves titles, decisions and registry order across reopen', t => {
  const root = privateRoot(t), request = command({ title: 'Shared task 🌍' });
  let store = TaskStore.create(root);
  try {
    assert.equal(store.execute(bytes(request)).status, 'accepted');
    const duplicate = command({ taskId: request.taskId, title: 'Must not replace title' });
    assert.equal(store.execute(bytes(duplicate)).status, 'rejected');
    const second = command({ title: 'Second task' }); store.execute(bytes(second));
    const expected = [request, second].map(item => ({ taskId: item.taskId, title: item.title, state: 'created', effectId: null }));
    assert.deepEqual(store.registry(), expected);
    const snapshot = store.snapshot();
    store.close(); store = TaskStore.open(root);
    assert.equal(store.execute(bytes(request)).status, 'accepted');
    assert.equal(store.execute(bytes(duplicate)).status, 'rejected');
    assert.deepEqual(store.snapshot(), snapshot);
    assert.deepEqual(store.registry(), expected);
    assert.throws(() => store.execute(bytes({ ...request, title: 'Changed' })));
    const before = store.snapshot();
    for (const invalid of [Buffer.from('{'), bytes({ ...request, extra: true }),
      Buffer.from(JSON.stringify(request).replace('"type":', '"type":"task.create","type":'))])
      assert.throws(() => store.execute(invalid));
    assert.deepEqual(store.snapshot(), before);
  } finally { store.close(); }
});

test('task creation shares the original core canonical hash and decision contract', t => {
  const root = privateRoot(t), oldRoot = privateRoot(t);
  const shared = TaskStore.create(root), old = CoreStore.create(oldRoot);
  const request = command();
  try {
    assert.deepEqual(shared.execute(bytes(request)), old.execute(bytes(request)));
    const conflict = command({ taskId: request.taskId });
    assert.deepEqual(shared.execute(bytes(conflict)), old.execute(bytes(conflict)));
  } finally { shared.close(); old.close(); }
  const sharedDb = new Database(path.join(root, 'core.sqlite')), oldDb = new Database(path.join(oldRoot, 'core.sqlite'));
  try {
    const current = JSON.parse(sharedDb.prepare('SELECT value FROM commands WHERE id=?').get(request.commandId).value);
    assert.equal(current.hash, oldDb.prepare('SELECT payload_hash FROM commands WHERE command_id=?').get(request.commandId).payload_hash);
  } finally { sharedDb.close(); oldDb.close(); }
});

test('one registry tracks created tasks, attached effects and legacy synthetic tasks', t => {
  const root = privateRoot(t), witnessRoot = privateRoot(t), request = command();
  let store = TaskStore.create(root);
  try {
    store.execute(bytes(request));
    const effect = plan({ taskId: request.taskId });
    witness('create', witnessRoot, effect);
    assert.equal(store.planForTask(effect), 'accepted');
    assert.equal(store.planForTask(effect), 'accepted');
    assert.deepEqual(store.registry(), [{ taskId: request.taskId, title: request.title, state: 'planned', effectId: effect.effectId }]);
    store.approve(effect.effectId, approvalBinding(effect));
    witness('write', witnessRoot, effect, store.claim(effect.effectId));
    const observed = witness('observe', witnessRoot, effect, { effectId: effect.effectId, attemptId: effect.attemptId });
    store.settle(effect.effectId, bytes(observed));
    const legacy = plan(); assert.equal(store.plan(legacy), 'accepted');
    const expected = [{ taskId: request.taskId, title: request.title, state: 'completed', effectId: effect.effectId },
      { taskId: legacy.taskId, title: null, state: 'planned', effectId: legacy.effectId }];
    assert.deepEqual(store.registry(), expected);
    store.close(); store = TaskStore.open(root);
    assert.equal(store.planForTask(effect), 'accepted', 'saved decision survives task advancement');
    assert.deepEqual(store.registry(), expected);
    assert.equal(witness('observe', witnessRoot, effect, { effectId: effect.effectId, attemptId: effect.attemptId }).rows.length, 1);
  } finally { store.close(); }
});

test('missing-task rejection stays rejected after creation; reused effects and attempts cannot attach', t => {
  const root = privateRoot(t), store = TaskStore.create(root), effect = plan();
  try {
    assert.equal(store.planForTask(effect), 'rejected');
    assert.deepEqual(store.registry(), []);
    const task = command({ taskId: effect.taskId }); store.execute(bytes(task));
    assert.equal(store.planForTask(effect), 'rejected');
    const accepted = { ...effect, commandId: randomUUID() };
    assert.equal(store.planForTask(accepted), 'accepted');
    assert.equal(store.planForTask(plan({ taskId: task.taskId })), 'rejected');
    const second = command(); store.execute(bytes(second));
    assert.equal(store.planForTask(plan({ taskId: second.taskId, effectId: effect.effectId })), 'rejected');
    assert.equal(store.planForTask(plan({ taskId: second.taskId, attemptId: effect.attemptId })), 'rejected');
    store.cancel(effect.effectId);
    assert.equal(store.planForTask(plan({ taskId: task.taskId })), 'rejected');
    assert.equal(store.registry()[0].state, 'cancelled');
    assert.equal(store.registry()[1].state, 'created');
  } finally { store.close(); }
});

test('all task and planning entry points share one command namespace', t => {
  const root = privateRoot(t), store = TaskStore.create(root), task = command();
  try {
    store.execute(bytes(task));
    const effect = plan({ taskId: task.taskId }); store.planForTask(effect);
    const before = store.snapshot();
    assert.throws(() => store.plan({ ...effect, commandId: task.commandId }));
    assert.throws(() => store.planForTask({ ...effect, commandId: task.commandId }));
    assert.throws(() => store.execute(bytes(command({ commandId: effect.commandId }))));
    assert.throws(() => store.plan(effect), 'same payload through the old entry point must conflict');
    const legacy = plan(); store.plan(legacy);
    assert.throws(() => store.planForTask(legacy));
    assert.throws(() => store.execute(bytes(command({ commandId: legacy.commandId }))));
    assert.equal(store.snapshot().commands.length, before.commands.length + 1);
    assert.equal(store.plan(plan({ taskId: task.taskId })), 'rejected');
  } finally { store.close(); }
});

test('SQLite abort during shared task projection writes rolls back event and decision', t => {
  const root = privateRoot(t), store = TaskStore.create(root), original = Database.prototype.exec;
  const before = store.snapshot();
  Database.prototype.exec = function (sql) {
    const result = original.call(this, sql);
    if (sql === 'BEGIN IMMEDIATE') original.call(this,
      "CREATE TEMP TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'fixture-task-abort'); END");
    return result;
  };
  try {
    try { assert.throws(() => store.execute(bytes(command())), /fixture-task-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(store.snapshot(), before);
    assert.deepEqual(store.registry(), []);
    assert.equal(store.execute(bytes(command())).status, 'accepted');
  } finally { store.close(); }
});

test('changing a committed creation title without changing its decision hash refuses reopen', t => {
  const root = privateRoot(t), store = TaskStore.create(root), request = command();
  store.execute(bytes(request)); store.close();
  const database = new Database(path.join(root, 'core.sqlite'));
  try { database.prepare('UPDATE events SET body=?').run(JSON.stringify({ ...request, title: 'Tampered title' })); }
  finally { database.close(); }
  assert.throws(() => TaskStore.open(root), /mock-projection-drift/);
});

for (const operation of ['createTask', 'planForTask']) for (const barrier of ['before', 'after']) {
  test(`shared ${operation} crash ${barrier} COMMIT recovers atomically`, async t => {
    const root = privateRoot(t), witnessRoot = privateRoot(t), task = command(), effect = plan({ taskId: task.taskId });
    witness('create', witnessRoot, effect);
    const store = TaskStore.create(root);
    if (operation === 'planForTask') store.execute(bytes(task));
    store.close();
    const packet = { op: operation, command: task, plan: effect };
    const host = launch('open', root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true }); host.send(JSON.stringify(packet));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('open', root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true });
      recovery.send(JSON.stringify({ op: 'registry' }));
      const registry = (await recovery.read()).result;
      assert.equal(registry.length, operation === 'createTask' && barrier === 'before' ? 0 : 1);
      if (registry.length) assert.equal(registry[0].state, operation === 'planForTask' && barrier === 'after' ? 'planned' : 'created');
      recovery.send(JSON.stringify(packet));
      const result = (await recovery.read()).result;
      assert.equal(operation === 'createTask' ? result.status : result, 'accepted');
      recovery.send(JSON.stringify({ op: 'snapshot' }));
      const snapshot = (await recovery.read()).result;
      assert.equal(snapshot.commands.length, operation === 'createTask' ? 1 : 2);
      assert.equal(snapshot.effects.length, operation === 'createTask' ? 0 : 1);
      assert.equal(witness('observe', witnessRoot, effect, { effectId: effect.effectId, attemptId: effect.attemptId }).rows.length, 0);
    } finally { await recovery.stop(); }
  });
}

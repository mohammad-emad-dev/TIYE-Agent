'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { MockEffectStore, approvalBinding } = require('../dist');
const { planHash } = require('../dist/effects-model');
const { privateRoot, bytes, command } = require('./helpers.cjs');
const { launch } = require('./processes.cjs');
const { plan: mockPlan, witness: callWitness } = require('./mock-fixtures.cjs');

function fixture(t, withWitness = false) {
  const root = privateRoot(t), witnessRoot = withWitness ? privateRoot(t) : undefined;
  const plan = mockPlan({ payload: 'Resolution fixture' });
  const store = MockEffectStore.create(root);
  try {
    store.plan(plan); store.approve(plan.effectId, approvalBinding(plan));
    const claimed = store.claim(plan.effectId);
    function witness(mode, input) {
      return callWitness(mode, witnessRoot, plan, input);
    }
    if (withWitness) { witness('create'); witness('write', claimed); }
    store.settle(plan.effectId, bytes({ scope: 'unavailable' }));
    const request = { commandId: randomUUID(), ...store.attention(plan.effectId), outcome: 'close_uncertain' };
    return { root, store, plan, request, witness };
  } catch (fault) { store.close(); throw fault; }
}
function effectState(store) { return store.snapshot().effects[0][1].state; }

test('explicit uncertain closure is durable, idempotent and never rearms an attempt', t => {
  const f = fixture(t), original = f.store.attention(f.plan.effectId);
  let store = f.store;
  try {
    const unrelated = { ...f.plan, commandId: randomUUID(), taskId: randomUUID(), effectId: randomUUID(), attemptId: randomUUID() };
    store.plan(unrelated);
    assert.deepEqual(store.attention(f.plan.effectId), original, 'other task events cannot stale this attempt');
    assert.equal(store.resolve(f.request), 'accepted');
    assert.equal(effectState(store), 'abandoned');
    assert.equal(store.snapshot().tasks[0][1], 'abandoned');
    const completedProjection = store.snapshot();
    store.close(); store = MockEffectStore.open(f.root);
    assert.equal(store.resolve(f.request), 'accepted');
    assert.deepEqual(store.snapshot(), completedProjection);
    assert.throws(() => store.claim(f.plan.effectId));
    assert.throws(() => store.attention(f.plan.effectId));
    assert.throws(() => store.resolve({ ...f.request, attentionSequence: original.attentionSequence + 1 }));
    assert.throws(() => store.plan({ ...f.plan, commandId: f.request.commandId }));
    assert.throws(() => store.resolve({ ...f.request, commandId: f.plan.commandId }));
  } finally { store.close(); }
});

test('confirmation uses existing witness evidence and never performs another invocation', t => {
  const f = fixture(t, true);
  let store = f.store;
  try {
    const query = { effectId: f.plan.effectId, attemptId: f.plan.attemptId };
    const proof = f.witness('observe', query);
    const request = { ...f.request, outcome: 'confirm_completed' };
    store.settle(f.plan.effectId, bytes(proof));
    assert.equal(effectState(store), 'needs_attention');
    assert.equal(store.resolve(request, bytes(proof)), 'accepted');
    store.close(); store = MockEffectStore.open(f.root);
    assert.equal(store.resolve(request, bytes(proof)), 'accepted');
    assert.equal(effectState(store), 'completed');
    assert.throws(() => store.claim(f.plan.effectId));
    assert.throws(() => store.resolve(request, bytes({ ...proof, targetId: randomUUID() })));
    assert.equal(f.witness('observe', query).rows.length, 1);
  } finally { store.close(); }
});

test('semantic resolution rejection is durable and leaves attention identity unchanged', t => {
  const f = fixture(t), original = f.store.attention(f.plan.effectId);
  let store = f.store;
  try {
    for (const changes of [{ effectId: randomUUID() }, { attemptId: randomUUID() },
      { attentionSequence: original.attentionSequence + 1 }, { outcome: 'confirm_completed' }]) {
      const request = { ...f.request, commandId: randomUUID(), ...changes };
      const proof = request.outcome === 'confirm_completed' ? bytes({ scope: 'unavailable' }) : undefined;
      assert.equal(store.resolve(request, proof), 'rejected');
      const before = store.snapshot();
      store.close(); store = MockEffectStore.open(f.root);
      assert.equal(store.resolve(request, proof), 'rejected');
      assert.deepEqual(store.snapshot(), before);
      assert.deepEqual(store.attention(f.plan.effectId), original);
    }
    assert.equal(store.resolve(f.request), 'accepted');
    assert.equal(store.resolve({ ...f.request, commandId: randomUUID() }), 'rejected');
  } finally { store.close(); }
});

test('malformed requests and noncanonical proof refuse before command admission', t => {
  const f = fixture(t), store = f.store, before = store.snapshot();
  try {
    for (const changes of [{ commandId: 'bad' }, { attemptId: false }, { attentionSequence: 0 },
      { attentionSequence: 1.5 }, { outcome: 'retry' }, { extra: true }])
      assert.throws(() => store.resolve({ ...f.request, ...changes }));
    assert.throws(() => store.resolve(f.request, bytes(null)));
    const request = { ...f.request, outcome: 'confirm_completed' };
    for (const proof of [undefined, Buffer.from('{'), Buffer.from(' null'), Buffer.alloc(16385),
      Buffer.from([0xff]), Buffer.from('\ufeffnull'), Buffer.from('{"x":1,"x":1}')])
      assert.throws(() => store.resolve(request, proof));
    assert.deepEqual(store.snapshot(), before);
    assert.throws(() => store.resolve({ ...f.request, commandId: f.plan.commandId }));
  } finally { store.close(); }
});

test('reserved capacity admits terminal resolution after rejecting further traffic', t => {
  const f = fixture(t); f.store.close();
  // Real, valid near-limit history fixture: seed durable task-conflict rejections.
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    const insertEvent = database.prepare('INSERT INTO events VALUES (?,\'plan\',?)');
    const insertCommand = database.prepare('INSERT INTO commands VALUES (?,?)');
    database.exec('BEGIN IMMEDIATE');
    for (let sequence = 5; sequence <= 998; sequence++) {
      const conflict = { ...f.plan, commandId: randomUUID() };
      insertEvent.run(sequence, JSON.stringify(conflict));
      insertCommand.run(conflict.commandId, JSON.stringify({ hash: planHash(conflict), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  const store = MockEffectStore.open(f.root);
  try {
    assert.equal(store.resolve({ ...f.request, commandId: randomUUID(), attemptId: randomUUID() }), 'rejected');
    assert.throws(() => store.execute(bytes(command())), /mock-reserved-history-limit/);
    assert.throws(() => store.planForTask({ ...f.plan, commandId: randomUUID(), taskId: randomUUID() }), /mock-reserved-history-limit/);
    const blocked = { ...f.request, commandId: randomUUID(), attemptId: randomUUID() };
    assert.throws(() => store.resolve(blocked), /mock-reserved-history-limit/);
    assert(!store.snapshot().commands.some(([id]) => id === blocked.commandId));
    assert.equal(store.resolve(f.request), 'accepted');
    assert.equal(effectState(store), 'abandoned');
    assert.equal(store.resolve(f.request), 'accepted', 'redelivery works even at full capacity');
  } finally { store.close(); }
});

test('tampered resolution history is refused instead of accepting a stale completion', t => {
  const f = fixture(t);
  f.store.resolve(f.request); f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    database.prepare('UPDATE events SET body=? WHERE type=\'resolve\'').run(JSON.stringify({
      request: { ...f.request, attentionSequence: f.request.attentionSequence + 1 }, proof: null
    }));
  } finally { database.close(); }
  assert.throws(() => MockEffectStore.open(f.root), /mock-projection-drift/);
});

for (const outcome of ['close_uncertain', 'confirm_completed', 'rejected']) for (const barrier of ['before', 'after']) {
  test(`resolution ${outcome} crash ${barrier} COMMIT preserves one durable decision`, async t => {
    const f = fixture(t, outcome === 'confirm_completed');
    const request = { ...f.request, outcome: outcome === 'confirm_completed' ? outcome : 'close_uncertain',
      ...(outcome === 'rejected' ? { attemptId: randomUUID() } : {}) };
    const query = { effectId: f.plan.effectId, attemptId: f.plan.attemptId };
    const proof = outcome === 'confirm_completed' ? f.witness('observe', query) : undefined;
    f.store.close();
    const host = launch('open', f.root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true });
      host.send(JSON.stringify({ op: 'resolve', request, proof }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('open', f.root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true });
      recovery.send(JSON.stringify({ op: 'snapshot' }));
      const snapshot = (await recovery.read()).result;
      assert.equal(snapshot.commands.some(([id]) => id === request.commandId), barrier === 'after');
      assert.equal(snapshot.effects[0][1].state, barrier === 'before' || outcome === 'rejected'
        ? 'needs_attention' : outcome === 'confirm_completed' ? 'completed' : 'abandoned');
      recovery.send(JSON.stringify({ op: 'resolve', request, proof }));
      assert.equal((await recovery.read()).result, outcome === 'rejected' ? 'rejected' : 'accepted');
      recovery.send(JSON.stringify({ op: 'snapshot' }));
      assert.equal((await recovery.read()).result.commands.length, 2);
      if (proof) assert.equal(f.witness('observe', query).rows.length, 1);
    } finally { await recovery.stop(); }
  });
}

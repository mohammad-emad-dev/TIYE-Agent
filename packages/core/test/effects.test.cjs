'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { MockEffectStore, CoreStore, approvalBinding } = require('../dist');
const { invocation } = require('../dist/effects-model');
const { privateRoot, bytes } = require('./helpers.cjs');
const { launch } = require('./processes.cjs');

function plan(overrides = {}) {
  return { commandId: randomUUID(), taskId: randomUUID(), effectId: randomUUID(), attemptId: randomUUID(),
    targetId: randomUUID(), payload: 'Synthetic owned action', expiresAt: Date.now() + 60000, ...overrides };
}
function witness(mode, root, request, input) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'witness.cjs'), mode, root, request.targetId],
    { input: input ? JSON.stringify(input) : '', encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
function proof(root, request) {
  return witness('observe', root, request, { effectId: request.effectId, attemptId: request.attemptId });
}
function state(store, request) { return store.snapshot().effects.find(([id]) => id === request.effectId)[1].state; }
function prepared(root, request) {
  const store = MockEffectStore.create(root);
  store.plan(request); store.approve(request.effectId, approvalBinding(request)); return store;
}

test('durable planning, exact approval and single claim survive reopen', t => {
  const root = privateRoot(t), request = plan();
  let store = MockEffectStore.create(root);
  try {
    assert.equal(store.plan(request), 'accepted');
    assert.equal(store.plan(request), 'accepted');
    assert.throws(() => store.plan({ ...request, payload: 'changed' }));
    const conflict = plan({ taskId: request.taskId });
    assert.equal(store.plan(conflict), 'rejected');
    assert.equal(store.plan(conflict), 'rejected');
    assert.throws(() => store.claim(request.effectId));
    for (const key of ['effectId', 'attemptId', 'targetId', 'payload', 'expiresAt']) {
      const changed = { ...request, [key]: key === 'expiresAt' ? request.expiresAt + 1 : key === 'payload' ? 'different' : randomUUID() };
      assert.throws(() => store.approve(request.effectId, approvalBinding(changed)));
    }
    store.approve(request.effectId, approvalBinding(request));
    store.approve(request.effectId, approvalBinding(request));
    store.close(); store = MockEffectStore.open(root);
    assert.deepEqual(store.claim(request.effectId), invocation(request));
    store.close(); store = MockEffectStore.open(root);
    assert.throws(() => store.claim(request.effectId));
    assert.equal(state(store, request), 'dispatching');
  } finally { store.close(); }
});

test('independent durable witness reconciles once without redispatch and exposes duplicates', t => {
  const root = privateRoot(t), witnessRoot = privateRoot(t), request = plan();
  witness('create', witnessRoot, request);
  let store = prepared(root, request);
  try {
    const claimed = store.claim(request.effectId);
    witness('write', witnessRoot, request, claimed);
    store.close(); store = MockEffectStore.open(root);
    const observed = proof(witnessRoot, request);
    assert.equal(observed.rows.length, 1);
    store.settle(request.effectId, bytes(observed));
    store.settle(request.effectId, bytes(observed));
    assert.equal(state(store, request), 'completed');
    assert.throws(() => store.claim(request.effectId));
    witness('write', witnessRoot, request, claimed);
    const duplicate = proof(witnessRoot, request);
    assert.equal(duplicate.rows.length, 2, 'witness must expose every invocation');
    assert.throws(() => store.settle(request.effectId, bytes(duplicate)));
    assert.equal(state(store, request), 'completed');
  } finally { store.close(); }
});

test('absent, malformed, duplicate and conflicting proof pause only the affected task', t => {
  const root = privateRoot(t), witnessRoot = privateRoot(t), targetId = randomUUID();
  witness('create', witnessRoot, { targetId });
  const store = MockEffectStore.create(root);
  try {
    for (const kind of ['absent', 'malformed', 'duplicate', 'conflicting', 'unreadable']) {
      const request = plan({ targetId });
      store.plan(request); store.approve(request.effectId, approvalBinding(request));
      const claimed = store.claim(request.effectId);
      let observed;
      if (kind === 'duplicate') {
        witness('write', witnessRoot, request, claimed); witness('write', witnessRoot, request, claimed);
        observed = bytes(proof(witnessRoot, request));
      } else if (kind === 'conflicting') {
        witness('write', witnessRoot, request, { ...claimed, payloadHash: '0'.repeat(64) });
        observed = bytes(proof(witnessRoot, request));
      } else if (kind === 'absent') observed = bytes(proof(witnessRoot, request));
      else observed = kind === 'malformed' ? Buffer.from('{') : bytes({ scope: 'unavailable' });
      store.settle(request.effectId, observed);
      assert.equal(state(store, request), 'needs_attention');
      if (kind === 'absent') {
        witness('write', witnessRoot, request, claimed);
        store.settle(request.effectId, bytes(proof(witnessRoot, request)));
        assert.equal(state(store, request), 'needs_attention', 'late proof never silently resumes a paused attempt');
      }
      assert.throws(() => store.claim(request.effectId));
      assert.throws(() => store.approve(request.effectId, approvalBinding(request)));
      store.settle(request.effectId, bytes({ scope: 'unavailable' }));
    }
    const unrelated = plan({ targetId });
    store.plan(unrelated); store.approve(unrelated.effectId, approvalBinding(unrelated));
    witness('write', witnessRoot, unrelated, store.claim(unrelated.effectId));
    store.settle(unrelated.effectId, bytes(proof(witnessRoot, unrelated)));
    assert.equal(state(store, unrelated), 'completed');
  } finally { store.close(); }
});

test('schema 2 connection excludes an idle competing owner', t => {
  const root = privateRoot(t), request = plan();
  const store = prepared(root, request);
  try {
    const rival = spawnSync(process.execPath, [path.join(__dirname, 'mock-host.cjs'), 'open', root],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true });
    assert.notEqual(rival.status, 0);
    assert.match(rival.stderr, /SQLITE_BUSY/);
    assert.equal(state(store, request), 'planned');
    assert.deepEqual(store.claim(request.effectId), invocation(request));
  } finally { store.close(); }
});

test('cancellation and deadlines never rearm an attempt', t => {
  const root = privateRoot(t), witnessRoot = privateRoot(t), request = plan();
  witness('create', witnessRoot, request);
  const store = MockEffectStore.create(root);
  try {
    store.plan(request); store.cancel(request.effectId);
    assert.equal(state(store, request), 'cancelled');
    assert.throws(() => store.claim(request.effectId));
    const expired = plan({ expiresAt: Date.now() - 1 });
    store.plan(expired); store.approve(expired.effectId, approvalBinding(expired));
    assert.equal(store.claim(expired.effectId), null);
    assert.equal(state(store, expired), 'cancelled');
    const running = plan();
    store.plan(running); store.approve(running.effectId, approvalBinding(running)); store.claim(running.effectId);
    store.cancel(running.effectId);
    assert.equal(state(store, running), 'needs_attention');
    assert.throws(() => store.claim(running.effectId));
    // A stale invocation arriving at the fixed action boundary must be rejected.
    const result = spawnSync(process.execPath, [path.join(__dirname, 'witness.cjs'), 'write', witnessRoot, request.targetId],
      { input: JSON.stringify({ ...invocation(request), expiresAt: Date.now() - 1 }), timeout: 10000,
        maxBuffer: 32768, encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /witness-invocation/);
    assert.equal(proof(witnessRoot, request).rows.length, 0);
  } finally { store.close(); }
});

test('schema versions remain separate and replay detects projection tampering', t => {
  const root = privateRoot(t), oldRoot = privateRoot(t), request = plan();
  let store = prepared(root, request); store.close();
  const old = CoreStore.create(oldRoot); old.close();
  assert.throws(() => MockEffectStore.open(oldRoot), /unsupported-mock-database/);
  assert.throws(() => CoreStore.open(root), /unsupported-database/);
  const database = new Database(path.join(root, 'core.sqlite'));
  database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('completed')); database.close();
  assert.throws(() => MockEffectStore.open(root), /mock-projection-drift/);
});

for (const operation of ['plan', 'claim', 'settle']) for (const barrier of ['before', 'after']) {
  test(`${operation} crash ${barrier} COMMIT recovers atomically in a fresh process`, async t => {
    const root = privateRoot(t), witnessRoot = privateRoot(t), request = plan();
    witness('create', witnessRoot, request);
    const store = operation === 'plan' ? MockEffectStore.create(root) : prepared(root, request);
    if (operation === 'settle') witness('write', witnessRoot, request, store.claim(request.effectId));
    store.close();
    const observed = proof(witnessRoot, request);
    const host = launch('open', root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true });
      host.send(JSON.stringify({ op: operation, plan: request, effectId: request.effectId, proof: observed }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('open', root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true });
      recovery.send(JSON.stringify({ op: 'snapshot' }));
      const snapshot = (await recovery.read()).result;
      const expected = operation === 'plan' ? (barrier === 'before' ? undefined : 'planned')
        : operation === 'claim' ? (barrier === 'before' ? 'planned' : 'dispatching')
          : barrier === 'before' ? 'dispatching' : 'completed';
      assert.equal(snapshot.effects[0]?.[1].state, expected);
      if (operation === 'settle') {
        recovery.send(JSON.stringify({ op: 'settle', effectId: request.effectId, proof: observed }));
        await recovery.read();
        recovery.send(JSON.stringify({ op: 'snapshot' }));
        assert.equal((await recovery.read()).result.effects[0][1].state, 'completed');
      }
      assert.equal(proof(witnessRoot, request).rows.length, operation === 'settle' ? 1 : 0);
    } finally { await recovery.stop(); }
  });
}

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

function ownerCommand(f, type = 'team.session.recover') {
  return { type, version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId };
}
function report(f, changes = {}) {
  return { type: 'team.task.report', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    taskId: f.started.taskId, status: 'done', summary: 'Recorded independently', ...changes };
}
function addTask(f, memberId = f.setup.members[1].memberId) {
  const task = command(); f.store.execute(bytes(task));
  const enqueue = { type: 'team.task.enqueue', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId, taskId: task.taskId, memberId };
  assert.equal(f.store.member(f.setup.leaderId).enqueue(bytes(enqueue)), 'accepted');
  return { type: 'team.task.start', version: 1, sessionId: f.setup.sessionId, memberId, ...plan({ taskId: task.taskId, expiresAt: Date.now() + 180000 }) };
}
function fixture(t) {
  const root = privateRoot(t), setup = session(), store = TaskStore.createEngine(root);
  store.owner().createSession(bytes(setup));
  const f = { root, setup, store }, started = addTask(f);
  store.scheduler().start(bytes(started)); store.approve(started.effectId, approvalBinding(started));
  return { ...f, started };
}
function member(f) { return f.store.member(f.started.memberId); }
function assignment(f) { return f.store.snapshot().assignments.find(([id]) => id === f.started.taskId)[1]; }
function observer(t, f) {
  const root = privateRoot(t);
  witness('create', root, f.started);
  const observe = () => witness('observe', root, f.started, { effectId: f.started.effectId, attemptId: f.started.attemptId });
  return { root, observe };
}
function dispatch(t, f, copies = 1) {
  const invocation = f.store.claim(f.started.effectId), observed = observer(t, f);
  for (let index = 0; index < copies; index++) witness('write', observed.root, f.started, invocation);
  return { ...observed, proof: observed.observe() };
}
function resolve(f, outcome = 'close_uncertain', proof) {
  return f.store.resolve({ commandId: randomUUID(), ...f.store.attention(f.started.effectId), outcome }, proof && bytes(proof));
}

test('member report preserves summary and alone frees FIFO occupancy after proven completion', t => {
  const f = fixture(t);
  try {
    const next = addTask(f), written = dispatch(t, f); f.store.settle(f.started.effectId, bytes(written.proof));
    assert.equal(f.store.registry()[0].state, 'running'); assert.equal(assignment(f).closed, false);
    assert.equal(f.store.scheduler().start(bytes(next)), 'rejected');
    const request = report(f, { summary: 'Completed مرحباً 👩‍💻' }); assert.equal(member(f).report(bytes(request)), 'accepted');
    assert.deepEqual(assignment(f).result, { status: 'done', summary: request.summary });
    assert.equal(assignment(f).remainingEvents, 0); assert.equal(f.store.registry()[0].state, 'done');
    const before = f.store.snapshot(); assert.equal(member(f).report(bytes(request)), 'accepted'); assert.deepEqual(f.store.snapshot(), before);
    assert.equal(member(f).report(bytes(report(f))), 'rejected');
    assert.equal(f.store.scheduler().start(bytes({ ...next, commandId: randomUUID() })), 'accepted');
    assert.equal(written.observe().rows.length, 1);
  } finally { f.store.close(); }
});

test('report identity, shared namespace, canonical bytes and bounded text cannot bypass effect proof', t => {
  const f = fixture(t), request = report(f);
  try {
    assert.equal(member(f).report(bytes(request)), 'rejected');
    const written = dispatch(t, f); f.store.settle(f.started.effectId, bytes(written.proof));
    assert.equal(member(f).report(bytes(request)), 'rejected');
    assert.equal(f.store.member(f.setup.leaderId).report(bytes(report(f))), 'rejected');
    const before = f.store.snapshot();
    for (const changes of [{ actor: f.started.memberId }, { status: 'completed' }, { version: 2 }, { summary: '' },
      { summary: '\ud800' }, { summary: 'x'.repeat(257) }, { commandId: true }, { taskId: false }])
      assert.throws(() => member(f).report(bytes({ ...report(f), ...changes })));
    for (const wire of [Buffer.from('{'), Buffer.alloc(16385), Buffer.from([0xff]), Buffer.from('\ufeffnull'),
      Buffer.from(' ' + JSON.stringify(request)), Buffer.from(JSON.stringify(request).replace('"version":1', '"version":1,"version":1'))])
      assert.throws(() => member(f).report(wire));
    assert.throws(() => member(f).report(bytes({ ...report(f), commandId: f.setup.commandId })), /mock-command-conflict/);
    assert.throws(() => f.store.owner().recover(bytes(report(f))), /wrong-lifecycle-entry-point/);
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(member(f).report(bytes(report(f, { sessionId: randomUUID() }))), 'rejected');
    const accepted = report(f); assert.equal(member(f).report(bytes(accepted)), 'accepted');
    assert.throws(() => member(f).report(bytes({ ...accepted, summary: 'Changed' })), /mock-command-conflict/);
    assert.throws(() => f.store.execute(bytes(command({ commandId: accepted.commandId }))), /mock-command-conflict/);
  } finally { f.store.close(); }
});

test('uncertain member keeps its slot while another member completes and abandonment needs failed report', t => {
  const f = fixture(t);
  try {
    dispatch(t, f, 0); f.store.settle(f.started.effectId, bytes({ scope: 'unavailable' }));
    assert.equal(f.store.registry()[0].state, 'needs_attention');
    for (const status of ['done', 'failed']) assert.equal(member(f).report(bytes(report(f, { status }))), 'rejected');
    const other = addTask(f, f.setup.leaderId); assert.equal(f.store.scheduler().start(bytes(other)), 'accepted');
    f.store.approve(other.effectId, approvalBinding(other));
    const otherFixture = { ...f, started: other }, written = dispatch(t, otherFixture);
    f.store.settle(other.effectId, bytes(written.proof)); assert.equal(member(otherFixture).report(bytes(report(otherFixture))), 'accepted');
    assert.equal(assignment(f).closed, false);
    const stale = { commandId: randomUUID(), ...f.store.attention(f.started.effectId), outcome: 'close_uncertain', attentionSequence: 1 };
    assert.equal(f.store.resolve(stale), 'rejected'); assert.equal(resolve(f), 'accepted');
    assert.equal(f.store.registry()[0].state, 'needs_attention'); assert.equal(assignment(f).closed, false);
    assert.equal(member(f).report(bytes(report(f))), 'rejected');
    assert.equal(member(f).report(bytes(report(f, { status: 'failed' }))), 'accepted');
    assert.equal(f.store.registry()[0].state, 'failed');
  } finally { f.store.close(); }
});

test('duplicate witness records stay uncertain and explicit matching confirmation still requires report', t => {
  for (const copies of [1, 2]) {
    const f = fixture(t);
    try {
      const written = dispatch(t, f, copies); f.store.settle(f.started.effectId, bytes({ scope: 'unavailable' }));
      const before = assignment(f).remainingEvents;
      assert.equal(resolve(f, 'confirm_completed', written.proof), copies === 1 ? 'accepted' : 'rejected');
      assert.equal(assignment(f).closed, false);
      assert.equal(assignment(f).remainingEvents, before - (copies === 1 ? 1 : 0));
      assert.equal(member(f).report(bytes(report(f))), copies === 1 ? 'accepted' : 'rejected');
      assert.equal(written.observe().rows.length, copies);
    } finally { f.store.close(); }
  }
});

test('reopen fences new writes until recovery acknowledges the interrupted attempt exactly once', t => {
  const f = fixture(t), other = addTask(f, f.setup.leaderId);
  f.store.scheduler().start(bytes(other)); f.store.approve(other.effectId, approvalBinding(other));
  const written = dispatch(t, f), recovery = ownerCommand(f), before = f.store.snapshot();
  f.store.close(); f.store = TaskStore.openEngine(f.root);
  try {
    assert.deepEqual(f.store.snapshot(), before);
    assert.throws(() => f.store.execute(bytes(command())), /engine-recovery-required/);
    assert.throws(() => f.store.settle(f.started.effectId, bytes(written.proof)), /engine-recovery-required/);
    assert.throws(() => f.store.claim(other.effectId), /engine-recovery-required/);
    assert.throws(() => f.store.cancel(f.started.effectId), /engine-recovery-required/);
    assert.throws(() => member(f).report(bytes(report(f))), /engine-recovery-required/);
    assert.throws(() => f.store.scheduler().start(bytes({ ...other, commandId: randomUUID() })), /engine-recovery-required/);
    assert.equal(f.store.scheduler().start(bytes(f.started)), 'accepted');
    assert.throws(() => f.store.claim(f.started.effectId), /mock-already-claimed-or-stopped/);
    assert.equal(f.store.owner().recover(bytes(recovery)), 'accepted');
    assert.equal(f.store.registry()[0].state, 'reconciling');
    assert.equal(assignment(f).remainingEvents, 4);
    const acknowledged = f.store.snapshot(); assert.equal(f.store.owner().recover(bytes(recovery)), 'accepted');
    assert.deepEqual(f.store.snapshot(), acknowledged);
    assert.equal(f.store.owner().recover(bytes(ownerCommand(f))), 'rejected'); assert.equal(assignment(f).remainingEvents, 4);
    f.store.close(); f.store = TaskStore.openEngine(f.root);
    f.store.settle(f.started.effectId, bytes(written.observe()));
    assert.equal(f.store.registry()[0].state, 'running'); assert.equal(assignment(f).closed, false);
    assert.equal(member(f).report(bytes(report(f))), 'accepted'); assert.equal(written.observe().rows.length, 1);
  } finally { f.store.close(); }
});

test('recovery is atomic across multiple interrupted members and role/wire/no-op refusals preserve budgets', t => {
  const f = fixture(t), other = addTask(f, f.setup.leaderId);
  try {
    f.store.scheduler().start(bytes(other)); f.store.approve(other.effectId, approvalBinding(other));
    f.store.claim(f.started.effectId); f.store.claim(other.effectId); f.store.close(); f.store = TaskStore.openEngine(f.root);
    const request = ownerCommand(f), before = f.store.snapshot(), original = Database.prototype.exec;
    assert.equal(member(f).recover, undefined);
    for (const changes of [{ actor: 'owner' }, { sessionId: 1 }, { extra: true }])
      assert.throws(() => f.store.owner().recover(bytes({ ...request, ...changes })));
    assert.deepEqual(f.store.snapshot(), before);
    Database.prototype.exec = function (sql) {
      const returned = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER fail_recover BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-recover-abort'); END");
      return returned;
    };
    try { assert.throws(() => f.store.owner().recover(bytes(request)), /fixture-recover-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.owner().recover(bytes(request)), 'accepted');
    const after = f.store.snapshot(); assert.equal(after.commands.length, before.commands.length + 1);
    assert(after.assignments.every(([, row]) => row.recoveryAcknowledged && row.remainingEvents === 4));
    assert(after.tasks.every(([, state]) => state === 'reconciling'));
  } finally { f.store.close(); }
});

test('planned approved work can receive its first claim after reopen without a recovery event', t => {
  const f = fixture(t); f.store.close(); f.store = TaskStore.openEngine(f.root);
  try {
    assert.equal(f.store.owner().recover(bytes(ownerCommand(f))), 'rejected');
    const invocation = f.store.claim(f.started.effectId); assert.equal(invocation.attemptId, f.started.attemptId);
    assert.throws(() => f.store.claim(f.started.effectId), /mock-already-claimed-or-stopped/);
  } finally { f.store.close(); }
});

test('stop of dispatched work preserves uncertainty until explicit resolution and never infers done', t => {
  for (const outcome of ['confirm_completed', 'close_uncertain']) {
    const f = fixture(t), written = dispatch(t, f), request = ownerCommand(f, 'team.session.stop');
    try {
      const reserved = assignment(f).remainingEvents;
      assert.equal(f.store.owner().stop(bytes(request)), 'accepted');
      assert.equal(f.store.registry()[0].state, 'needs_attention'); assert.equal(assignment(f).closed, false);
      assert.equal(assignment(f).remainingEvents, reserved);
      const attention = f.store.attention(f.started.effectId), before = f.store.snapshot();
      assert.equal(f.store.owner().stop(bytes(request)), 'accepted'); assert.deepEqual(f.store.snapshot(), before);
      assert.equal(f.store.owner().stop(bytes(ownerCommand(f, 'team.session.stop'))), 'rejected');
      assert.deepEqual(f.store.attention(f.started.effectId), attention);
      assert.throws(() => f.store.claim(f.started.effectId), /mock-already-claimed-or-stopped/);
      assert.equal(member(f).report(bytes(report(f))), 'rejected');
      assert.equal(resolve(f, outcome, outcome === 'confirm_completed' ? written.proof : undefined), 'accepted');
      assert.equal(assignment(f).closed, true); assert.equal(assignment(f).remainingEvents, 0);
      assert.equal(f.store.registry()[0].state, outcome === 'confirm_completed' ? 'cancelled' : 'failed');
      assert.equal(member(f).report(bytes(report(f))), 'rejected'); assert.equal(written.observe().rows.length, 1);
    } finally { f.store.close(); }
  }
});

test('stop preserves preexisting attention sequence and terminal effects awaiting a failed report', t => {
  for (const state of ['attention', 'completed', 'abandoned']) {
    const f = fixture(t), written = dispatch(t, f);
    try {
      f.store.settle(f.started.effectId, bytes(state === 'completed' ? written.proof : { scope: 'unavailable' }));
      const attention = state === 'completed' ? null : f.store.attention(f.started.effectId);
      if (state === 'abandoned') resolve(f);
      f.store.owner().stop(bytes(ownerCommand(f, 'team.session.stop')));
      if (state === 'attention') {
        assert.deepEqual(f.store.attention(f.started.effectId), attention); resolve(f);
      } else {
        assert.equal(assignment(f).closed, false); assert.equal(member(f).report(bytes(report(f))), 'rejected');
        assert.equal(member(f).report(bytes(report(f, { status: 'failed' }))), 'accepted');
      }
      assert.equal(assignment(f).closed, true);
    } finally { f.store.close(); }
  }
});

test('active raw cancellation and deadline release nothing before failed reporting', t => {
  for (const mode of ['cancel', 'deadline']) {
    const f = fixture(t);
    try {
      if (mode === 'deadline') {
        // No fake timer: start an already expired plan in a new member reservation.
        const other = addTask(f, f.setup.leaderId); other.expiresAt = 0;
        f.store.scheduler().start(bytes(other)); f.started = other;
        assert.equal(f.store.claim(other.effectId), null);
      } else f.store.cancel(f.started.effectId);
      assert.equal(assignment(f).closed, false); assert.equal(f.store.registry().find(row => row.taskId === f.started.taskId).state, 'needs_attention');
      assert.equal(member(f).report(bytes(report(f))), 'rejected');
      assert.equal(member(f).report(bytes(report(f, { status: 'failed' }))), 'accepted');
    } finally { f.store.close(); }
  }
});

test('report transaction abort retains completion proof and the live reservation until retry commits', t => {
  const f = fixture(t), written = dispatch(t, f), request = report(f), original = Database.prototype.exec;
  try {
    f.store.settle(f.started.effectId, bytes(written.proof)); const before = f.store.snapshot();
    Database.prototype.exec = function (sql) {
      const returned = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER fail_report BEFORE INSERT ON effects BEGIN SELECT RAISE(ABORT,'fixture-report-abort'); END");
      return returned;
    };
    try { assert.throws(() => member(f).report(bytes(request)), /fixture-report-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(member(f).report(bytes(request)), 'accepted'); assert.equal(written.observe().rows.length, 1);
  } finally { f.store.close(); }
});

test('reserved capacity admits claim recovery settlement resolution report and stop after rejection pressure', t => {
  const f = fixture(t), witnessRoot = privateRoot(t); witness('create', witnessRoot, f.started); f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE');
    const start = database.prepare('SELECT max(sequence) AS count FROM events').get().count + 1;
    const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)'), decision = database.prepare('INSERT INTO commands VALUES (?,?)');
    for (let sequence = start; sequence <= 993; sequence++) {
      const rejected = command({ taskId: f.started.taskId }); event.run(sequence, JSON.stringify(rejected));
      decision.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  f.store = TaskStore.openEngine(f.root);
  try {
    assert.throws(() => member(f).report(bytes(report(f))), /mock-reserved-history-limit/);
    const invocation = f.store.claim(f.started.effectId); witness('write', witnessRoot, f.started, invocation);
    f.store.close(); f.store = TaskStore.openEngine(f.root);
    const recovery = ownerCommand(f); assert.equal(f.store.owner().recover(bytes(recovery)), 'accepted');
    assert.throws(() => f.store.owner().recover(bytes(ownerCommand(f))), /mock-reserved-history-limit/);
    f.store.settle(f.started.effectId, bytes({ scope: 'unavailable' }));
    const proof = witness('observe', witnessRoot, f.started, { effectId: f.started.effectId, attemptId: f.started.attemptId });
    assert.equal(resolve(f, 'confirm_completed', proof), 'accepted');
    assert.equal(member(f).report(bytes(report(f))), 'accepted');
    assert.equal(f.store.owner().stop(bytes(ownerCommand(f, 'team.session.stop'))), 'accepted');
    assert.equal(assignment(f).closed, true); assert.equal(proof.rows.length, 1);
  } finally { f.store.close(); }
});

test('tampered result actor, summary hash, recovery decision and derived task projection refuse reopen', t => {
  for (const kind of ['actor', 'summary', 'recovery', 'projection']) {
    const f = fixture(t), written = dispatch(t, f), request = report(f);
    f.store.close(); f.store = TaskStore.openEngine(f.root);
    f.store.owner().recover(bytes(ownerCommand(f))); f.store.settle(f.started.effectId, bytes(written.proof));
    member(f).report(bytes(request)); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      if (kind === 'projection') database.prepare('UPDATE tasks SET value=?').run(JSON.stringify('completed'));
      else {
        const type = kind === 'recovery' ? 'team.session.recover' : 'team.task.report';
        const event = database.prepare('SELECT sequence,body FROM events WHERE type=?').get(type), body = JSON.parse(event.body);
        if (kind === 'actor') body.actor = f.setup.leaderId;
        else if (kind === 'summary') body.command.summary = 'Changed stored summary';
        else body.result = 'rejected';
        database.prepare('UPDATE events SET body=? WHERE sequence=?').run(JSON.stringify(body), event.sequence);
      }
    } finally { database.close(); }
    assert.throws(() => TaskStore.openEngine(f.root), /invalid-lifecycle-decision|mock-projection-drift/);
  }
});

for (const operation of ['report', 'sessionRecover', 'claim', 'sessionStop']) for (const barrier of ['before', 'after']) {
  test(`assigned ${operation} crash ${barrier} COMMIT recovers state without resending the witness`, async t => {
    const f = fixture(t), written = operation === 'claim' ? observer(t, f) : dispatch(t, f);
    if (operation === 'report') f.store.settle(f.started.effectId, bytes(written.proof));
    f.store.close();
    const request = operation === 'report' ? report(f) : ownerCommand(f, operation === 'sessionStop' ? 'team.session.stop' : 'team.session.recover');
    const host = launch('openEngine', f.root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true });
      host.send(JSON.stringify({ op: operation, command: request, effectId: f.started.effectId }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    f.store = TaskStore.openEngine(f.root);
    try {
      const state = f.store.registry()[0].state;
      if (operation === 'claim') {
        assert.equal(state, 'running');
        if (barrier === 'after') {
          assert.throws(() => f.store.claim(f.started.effectId), /mock-already-claimed-or-stopped/);
          assert.equal(f.store.owner().recover(bytes(ownerCommand(f))), 'accepted');
          f.store.settle(f.started.effectId, bytes({ scope: 'unavailable' })); resolve(f);
          assert.equal(member(f).report(bytes(report(f, { status: 'failed' }))), 'accepted');
        } else assert.equal(f.store.claim(f.started.effectId).attemptId, f.started.attemptId);
      } else if (operation === 'report') {
        assert.equal(state, barrier === 'after' ? 'done' : 'running');
        assert.equal(member(f).report(bytes(request)), 'accepted'); assert.equal(assignment(f).closed, true);
      } else if (operation === 'sessionRecover') {
        assert.equal(state, barrier === 'after' ? 'reconciling' : 'running');
        assert.equal(f.store.owner().recover(bytes(request)), 'accepted');
        f.store.settle(f.started.effectId, bytes(written.observe()));
        assert.equal(member(f).report(bytes(report(f))), 'accepted');
      } else {
        assert.equal(state, barrier === 'after' ? 'needs_attention' : 'running');
        assert.equal(f.store.owner().stop(bytes(request)), 'accepted'); assert.equal(assignment(f).closed, false);
        assert.equal(resolve(f, 'confirm_completed', written.proof), 'accepted'); assert.equal(assignment(f).closed, true);
      }
      assert.equal(written.observe().rows.length, operation === 'claim' ? 0 : 1);
    } finally { f.store.close(); }
  });
}

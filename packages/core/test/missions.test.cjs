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
const { startTask, enqueue, ask, answer, report, ownerCommand, complete, observer } = require('./question-fixtures.cjs');
const { launch } = require('./processes.cjs');

function fixture(t) {
  const root = privateRoot(t), store = TaskStore.createMissionEngine(root), setup = session();
  assert.equal(store.owner().mission(), null); store.owner().createSession(bytes(setup));
  return { root, store, setup };
}
function leader(f) { return f.store.member(f.setup.leaderId); }
function request(f, changes = {}) {
  return { type: 'team.mission.complete', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
    summary: 'All synthetic work successfully reported', ...changes };
}
function finished(t, f) {
  const planned = startTask(f, { approved: true }), written = complete(t, f, planned);
  const result = report(f, planned); assert.equal(f.store.member(planned.memberId).report(bytes(result)), 'accepted');
  return { planned, written, result };
}

test('mission roots are fresh schema5 only and completion entry points refuse older roots', t => {
  for (const version of [3, 4, 5]) {
    const root = privateRoot(t), store = version === 3 ? TaskStore.createEngine(root)
      : version === 4 ? TaskStore.createQuestionEngine(root) : TaskStore.createMissionEngine(root);
    const setup = session(); store.owner().createSession(bytes(setup));
    if (version !== 5) {
      assert.throws(() => store.owner().mission(), /mission-root-required/);
      assert.throws(() => store.member(setup.leaderId).completeMission(bytes({})), /mission-root-required/);
    }
    store.close();
    if (version !== 5) assert.throws(() => TaskStore.openMissionEngine(root), /unsupported-mock-database/);
    else {
      for (const opener of ['open', 'openEngine', 'openQuestionEngine']) assert.throws(() => TaskStore[opener](root), /unsupported-mock-database/);
      const opened = TaskStore.openMissionEngine(root); opened.close();
    }
  }
});

test('leader without an assignment explicitly completes all-done mission with exact detached view and no action', t => {
  const f = fixture(t);
  try {
    const { planned, written, result } = finished(t, f), before = f.store.snapshot(), cmd = request(f);
    assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted');
    const after = f.store.snapshot();
    for (const key of ['tasks', 'effects', 'assignments', 'questions', 'approvals']) assert.deepEqual(after[key], before[key]);
    const view = leader(f).mission();
    assert.deepEqual(Object.keys(view), ['sessionId', 'status', 'completion']);
    assert.deepEqual(Object.keys(view.completion), ['summary', 'completedBy', 'sequence']);
    assert.equal(view.status, 'completed'); assert.equal(view.completion.summary, cmd.summary);
    assert.equal(view.completion.completedBy, f.setup.leaderId);
    assert(Number.isSafeInteger(view.completion.sequence));
    view.completion.summary = 'Mutated'; assert.equal(f.store.owner().mission().completion.summary, cmd.summary);
    assert.deepEqual(f.store.member(planned.memberId).mission(), f.store.owner().mission());
    assert.equal(written.observe().rows.length, 1);
    assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted');
    assert.equal(f.store.member(planned.memberId).report(bytes(result)), 'accepted');
    assert.deepEqual(f.store.snapshot(), after);
    f.store.close();
    const observer = new Database(path.join(f.root, 'core.sqlite'), { readonly: true });
    try { assert.equal(observer.prepare('SELECT sequence FROM events WHERE type=\'team.mission.complete\'').get().sequence, leaderSequence(after)); }
    finally { observer.close(); }
    f.store = TaskStore.openMissionEngine(f.root);
    assert.deepEqual(f.store.snapshot(), after); assert.equal(written.observe().rows.length, 1);
    assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted');
  } finally { f.store.close(); }
});

function leaderSequence(snapshot) { return snapshot.sessions[0][1].completion.sequence; }

test('independent replay rejects injected mutations after completion and an unearned completion decision', t => {
  for (const kind of ['approve', 'claim', 'stop', 'settle', 'task.create', 'plan', 'task.plan', 'unearned']) {
    const f = fixture(t);
    let planned;
    if (kind === 'unearned') planned = startTask(f); else {
      ({ planned } = finished(t, f)); leader(f).completeMission(bytes(request(f)));
    }
    f.store.close(); const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      const sequence = database.prepare('SELECT max(sequence) AS n FROM events').get().n + 1;
      const created = command(), rawPlan = plan();
      const body = kind === 'task.create' ? created : ['plan', 'task.plan'].includes(kind) ? rawPlan
        : kind === 'unearned' ? { command: request(f), actor: f.setup.leaderId, result: 'accepted' }
          : kind === 'approve' ? { effectId: planned.effectId, binding: approvalBinding(planned) }
            : kind === 'claim' ? { effectId: planned.effectId, observedAt: Date.now() }
              : kind === 'stop' ? { effectId: planned.effectId, reason: 'cancel', observedAt: Date.now() }
                : { effectId: planned.effectId, proof: null };
      database.prepare('INSERT INTO events VALUES (?,?,?)').run(sequence, kind === 'unearned' ? 'team.mission.complete' : kind, JSON.stringify(body));
      // A forged accepted ledger cannot turn the post-completion create into success.
      if (kind === 'task.create') database.prepare('INSERT INTO commands VALUES (?,?)').run(created.commandId,
        JSON.stringify({ hash: commandHash(created), result: 'accepted' }));
    } finally { database.close(); }
    assert.throws(() => TaskStore.openMissionEngine(f.root), /mission-completed|mock-projection-drift|invalid-mission-decision/);
  }
});

test('mission grammar authority and shared ledger reject malformed input wrong actors and changed retries', t => {
  const f = fixture(t);
  try {
    finished(t, f); const cmd = request(f), before = f.store.snapshot();
    for (const changes of [{ actor: f.setup.leaderId }, { summary: '' }, { summary: '\ud800' }, { summary: 'a'.repeat(257) },
      { version: 2 }, { commandId: true }, { success: true }]) assert.throws(() => leader(f).completeMission(bytes({ ...cmd, ...changes })));
    for (const wire of [Buffer.alloc(16385), Buffer.from([255]), Buffer.from(' ' + JSON.stringify(cmd)),
      Buffer.from(JSON.stringify(cmd).replace('"version":1', '"version":1,"version":1'))]) assert.throws(() => leader(f).completeMission(wire));
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.store.owner().completeMission, undefined);
    assert.equal(f.store.member(f.setup.members[1].memberId).completeMission(bytes(cmd)), 'rejected');
    assert.throws(() => leader(f).completeMission(bytes(cmd)), /mock-command-conflict/);
    assert.equal(leader(f).completeMission(bytes(request(f, { sessionId: randomUUID() }))), 'rejected');
    const accepted = request(f); assert.equal(leader(f).completeMission(bytes(accepted)), 'accepted');
    assert.throws(() => leader(f).completeMission(bytes({ ...accepted, summary: 'Changed' })), /mock-command-conflict/);
    assert.throws(() => f.store.execute(bytes(command({ commandId: accepted.commandId }))), /mock-command-conflict/);
  } finally { f.store.close(); }
});

test('every unfinished failed cancelled or unassigned condition prevents mission success', t => {
  for (const state of ['empty', 'queued', 'unapproved', 'approved', 'blocked', 'dispatching', 'reconciling',
    'attention', 'completed', 'failed', 'cancelled', 'unassigned', 'legacy']) {
    const f = fixture(t);
    try {
      if (state === 'unassigned') { finished(t, f); f.store.execute(bytes(command())); }
      else if (state === 'legacy') { finished(t, f); f.store.plan(plan()); }
      else if (state === 'queued') enqueue(f);
      else if (state !== 'empty') {
        const planned = startTask(f, { approved: !['unapproved', 'blocked'].includes(state) });
        if (state === 'blocked') f.store.member(planned.memberId).ask(bytes(ask(f, planned)));
        if (['dispatching', 'reconciling', 'attention'].includes(state)) {
          f.store.claim(planned.effectId);
          if (state === 'reconciling') f.store.owner().recover(bytes(ownerCommand(f, 'team.session.recover')));
          if (state === 'attention') f.store.cancel(planned.effectId);
        }
        if (['completed', 'failed'].includes(state)) {
          complete(t, f, planned);
          if (state === 'failed') f.store.member(planned.memberId).report(bytes(report(f, planned, 'failed')));
        }
        if (state === 'cancelled') {
          f.store.cancel(planned.effectId); f.store.member(planned.memberId).report(bytes(report(f, planned, 'failed')));
        }
      }
      assert.equal(leader(f).completeMission(bytes(request(f))), 'rejected', state);
      assert.equal(f.store.owner().mission().status, 'active');
      assert.equal(f.store.owner().mission().completion, null);
    } finally { f.store.close(); }
  }
});

test('completed mission refuses new admission and lifecycle mutations while historical retries remain stable', t => {
  const f = fixture(t);
  try {
    const { planned, written } = finished(t, f), cmd = request(f); leader(f).completeMission(bytes(cmd));
    const before = f.store.snapshot();
    assert.equal(leader(f).completeMission(bytes(request(f))), 'rejected');
    assert.equal(f.store.owner().stop(bytes(ownerCommand(f))), 'rejected');
    assert.equal(f.store.owner().recover(bytes(ownerCommand(f, 'team.session.recover'))), 'rejected');
    assert.equal(f.store.plan(plan()), 'rejected'); assert.equal(f.store.planForTask(plan()), 'rejected');
    f.store.execute(bytes(command()));
    assert.equal(f.store.registry().length, before.tasks.length);
    assert.equal(leader(f).enqueue(bytes({ type: 'team.task.enqueue', version: 1, commandId: randomUUID(), sessionId: f.setup.sessionId,
      taskId: randomUUID(), memberId: planned.memberId })), 'rejected');
    assert.equal(f.store.member(planned.memberId).ask(bytes(ask(f, planned))), 'rejected');
    assert.equal(f.store.member(planned.memberId).report(bytes(report(f, planned))), 'rejected');
    assert.throws(() => f.store.claim(planned.effectId)); assert.throws(() => f.store.cancel(planned.effectId));
    assert.throws(() => f.store.approve(planned.effectId, approvalBinding(planned)));
    f.store.settle(planned.effectId, bytes(written.proof));
    assert.equal(written.observe().rows.length, 1);
    const after = f.store.snapshot();
    for (const key of ['tasks', 'effects', 'assignments', 'questions', 'sessions']) assert.deepEqual(after[key], before[key]);
  } finally { f.store.close(); }
});

test('mission completion abort at actual SQLite projection write rolls back every state and decision', t => {
  const f = fixture(t), original = Database.prototype.exec;
  try {
    finished(t, f); const before = f.store.snapshot(), cmd = request(f);
    Database.prototype.exec = function (sql) {
      const result = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER fail_mission BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-mission-abort'); END");
      return result;
    };
    try { assert.throws(() => leader(f).completeMission(bytes(cmd)), /fixture-mission-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(f.store.snapshot(), before); assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted');
  } finally { Database.prototype.exec = original; f.store.close(); }
});

test('held terminal reserve admits successful completion at event1000 and exact retry after reopen', t => {
  const f = fixture(t); const { planned } = finished(t, f); f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE'); const first = database.prepare('SELECT max(sequence) AS n FROM events').get().n + 1;
    for (let sequence = first; sequence <= 999; sequence++) {
      const rejected = command({ taskId: planned.taskId });
      database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)').run(sequence, JSON.stringify(rejected));
      database.prepare('INSERT INTO commands VALUES (?,?)').run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  f.store = TaskStore.openMissionEngine(f.root);
  try {
    const rejected = request(f); assert.throws(() => f.store.member(planned.memberId).completeMission(bytes(rejected)), /mock-reserved-history-limit/);
    const cmd = request(f); assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted');
    assert.equal(f.store.owner().mission().completion.sequence, 1000);
    const expected = f.store.snapshot(); f.store.close(); f.store = TaskStore.openMissionEngine(f.root);
    assert.equal(leader(f).completeMission(bytes(cmd)), 'accepted'); assert.deepEqual(f.store.snapshot(), expected);
    assert.throws(() => f.store.execute(bytes(command())), /mock-history-limit/);
  } finally { f.store.close(); }
});

test('recovery fence applies to new completion but not past decisions and recovery never completes', t => {
  const f = fixture(t);
  try {
    const cmd = request(f); assert.equal(leader(f).completeMission(bytes(cmd)), 'rejected');
    const planned = startTask(f, { approved: true }), observed = observer(t, planned);
    witness('write', observed.root, planned, f.store.claim(planned.effectId));
    f.store.close(); f.store = TaskStore.openMissionEngine(f.root);
    assert.equal(leader(f).completeMission(bytes(cmd)), 'rejected');
    assert.throws(() => leader(f).completeMission(bytes(request(f))), /engine-recovery-required/);
    f.store.owner().recover(bytes(ownerCommand(f, 'team.session.recover')));
    assert.equal(f.store.owner().mission().status, 'active');
    f.store.settle(planned.effectId, bytes(observed.observe()));
    assert.equal(leader(f).completeMission(bytes(request(f))), 'rejected');
    f.store.member(planned.memberId).report(bytes(report(f, planned)));
    assert.equal(leader(f).completeMission(bytes(request(f))), 'accepted');
    assert.equal(observed.observe().rows.length, 1);
  } finally { f.store.close(); }
});

test('stop and completion are mutually exclusive terminal decisions', t => {
  const f = fixture(t);
  try { finished(t, f); f.store.owner().stop(bytes(ownerCommand(f)));
    assert.equal(leader(f).completeMission(bytes(request(f))), 'rejected'); assert.equal(f.store.owner().mission().status, 'stopped');
  } finally { f.store.close(); }
});

test('tampered completion view command hash and accepted decision refuse reopen', t => {
  for (const kind of ['summary', 'completedBy', 'sequence', 'status', 'hash', 'decision']) {
    const f = fixture(t); finished(t, f); const cmd = request(f); leader(f).completeMission(bytes(cmd)); f.store.close();
    const database = new Database(path.join(f.root, 'core.sqlite'));
    try {
      if (kind === 'hash') {
        const row = JSON.parse(database.prepare('SELECT value FROM commands WHERE id=?').get(cmd.commandId).value); row.hash = '0'.repeat(64);
        database.prepare('UPDATE commands SET value=? WHERE id=?').run(JSON.stringify(row), cmd.commandId);
      } else if (kind === 'decision') {
        const row = database.prepare('SELECT sequence,body FROM events WHERE type=\'team.mission.complete\'').get();
        const body = JSON.parse(row.body); body.result = 'rejected';
        database.prepare('UPDATE events SET body=? WHERE sequence=?').run(JSON.stringify(body), row.sequence);
      } else {
        const row = JSON.parse(database.prepare('SELECT value FROM sessions').get().value);
        if (kind === 'status') row.status = 'active'; else row.completion[kind] = kind === 'sequence' ? 1 : 'Changed';
        database.prepare('UPDATE sessions SET value=?').run(JSON.stringify(row));
      }
    } finally { database.close(); }
    assert.throws(() => TaskStore.openMissionEngine(f.root), /mock-projection-drift|invalid-mission-decision/);
  }
});

for (const barrier of ['before', 'after']) test(`mission crash ${barrier} COMMIT recovers one decision without action`, async t => {
  const f = fixture(t), { written } = finished(t, f), cmd = request(f), before = f.store.snapshot(); f.store.close();
  const host = launch('openMissionEngine', f.root, barrier, 'mock-host.cjs');
  try { assert.deepEqual(await host.read(), { ready: true }); host.send(JSON.stringify({ op: 'missionComplete', command: cmd }));
    assert.deepEqual(await host.read(), { barrier });
  } finally { await host.stop(); }
  const recovery = launch('openMissionEngine', f.root, null, 'mock-host.cjs');
  try {
    assert.deepEqual(await recovery.read(), { ready: true }); recovery.send(JSON.stringify({ op: 'snapshot' }));
    const initial = (await recovery.read()).result;
    if (barrier === 'before') assert.deepEqual(initial, before); else assert.equal(initial.sessions[0][1].status, 'completed');
    recovery.send(JSON.stringify({ op: 'missionComplete', command: cmd })); assert.equal((await recovery.read()).result, 'accepted');
    recovery.send(JSON.stringify({ op: 'snapshot' })); const after = (await recovery.read()).result;
    assert.equal(after.commands.length, before.commands.length + 1); assert.equal(after.sessions[0][1].status, 'completed');
    assert.equal(written.observe().rows.length, 1);
  } finally { await recovery.stop(); }
});

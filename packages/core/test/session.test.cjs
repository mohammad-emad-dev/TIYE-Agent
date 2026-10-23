'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore } = require('../dist');
const { commandHash } = require('../dist/command');
const { command, bytes, privateRoot } = require('./helpers.cjs');
const { launch } = require('./processes.cjs');

function session() {
  const members = ['Leader', 'Coder'].map(name => ({ memberId: randomUUID(), name, instructions: 'Synthetic fixture only' }));
  return { type: 'team.session.create', version: 1, commandId: randomUUID(), sessionId: randomUUID(),
    leaderId: members[0].memberId, members, maxConcurrent: 2 };
}

test('session creation, immutable roster and bound member contexts survive reopen', t => {
  const root = privateRoot(t), request = session();
  let store = TaskStore.createEngine(root);
  try {
    assert.equal(store.owner().session(), null);
    assert.equal(store.owner().createSession(bytes(request)), 'accepted');
    const owner = store.owner(), leader = store.member(request.leaderId), member = store.member(request.members[1].memberId);
    assert.equal(leader.context().role, 'leader');
    assert.equal(member.context().role, 'member');
    assert.equal(member.context().memberId, request.members[1].memberId);
    assert.equal(member.createSession, undefined);
    assert.equal(member.owner, undefined);
    assert(Object.isFrozen(member));
    const copy = owner.session(); copy.members[0].name = 'Changed copy';
    assert.equal(leader.context().name, 'Leader');
    assert.throws(() => store.member(randomUUID()), /member-outside-session/);
    const rejected = session(); assert.equal(owner.createSession(bytes(rejected)), 'rejected');
    const expected = store.snapshot(); store.close(); store = TaskStore.openEngine(root);
    assert.throws(() => member.context(), /mock-store-closed/);
    assert.equal(store.owner().createSession(bytes(request)), 'accepted');
    assert.equal(store.owner().createSession(bytes(rejected)), 'rejected');
    assert.deepEqual(store.snapshot(), expected);
    assert.throws(() => store.owner().createSession(bytes({ ...request, maxConcurrent: 1 })), /mock-command-conflict/);
    assert.equal(store.owner().session().sessionId, request.sessionId);
  } finally { store.close(); }
});

test('malformed roster, concurrency, authority and wire data refuse without admission', t => {
  const root = privateRoot(t), request = session(), store = TaskStore.createEngine(root);
  try {
    const before = store.snapshot();
    const invalid = [{ actor: 'owner' }, { version: 2 }, { commandId: 'invalid' }, { sessionId: false },
      { leaderId: randomUUID() }, { members: [] }, { members: [...request.members, ...request.members, ...request.members] },
      { members: [request.members[0], request.members[0]] }, { members: [null] },
      { members: [{ ...request.members[0], name: '' }] }, { members: [{ ...request.members[0], instructions: '\ud800' }] },
      { members: [{ ...request.members[0], instructions: 'x'.repeat(257) }] },
      { members: [{ ...request.members[0], role: 'leader' }] }, { maxConcurrent: true }, { maxConcurrent: 0 },
      { maxConcurrent: 3 }, { maxConcurrent: 1.5 }];
    for (const changes of invalid) assert.throws(() => store.owner().createSession(bytes({ ...request, ...changes })));
    for (const wire of [Buffer.alloc(16385), Buffer.from('{'), Buffer.from([0xff]), Buffer.from('\ufeffnull'),
      Buffer.from(' ' + JSON.stringify(request)),
      Buffer.from(JSON.stringify(request).replace('"version":1', '"version":1,"version":1'))])
      assert.throws(() => store.owner().createSession(wire));
    assert.deepEqual(store.snapshot(), before);
  } finally { store.close(); }
});

test('schema 3 session commands and task commands share one ledger and transaction owner', t => {
  const root = privateRoot(t), store = TaskStore.createEngine(root), request = session();
  try {
    store.owner().createSession(bytes(request));
    assert.throws(() => store.execute(bytes(command({ commandId: request.commandId }))), /mock-command-conflict/);
    const task = command(); assert.equal(store.execute(bytes(task)).status, 'accepted');
    assert.throws(() => store.owner().createSession(bytes({ ...session(), commandId: task.commandId })), /mock-command-conflict/);
    assert.equal(store.snapshot().commands.length, 2);
    assert.equal(store.registry()[0].taskId, task.taskId);
    assert.equal(store.owner().session().sessionId, request.sessionId);
  } finally { store.close(); }
});

test('schema 2 and schema 3 require their exact openers without migration', t => {
  const oldRoot = privateRoot(t), root = privateRoot(t);
  const old = TaskStore.create(oldRoot), store = TaskStore.createEngine(root);
  try { assert.throws(() => old.owner(), /engine-root-required/); }
  finally { old.close(); store.close(); }
  assert.throws(() => TaskStore.open(root), /unsupported-mock-database/);
  assert.throws(() => TaskStore.openEngine(oldRoot), /unsupported-mock-database/);
  const reopened = TaskStore.openEngine(root); reopened.close();
  const oldReopened = TaskStore.open(oldRoot); oldReopened.close();
});

test('actual SQLite session projection abort rolls back event and command', t => {
  const root = privateRoot(t), store = TaskStore.createEngine(root), original = Database.prototype.exec;
  const before = store.snapshot(), request = session();
  try {
    Database.prototype.exec = function (sql) {
      const result = original.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') original.call(this,
        "CREATE TEMP TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture-session-abort'); END");
      return result;
    };
    try { assert.throws(() => store.owner().createSession(bytes(request)), /fixture-session-abort/); }
    finally { Database.prototype.exec = original; }
    assert.deepEqual(store.snapshot(), before);
    assert.equal(store.owner().createSession(bytes(request)), 'accepted');
  } finally { store.close(); }
});

test('tampered session decision or projection refuses startup', t => {
  for (const target of ['event', 'projection']) {
    const root = privateRoot(t), store = TaskStore.createEngine(root), request = session();
    store.owner().createSession(bytes(request)); store.close();
    const database = new Database(path.join(root, 'core.sqlite'));
    try {
      if (target === 'event') database.prepare('UPDATE events SET body=?').run(JSON.stringify({ command: request, actor: 'owner', result: 'rejected' }));
      else database.prepare('UPDATE sessions SET value=?').run(JSON.stringify({ sessionId: request.sessionId }));
    } finally { database.close(); }
    assert.throws(() => TaskStore.openEngine(root), /invalid-session-event-decision|mock-projection-drift/);
  }
});

test('schema 3 excludes an idle competing owner', t => {
  const root = privateRoot(t), store = TaskStore.createEngine(root);
  try {
    const rival = spawnSync(process.execPath, [path.join(__dirname, 'mock-host.cjs'), 'openEngine', root],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true });
    assert.notEqual(rival.status, 0); assert.match(rival.stderr, /SQLITE_BUSY/);
    assert.equal(store.owner().createSession(bytes(session())), 'accepted');
  } finally { store.close(); }
});

test('session stop reserve survives near-limit unrelated task traffic', t => {
  const root = privateRoot(t), request = session(), task = command(), store = TaskStore.createEngine(root);
  store.owner().createSession(bytes(request)); store.execute(bytes(task)); store.close();
  const database = new Database(path.join(root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE');
    const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)');
    const decision = database.prepare('INSERT INTO commands VALUES (?,?)');
    for (let sequence = 3; sequence <= 999; sequence++) {
      const rejected = command({ taskId: task.taskId });
      event.run(sequence, JSON.stringify(rejected));
      decision.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  const recovered = TaskStore.openEngine(root);
  try {
    assert.throws(() => recovered.execute(bytes(command())), /mock-reserved-history-limit/);
    assert.throws(() => recovered.owner().createSession(bytes(session())), /mock-reserved-history-limit/);
    assert.equal(recovered.owner().createSession(bytes(request)), 'accepted');
    assert.equal(recovered.execute(bytes(task)).status, 'accepted');
    assert.equal(recovered.snapshot().commands.length, 999);
  } finally { recovered.close(); }
});

for (const barrier of ['before', 'after']) {
  test(`session creation crash ${barrier} COMMIT recovers one decision and roster`, async t => {
    const root = privateRoot(t), request = session(), store = TaskStore.createEngine(root); store.close();
    const host = launch('openEngine', root, barrier, 'mock-host.cjs');
    try {
      assert.deepEqual(await host.read(), { ready: true });
      host.send(JSON.stringify({ op: 'sessionCreate', command: request }));
      assert.deepEqual(await host.read(), { barrier });
    } finally { await host.stop(); }
    const recovery = launch('openEngine', root, null, 'mock-host.cjs');
    try {
      assert.deepEqual(await recovery.read(), { ready: true });
      recovery.send(JSON.stringify({ op: 'sessionSnapshot' }));
      const initial = (await recovery.read()).result;
      assert.equal(initial?.sessionId ?? null, barrier === 'before' ? null : request.sessionId);
      recovery.send(JSON.stringify({ op: 'sessionCreate', command: request }));
      assert.equal((await recovery.read()).result, 'accepted');
      recovery.send(JSON.stringify({ op: 'snapshot' }));
      const snapshot = (await recovery.read()).result;
      assert.equal(snapshot.sessions.length, 1); assert.equal(snapshot.commands.length, 1);
    } finally { await recovery.stop(); }
  });
}

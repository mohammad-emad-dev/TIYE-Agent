'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { CoreStore } = require('../dist');
const { decodeCommand, commandHash } = require('../dist/command');
const { privateRoot, command, bytes } = require('./helpers.cjs');

test('accepted and rejected command decisions survive reopen without duplicate events', t => {
  const root = privateRoot(t), first = command({ title: 'مرحبا e\u0301 日本語 🧭' });
  let core = CoreStore.create(root);
  try {
    const accepted = core.execute(bytes(first));
    const duplicateTask = command({ taskId: first.taskId });
    const rejected = core.execute(bytes(duplicateTask));
    assert.equal(rejected.status, 'rejected');
    const before = core.snapshot();
    assert.equal(before.eventCount, 2);
    assert.equal(before.tasks[0].title, first.title);
    core.close(); core = CoreStore.open(root);
    assert.deepEqual(core.execute(bytes(first)), accepted);
    assert.deepEqual(core.execute(bytes(duplicateTask)), rejected);
    assert.deepEqual(core.snapshot(), before);
    assert.throws(() => core.execute(bytes({ ...first, title: 'conflicting reuse' })), /payload-conflict/);
    assert.deepEqual(core.snapshot(), before);
  } finally { core.close(); }
});

test('invalid inputs and duplicate members cannot change the database', t => {
  const root = privateRoot(t), core = CoreStore.create(root), valid = command();
  const invalid = [Buffer.from([0xff]), Buffer.from('{}'), Buffer.from('[]'), Buffer.alloc(16385, 32),
    Buffer.from(JSON.stringify(valid).replace('"version":1', '"version":1,"version":1')),
    ...[{ title: '' }, { title: 'x'.repeat(257) }, { title: '\ud800' }, { version: true },
      { commandId: valid.commandId.toUpperCase() }, { extra: 1 }, { type: 'other' }].map(change => bytes({ ...valid, ...change }))];
  try {
    for (const packet of invalid) assert.throws(() => core.execute(packet));
    assert.equal(core.snapshot().eventCount, 0);
    const alternate = Buffer.from(JSON.stringify(valid).replace('"version":1', '"version":1.0'));
    assert.equal(commandHash(decodeCommand(alternate)), commandHash(decodeCommand(bytes(valid))));
    const reordered = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(valid).reverse())));
    assert.equal(commandHash(decodeCommand(reordered)), commandHash(decodeCommand(bytes(valid))));
    const boundary = command({ title: '🧭'.repeat(256) });
    assert.equal(core.execute(bytes(boundary)).status, 'accepted');
  } finally { core.close(); }
});

test('real SQLite abort rolls back decision, event and task together', t => {
  const root = privateRoot(t), core = CoreStore.create(root), original = Database.prototype.exec;
  let injected = false;
  Database.prototype.exec = function(sql) {
    const answer = original.call(this, sql);
    if (sql === 'BEGIN IMMEDIATE') {
      injected = true;
      original.call(this, "CREATE TEMP TRIGGER abort_task AFTER INSERT ON tasks BEGIN SELECT RAISE(ABORT,'fixture-abort'); END");
    }
    return answer;
  };
  try {
    assert.throws(() => core.execute(bytes(command())), /fixture-abort/);
    assert(injected);
  } finally { Database.prototype.exec = original; }
  try {
    assert.deepEqual(core.snapshot(), { commands: [], tasks: [], eventCount: 0 });
    assert.equal(core.execute(bytes(command())).status, 'accepted');
  } finally { core.close(); }
});

test('full SQLite storage refuses the entire command without a success decision', t => {
  const root = privateRoot(t), core = CoreStore.create(root), original = Database.prototype.exec;
  let constrained = false, refused = false;
  Database.prototype.exec = function(sql) {
    if (sql === 'BEGIN IMMEDIATE' && !constrained) {
      this.pragma('max_page_count=' + this.pragma('page_count', { simple: true }));
      constrained = true;
    }
    return original.call(this, sql);
  };
  try {
    for (let count = 0; count < 100; count++) {
      const before = core.snapshot();
      try { core.execute(bytes(command({ title: '🧭'.repeat(256) }))); }
      catch (fault) {
        assert.equal(fault.code, 'SQLITE_FULL');
        assert.deepEqual(core.snapshot(), before);
        refused = true; break;
      }
    }
    assert(refused, 'fixture did not reach SQLite page capacity');
  } finally { Database.prototype.exec = original; core.close(); }
});

test('existing unsupported, corrupted and tampered stores are preserved and refused', t => {
  const variants = [
    db => db.pragma('user_version=2'),
    db => db.exec("UPDATE tasks SET title='tampered'"),
    db => db.exec('DELETE FROM events'),
    db => db.exec("UPDATE events SET version=2"),
    db => db.exec("CREATE TABLE foreign_table (id INTEGER)"),
    db => db.exec("CREATE TABLE sqliteXforeign (id INTEGER)"),
    db => db.exec("UPDATE commands SET payload_hash='bad'")
    , db => db.exec("UPDATE commands SET result=' ' || result")
  ];
  for (const mutate of variants) {
    const root = privateRoot(t), core = CoreStore.create(root);
    core.execute(bytes(command())); core.close();
    const db = new Database(path.join(root, 'core.sqlite'));
    // This deliberate disk-corruption fixture bypasses FK enforcement; core never does.
    try { db.pragma('foreign_keys=OFF'); mutate(db); } finally { db.close(); }
    const before = fs.readFileSync(path.join(root, 'core.sqlite'));
    assert.throws(() => CoreStore.open(root));
    assert.deepEqual(fs.readFileSync(path.join(root, 'core.sqlite')), before);
  }
  const root = privateRoot(t), core = CoreStore.create(root); core.close();
  const file = path.join(root, 'core.sqlite'), corrupt = Buffer.from('not a database');
  fs.writeFileSync(file, corrupt);
  assert.throws(() => CoreStore.open(root));
  assert.deepEqual(fs.readFileSync(file), corrupt);
});

test('creation and reopen never reset existing or unrecognized files', t => {
  const root = privateRoot(t);
  fs.writeFileSync(path.join(root, 'core.sqlite'), 'preserve');
  assert.throws(() => CoreStore.create(root));
  assert.throws(() => CoreStore.open(root));
  assert.equal(fs.readFileSync(path.join(root, 'core.sqlite'), 'utf8'), 'preserve');
  const empty = privateRoot(t);
  assert.throws(() => CoreStore.open(empty));
  assert.deepEqual(fs.readdirSync(empty), []);
});

test('hardlinks, junction roots and unexpected inventory are refused before opening', t => {
  const root = privateRoot(t), core = CoreStore.create(root); core.close();
  const aliasRoot = privateRoot(t);
  fs.linkSync(path.join(root, 'core.sqlite'), path.join(aliasRoot, 'core.sqlite'));
  assert.throws(() => CoreStore.open(root), /unsafe-storage/);
  fs.unlinkSync(path.join(aliasRoot, 'core.sqlite'));
  const junction = path.join(aliasRoot, 'link');
  fs.symlinkSync(root, junction, 'junction');
  assert.throws(() => CoreStore.open(junction), /root-link/);
  fs.unlinkSync(junction);
  fs.writeFileSync(path.join(root, 'unrelated'), 'keep');
  assert.throws(() => CoreStore.open(root), /unexpected-storage/);
  assert.equal(fs.readFileSync(path.join(root, 'unrelated'), 'utf8'), 'keep');
});

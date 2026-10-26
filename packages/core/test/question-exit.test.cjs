'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3/win32-x64');
const { TaskStore } = require('../dist');
const { commandHash } = require('../dist/command');
const { command, bytes } = require('./helpers.cjs');
const { fixture, startTask, ask, answer, report, ownerCommand } = require('./question-fixtures.cjs');

test('schema4 retains answered history and commits stop as event1000 without spending released budgets twice', t => {
  const f = fixture(t), planned = startTask(f), question = ask(f, planned);
  f.store.member(planned.memberId).ask(bytes(question));
  f.store.member(f.setup.leaderId).answer(bytes(answer(question)));
  f.store.cancel(planned.effectId);
  assert.equal(f.store.member(planned.memberId).report(bytes(report(f, planned, 'failed'))), 'accepted');
  f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  try {
    database.exec('BEGIN IMMEDIATE');
    const first = database.prepare('SELECT max(sequence) AS n FROM events').get().n + 1;
    const event = database.prepare('INSERT INTO events VALUES (?,\'task.create\',?)');
    const ledger = database.prepare('INSERT INTO commands VALUES (?,?)');
    for (let sequence = first; sequence <= 999; sequence++) {
      const rejected = command({ taskId: planned.taskId });
      event.run(sequence, JSON.stringify(rejected));
      ledger.run(rejected.commandId, JSON.stringify({ hash: commandHash(rejected), result: 'rejected' }));
    }
    database.exec('COMMIT');
  } finally { if (database.inTransaction) database.exec('ROLLBACK'); database.close(); }
  f.store = TaskStore.openQuestionEngine(f.root);
  try {
    assert.throws(() => f.store.execute(bytes(command())), /mock-reserved-history-limit/);
    const stop = ownerCommand(f);
    assert.equal(f.store.owner().stop(bytes(stop)), 'accepted');
    const expected = f.store.snapshot();
    assert.equal(expected.questions[0][1].status, 'answered');
    assert.equal(expected.questions[0][1].remainingEvents, 0);
    assert.equal(expected.assignments[0][1].remainingEvents, 0);
    f.store.close(); f.store = TaskStore.openQuestionEngine(f.root);
    assert.deepEqual(f.store.snapshot(), expected);
    assert.equal(f.store.owner().stop(bytes(stop)), 'accepted');
    assert.deepEqual(f.store.snapshot(), expected);
    assert.throws(() => f.store.execute(bytes(command())), /mock-history-limit/);
  } finally { f.store.close(); }
  const observer = new Database(path.join(f.root, 'core.sqlite'), { readonly: true });
  try { assert.equal(observer.prepare('SELECT count(*) AS n FROM events').get().n, 1000); }
  finally { observer.close(); }
});

test('altered question command ledger hash refuses reopen without repairing the stored value', t => {
  const f = fixture(t), planned = startTask(f), question = ask(f, planned);
  f.store.member(planned.memberId).ask(bytes(question)); f.store.close();
  const database = new Database(path.join(f.root, 'core.sqlite'));
  let changed;
  try {
    changed = JSON.parse(database.prepare('SELECT value FROM commands WHERE id=?').get(question.commandId).value);
    changed.hash = '0'.repeat(64);
    database.prepare('UPDATE commands SET value=? WHERE id=?').run(JSON.stringify(changed), question.commandId);
  } finally { database.close(); }
  assert.throws(() => TaskStore.openQuestionEngine(f.root), /mock-projection-drift/);
  const observer = new Database(path.join(f.root, 'core.sqlite'), { readonly: true });
  try { assert.deepEqual(JSON.parse(observer.prepare('SELECT value FROM commands WHERE id=?').get(question.commandId).value), changed); }
  finally { observer.close(); }
});

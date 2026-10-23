'use strict';
// Fixed mock action: append one record per invocation, with NO attempt deduplication.
// Only the trusted test coordinator launches this script; it never receives project paths.
const fs = require('node:fs');
const Database = require('better-sqlite3/win32-x64');
const { verifyRoot: verifyPrivateRoot } = require('./helpers.cjs');
const { storageRoot, verifyRoot, databasePath, reserveFreshDatabase } = require('../dist/storage');
const { configure } = require('../dist/store');
const { UUID, exactFields, requireCore } = require('../dist/command');
const [mode, directory, targetId] = process.argv.slice(2);
requireCore(['create', 'write', 'observe'].includes(mode) && UUID.test(targetId), 'witness-arguments');
verifyPrivateRoot(directory);
const root = storageRoot(directory);
if (mode === 'create') reserveFreshDatabase(root);
verifyRoot(root);
const schema = {
  metadata: 'CREATE TABLE metadata (target_id TEXT PRIMARY KEY) STRICT',
  records: 'CREATE TABLE records (sequence INTEGER PRIMARY KEY, effectId TEXT NOT NULL, attemptId TEXT NOT NULL, targetId TEXT NOT NULL, operation TEXT NOT NULL, payloadHash TEXT NOT NULL, expiresAt INTEGER NOT NULL) STRICT'
};
const database = new Database(databasePath(root), { fileMustExist: true, timeout: 250 });
try {
  configure(database);
  database.exec('BEGIN EXCLUSIVE');
  if (mode === 'create') {
    for (const sql of Object.values(schema)) database.exec(sql);
    database.prepare('INSERT INTO metadata VALUES (?)').run(targetId);
    database.pragma('application_id=1414093127');
    database.pragma('user_version=1');
  }
  requireCore(database.pragma('application_id', { simple: true }) === 1414093127
    && database.pragma('user_version', { simple: true }) === 1, 'witness-schema-version');
  const tables = database.prepare("SELECT name,sql,type FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_'").all();
  requireCore(tables.length === 2 && tables.every(row => row.type === 'table' && schema[row.name] === row.sql), 'witness-schema');
  requireCore(database.pragma('integrity_check', { simple: true }) === 'ok', 'witness-integrity');
  const metadata = database.prepare('SELECT target_id FROM metadata').all();
  requireCore(metadata.length === 1 && metadata[0].target_id === targetId, 'witness-target');
  let result = { created: true };
  if (mode !== 'create') {
    const bytes = Buffer.alloc(16385);
    let length = 0, received;
    do { received = fs.readSync(0, bytes, length, bytes.length - length); length += received; }
    while (received > 0 && length < bytes.length);
    requireCore(length <= 16384, 'witness-input-bound');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    const request = JSON.parse(text);
    requireCore(JSON.stringify(request) === text, 'witness-canonical-input');
    if (mode === 'write') {
      exactFields(request, ['effectId', 'attemptId', 'targetId', 'operation', 'payloadHash', 'expiresAt']);
      requireCore([request.effectId, request.attemptId, request.targetId].every(id => typeof id === 'string' && UUID.test(id))
        && request.targetId === targetId && request.operation === 'mock.record'
        && typeof request.payloadHash === 'string' && /^[0-9a-f]{64}$/.test(request.payloadHash)
        && Number.isSafeInteger(request.expiresAt) && request.expiresAt > Date.now(), 'witness-invocation');
      const count = database.prepare('SELECT count(*) AS count FROM records').get().count;
      requireCore(count < 1000, 'witness-record-bound');
      database.prepare('INSERT INTO records VALUES (NULL,?,?,?,?,?,?)').run(request.effectId, request.attemptId,
        request.targetId, request.operation, request.payloadHash, request.expiresAt);
      result = { committed: true };
    } else {
      exactFields(request, ['effectId', 'attemptId']);
      requireCore(UUID.test(request.effectId) && UUID.test(request.attemptId), 'witness-query');
      result = { scope: 'mock-witness-v1', targetId,
        rows: database.prepare('SELECT * FROM records WHERE effectId=? OR attemptId=? ORDER BY sequence LIMIT 2').all(request.effectId, request.attemptId) };
    }
  }
  database.exec('COMMIT');
  verifyRoot(root);
  process.stdout.write(JSON.stringify(result));
} finally {
  if (database.inTransaction) database.exec('ROLLBACK');
  database.close();
}

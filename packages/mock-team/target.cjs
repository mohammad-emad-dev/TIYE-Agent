'use strict';
const Database = require('../core/node_modules/better-sqlite3/lib/win32-x64.js');
const { storageRoot, verifyRoot, databasePath } = require('../core/dist/storage');
const { configure } = require('../core/dist/store');
const { requireCore } = require('../core/dist/command');
const schema = {
  metadata: 'CREATE TABLE metadata (target_id TEXT PRIMARY KEY) STRICT',
  records: 'CREATE TABLE records (sequence INTEGER PRIMARY KEY, effectId TEXT NOT NULL, attemptId TEXT NOT NULL, targetId TEXT NOT NULL, operation TEXT NOT NULL, payloadHash TEXT NOT NULL, expiresAt INTEGER NOT NULL) STRICT'
};
function validate(database,targetId) {
  requireCore(database.pragma('application_id',{simple:true}) === 1414093127 && database.pragma('user_version',{simple:true}) === 1,'mock-target-version');
  const rows=database.prepare("SELECT name,sql,type FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_'").all();
  requireCore(rows.length === 2 && rows.every(row=>row.type === 'table' && schema[row.name] === row.sql),'mock-target-schema');
  requireCore(database.pragma('integrity_check',{simple:true}) === 'ok','mock-target-integrity');
  const targets=database.prepare('SELECT target_id FROM metadata').all();
  requireCore(targets.length === 1 && targets[0].target_id === targetId,'mock-target-identity');
}
function inspect(directory,targetId) {
  const root=storageRoot(directory); verifyRoot(root);
  const database=new Database(databasePath(root),{readonly:true,fileMustExist:true,timeout:250});
  try { validate(database,targetId); } finally { database.close(); }
  return root;
}
function append(root,invocation,abort=false) {
  verifyRoot(root);
  const database=new Database(databasePath(root),{fileMustExist:true,timeout:250});
  try {
    configure(database); database.exec('BEGIN EXCLUSIVE'); validate(database,invocation.targetId);
    requireCore(invocation.expiresAt > Date.now(),'mock-target-expired');
    requireCore(database.prepare('SELECT count(*) AS n FROM records').get().n < 1000,'mock-target-cap');
    if(abort) database.exec("CREATE TEMP TRIGGER abort_write BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT,'fixture-worker-write-abort'); END");
    database.prepare('INSERT INTO records VALUES (NULL,?,?,?,?,?,?)').run(invocation.effectId,invocation.attemptId,
      invocation.targetId,invocation.operation,invocation.payloadHash,invocation.expiresAt);
    database.exec('COMMIT'); verifyRoot(root);
  } finally { if(database.inTransaction) database.exec('ROLLBACK'); database.close(); }
}
module.exports={ inspect, append };

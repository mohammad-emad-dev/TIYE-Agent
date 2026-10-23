'use strict';
// Trusted test coordinator supplies the root; wire requests never contain paths.
const { verifyRoot } = require('./helpers.cjs');
const Database = require('better-sqlite3/win32-x64');
const { CoreStore } = require('../dist');
const fs = require('node:fs');
const [mode, root, barrier] = process.argv.slice(2);
verifyRoot(root);
const core = mode === 'create' ? CoreStore.create(root) : CoreStore.open(root);
const original = Database.prototype.exec;
if (barrier) Database.prototype.exec = function(sql) {
  if (sql === 'COMMIT' && barrier === 'before-commit') pause('before-commit');
  const returned = original.call(this, sql);
  if (sql === 'COMMIT' && barrier === 'after-commit') pause('after-commit');
  return returned;
};
function pause(stage) {
  process.stdout.write(JSON.stringify({ barrier: stage }) + '\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
function reply(record) {
  const payload = JSON.stringify(record);
  if (Buffer.byteLength(payload) > 32768) throw new Error('test-response-bound');
  fs.writeSync(1, payload + '\n');
}
let pending = Buffer.alloc(0);
process.stdin.on('data', block => {
  pending = Buffer.concat([pending, block]);
  if (pending.length > 32768) throw new Error('test-input-bound');
  while (pending.includes(10)) {
    const end = pending.indexOf(10);
    const line = pending.subarray(0, end);
    pending = pending.subarray(end + 1);
    if (line.equals(Buffer.from('snapshot'))) reply(core.snapshot());
    else {
      reply(core.execute(line));
    }
  }
});
process.stdin.on('end', () => {
  if (pending.length) throw new Error('truncated-test-input');
  core.close();
});
reply({ ready: true });

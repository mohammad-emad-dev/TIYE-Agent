'use strict';
// Trusted synthetic coordinator only. No caller selects a script or executable.
const readline = require('node:readline');
const Database = require('better-sqlite3/win32-x64');
const { MockEffectStore } = require('../dist');
const { verifyRoot } = require('./helpers.cjs');
const [mode, root, barrier] = process.argv.slice(2);
verifyRoot(root);
const store = mode === 'create' ? MockEffectStore.create(root) : MockEffectStore.open(root);
const original = Database.prototype.exec;
Database.prototype.exec = function (sql) {
  if (sql === 'COMMIT' && barrier === 'before') {
    process.stdout.write('{"barrier":"before"}\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  const result = original.call(this, sql);
  if (sql === 'COMMIT' && barrier === 'after') {
    process.stdout.write('{"barrier":"after"}\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  return result;
};
process.stdout.write('{"ready":true}\n');
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', line => {
  if (Buffer.byteLength(line) > 32768) throw new Error('bounded-input');
  const request = JSON.parse(line);
  let result;
  if (request.op === 'plan') result = store.plan(request.plan);
  else if (request.op === 'claim') result = store.claim(request.effectId);
  else if (request.op === 'settle') result = store.settle(request.effectId, Buffer.from(JSON.stringify(request.proof)));
  else if (request.op === 'snapshot') result = store.snapshot();
  else if (request.op === 'resolve') result = store.resolve(request.request,
    request.proof === undefined ? undefined : Buffer.from(JSON.stringify(request.proof)));
  else throw new Error('unsupported-test-operation');
  process.stdout.write(JSON.stringify({ result: result ?? null }) + '\n');
});
input.on('close', () => store.close());

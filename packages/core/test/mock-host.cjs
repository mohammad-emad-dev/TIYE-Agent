'use strict';
// Trusted synthetic coordinator only. No caller selects a script or executable.
const readline = require('node:readline');
const Database = require('better-sqlite3/win32-x64');
const { MockEffectStore } = require('../dist');
const { verifyRoot } = require('./helpers.cjs');
const [mode, root, barrier] = process.argv.slice(2);
verifyRoot(root);
const store = mode === 'createMissionEngine' ? MockEffectStore.createMissionEngine(root)
  : mode === 'openMissionEngine' ? MockEffectStore.openMissionEngine(root)
  : mode === 'createQuestionEngine' ? MockEffectStore.createQuestionEngine(root)
  : mode === 'openQuestionEngine' ? MockEffectStore.openQuestionEngine(root)
  : mode === 'createEngine' ? MockEffectStore.createEngine(root)
  : mode === 'openEngine' ? MockEffectStore.openEngine(root)
    : mode === 'create' ? MockEffectStore.create(root) : MockEffectStore.open(root);
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
  else if (request.op === 'createTask') result = store.execute(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'planForTask') result = store.planForTask(request.plan);
  else if (request.op === 'registry') result = store.registry();
  else if (request.op === 'sessionCreate') result = store.owner().createSession(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'sessionSnapshot') result = store.owner().session();
  else if (request.op === 'sessionStop') result = store.owner().stop(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'missionComplete') result = store.member(store.owner().session().leaderId).completeMission(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'questionAsk') result = store.member(store.owner().session().members[1].memberId).ask(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'questionEscalate') result = store.member(store.owner().session().leaderId).escalate(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'questionAnswer') result = store.owner().answer(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'sessionRecover') result = store.owner().recover(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'report') result = store.member(store.owner().session().members[1].memberId).report(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'enqueue') result = store.member(store.owner().session().leaderId).enqueue(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'startTask') result = store.scheduler().start(Buffer.from(JSON.stringify(request.command)));
  else if (request.op === 'inboxes') result = store.scheduler().inboxes();
  else if (request.op === 'claim') result = store.claim(request.effectId);
  else if (request.op === 'settle') result = store.settle(request.effectId, Buffer.from(JSON.stringify(request.proof)));
  else if (request.op === 'snapshot') result = store.snapshot();
  else if (request.op === 'resolve') result = store.resolve(request.request,
    request.proof === undefined ? undefined : Buffer.from(JSON.stringify(request.proof)));
  else throw new Error('unsupported-test-operation');
  process.stdout.write(JSON.stringify({ result: result ?? null }) + '\n');
});
input.on('close', () => store.close());

#!/usr/bin/env node
'use strict';
// Separate mock-core OS process for TIYE S1 step 9b.
// No team engine, no vendor CLI, no network. Narrow stdio JSON-lines IPC:
//   core -> main (stdout): {"type":"SUBSCRIBE","coreId":"...","corePid":123}
//                         {"type":"READY","coreId":"...","corePid":123}
//                         {"type":"BYE","coreId":"...","corePid":123}
//   main -> core (stdin):  {"type":"SUBSCRIBED","coreId":"...","sessionId":"...",
//                           "memberPid":123,"spawnCount":1,"reused":true}
//                         {"type":"SHUTDOWN"}
// Human logs go to stderr so stdout stays protocol-only.

const CORE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_LINE = 65536;

function fail(msg) {
  console.error(`[mock-core] fatal: ${msg}`);
  process.exit(2);
}

const coreId = process.argv[2] || '';
if (!CORE_ID_RE.test(coreId)) fail(`invalid coreId ${JSON.stringify(process.argv[2])} (expected alnum/-/_ up to 64 chars)`);
const corePid = process.pid;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function log(msg) {
  console.error(`[mock-core ${coreId} pid=${corePid}] ${msg}`);
}

// Line splitter for stdin (main -> core).
let stdinBuf = '';
let subscribed = false;
let shuttingDown = false;

function handleLine(raw) {
  if (raw.length > MAX_LINE) {
    log(`oversized line dropped (${raw.length} chars)`);
    return;
  }
  if (raw.trim() === '') return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    log(`invalid JSON dropped: ${raw.slice(0, 120)}`);
    return;
  }
  if (typeof msg !== 'object' || msg === null || typeof msg.type !== 'string') {
    log('malformed message dropped (missing type)');
    return;
  }
  if (msg.type === 'SUBSCRIBED') {
    if (msg.coreId !== coreId) {
      log(`SUBSCRIBED for different core dropped (${JSON.stringify(msg.coreId)})`);
      return;
    }
    if (subscribed) return; // idempotent: duplicate SUBSCRIBED is harmless.
    subscribed = true;
    log(`subscribed to session=${msg.sessionId} memberPid=${msg.memberPid} spawn#${msg.spawnCount} reused=${msg.reused}`);
    send({ type: 'READY', coreId, corePid });
    return;
  }
  if (msg.type === 'SHUTDOWN') {
    if (shuttingDown) return;
    shuttingDown = true;
    log('shutdown requested, exiting 0');
    try {
      send({ type: 'BYE', coreId, corePid });
    } catch {
      /* stdout gone */
    }
    // Let BYE flush, then exit. No PID targeting here: we exit ourselves.
    setTimeout(() => process.exit(0), 50);
    return;
  }
  log(`unknown type dropped: ${msg.type}`);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk;
  let idx;
  while ((idx = stdinBuf.indexOf('\n')) >= 0) {
    const line = stdinBuf.slice(0, idx).replace(/\r$/, '');
    stdinBuf = stdinBuf.slice(idx + 1);
    handleLine(line);
  }
});
process.stdin.on('end', () => {
  // Parent closed the pipe (e.g. main exiting): leave quietly with code 0.
  // If a SHUTDOWN is already being honored, exit without a second log line.
  if (!shuttingDown) log('stdin closed, exiting 0');
  process.exit(0);
});
process.stdin.on('close', () => {
  // Pipe destroyed without a clean 'end': still our cue to leave quietly.
  if (!shuttingDown) log('stdin pipe closed, exiting 0');
  process.exit(0);
});
process.stdin.on('error', () => {
  process.exit(0);
});

// Announce ourselves immediately; main replies with SUBSCRIBED.
send({ type: 'SUBSCRIBE', coreId, corePid });
log('subscribe sent, waiting for SUBSCRIBED');

// Safety: if main never answers, exit loudly rather than linger.
setTimeout(() => {
  if (!subscribed && !shuttingDown) {
    console.error('[mock-core] fatal: timed out waiting for SUBSCRIBED');
    process.exit(2);
  }
}, 15000);

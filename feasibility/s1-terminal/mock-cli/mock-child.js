#!/usr/bin/env node
'use strict';
// Deterministic long-lived descendant fixture for the upcoming S1 9f
// Windows process-tree crash experiment. No vendor CLI, no network, no
// extra dependencies. Started only by mock-cli's `tree` command via
// `process.execPath mock-child.js`; never spawned by Electron main.
// Contract: the parent prints `tree ready pid=<child-pid>`; this child
// stays alive until it receives an `exit` line through its stdin (the
// `tree-stop` and ordinary `exit` paths), then exits itself with code 0.
// A closed stdin deliberately does NOT stop it: after an abnormal parent
// exit, disappearance must come from the OS job rather than this fixture.
// A 60-second self-expire bounds any orphan from an incomplete experiment.
// No PID targeting here: this process only ever exits itself.
const SELF_EXPIRE_MS = 60 * 1000;

let exited = false;

function gracefulExit(reason) {
  if (exited) return;
  exited = true;
  try {
    console.error(`[mock-child pid=${process.pid}] exiting: ${reason}`);
  } catch {
    /* stderr gone */
  }
  // Brief delay so the stderr line above can flush before exit.
  setTimeout(() => process.exit(0), 20);
}

let stdinBuf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk;
  let idx;
  while ((idx = stdinBuf.indexOf('\n')) >= 0) {
    const line = stdinBuf.slice(0, idx).replace(/\r$/, '');
    stdinBuf = stdinBuf.slice(idx + 1);
    if (line.trim() === 'exit') {
      gracefulExit('stdin exit request');
      return;
    }
    // Ignore any other stdin line: only `exit` is the stop word.
  }
});
process.stdin.on('end', () => {});
process.stdin.on('error', () => {});

// Safety bound: never linger past 60 seconds, even if the parent is gone
// and the stdin pipe never closed (e.g. an aborted 9f experiment).
setTimeout(() => gracefulExit('self-expire 60s'), SELF_EXPIRE_MS);

'use strict';
// Verified-identity stop smoke (isolated S1 9f safety primitive, no recovery).
//
// Proves Windows can terminate a controlled surviving mock process ONLY after
// checking its saved PID+creation identity on the SAME opened process handle,
// and that a wrong creation identity is refused while the process stays alive.
// This is the next safety primitive before wiring survivor cleanup into
// recovery. No durable registry, no recovery state machine, no vendor CLI,
// no full 9f pass.
//
// Flow:
//   1. Spawn ONE target mock-cli/mock-child.js directly (stdin held open) and
//      ONE unrelated control mock-child.js (stdin held open). Capture each
//      PID+CreationDate identity via single-PID CIM query.
//   2. Pass a deliberately WRONG saved creation time (+1h, parseable ISO, far
//      beyond the 10-tick bound) to scripts/verified-identity-stop.ps1.
//      Expect exit 1 + REFUSED and NO termination: the exact target identity
//      must still be alive, and the control identity must be untouched.
//   3. Pass the CORRECT saved identity to the helper. Expect exit 0 + STOPPED.
//      Read-only re-enumeration must find that exact identity gone within a
//      short bound (10s) well before the 60s fixture self-expiry, while the
//      control identity remains alive.
//   4. Stop the control child via its stdin `exit` line and observe its exit.
//
// Failure contract (fail closed, no PID-only fallback):
//   exit 0 = PASS (wrong refused + alive, correct stopped + gone, control ok).
//   exit 1 = FAIL (wrong identity terminated, correct identity survived, or
//            control was touched).
//   exit 2 = INCONCLUSIVE / harness failure (setup failure, helper setup
//            failure, timeout, lookup failure, observation outside the 60s
//            fixture bound, non-Windows). The runner asks any still-alive
//            fixture child to exit via stdin and observes it, or leaves it to
//            its 60s self-expire; it never claims a pass.
//
// Never taskkill / Stop-Process / PID-only kill / name matching anywhere here.
// The only kill() targets are this runner's own short-lived CIM queries or its
// own helper ChildProcess on timeout -- never a captured fixture PID. Every
// spawned mock-child is asked to exit via stdin and observed, or proven gone
// by PID+creation re-enumeration (fixture self-expires at 60s).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CIM_TIMEOUT_MS = 15000;
const CIM_CAPTURE_TIMEOUT_MS = 15000;
const HELPER_TIMEOUT_MS = 15000;
const GONE_BOUND_MS = 10000;
const GONE_POLL_MS = 250;
const CHILD_EXIT_TIMEOUT_MS = 10000;
// Fixture self-expires at 60s. The whole observation must finish far inside
// that window so a "gone" result cannot be explained by the safety timer.
const MAX_OBSERVATION_MS = 45000;
const MAX_PRE_STOP_MS = 20000;

const REFUSED_RE = /\[verified-stop\] REFUSED/;
const STOPPED_RE = /\[verified-stop\] STOPPED/;
const FAIL_RE = /\[verified-stop\] FAIL:/;

function log(msg) {
  console.log(`[runner] ${msg}`);
}

function logChild(prefix, chunk) {
  const text = chunk.toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (line !== '') console.log(`[${prefix}] ${line}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function powershellBin() {
  const system = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  try {
    if (fs.existsSync(system)) return system;
  } catch {
    /* fall through */
  }
  return 'powershell.exe';
}

// Narrow single-PID CIM query (no full enumeration, no extra deps).
// Returns { pid, creationTime, name, parentPid } or null when absent.
function queryIdentityOnce(pid) {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(pid) || pid <= 0) {
      reject(new Error(`query: invalid PID ${String(pid)}`));
      return;
    }
    const script =
      `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ` +
      `ForEach-Object { $_.CreationDate.ToString("o") + "|" + $_.Name + "|" + $_.ParentProcessId.ToString() }`;
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* helper-owned enumeration only */
      }
      reject(new Error(`CIM query for PID ${pid} timed out after ${CIM_TIMEOUT_MS}ms`));
    }, CIM_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      stdout += d.toString('utf8');
      if (stdout.length > 65536) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            child.kill();
          } catch {
            /* ignore */
          }
          reject(new Error(`CIM query for PID ${pid} output exceeded bound`));
        }
      }
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`CIM query for PID ${pid} failed (exit ${code}): ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
        if (lines.length === 0) {
          resolve(null);
          return;
        }
        if (lines.length > 1) throw new Error(`CIM query for PID ${pid} returned ${lines.length} rows`);
        const line = lines[0];
        const first = line.indexOf('|');
        const second = line.indexOf('|', first + 1);
        if (first < 0 || second < 0) throw new Error('malformed CIM row');
        const creationTime = line.slice(0, first);
        const name = line.slice(first + 1, second);
        const parentPid = Number(line.slice(second + 1));
        if (creationTime === '' || name === '' || !Number.isInteger(parentPid)) throw new Error('invalid CIM identity');
        resolve({ pid, creationTime, name, parentPid });
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function captureIdentity(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const row = await queryIdentityOnce(pid);
    if (row !== null) return row;
    lastError = new Error(`PID ${pid} not present in CIM query yet`);
    await sleep(500);
  }
  throw lastError ?? new Error(`PID ${pid} not present in CIM query`);
}

async function isExactAlive(identity) {
  const cur = await queryIdentityOnce(identity.pid);
  return cur !== null && cur.creationTime === identity.creationTime;
}

async function waitForIdentityGone(identity, boundMs, pollMs) {
  const deadline = Date.now() + boundMs;
  let attempts = 0;
  while (true) {
    attempts += 1;
    const cur = await queryIdentityOnce(identity.pid);
    if (cur === null || cur.creationTime !== identity.creationTime) {
      return { gone: true, attempts };
    }
    if (Date.now() >= deadline) return { gone: false, attempts };
    await sleep(pollMs);
  }
}

function mockChildPath() {
  return path.resolve(__dirname, '..', 'mock-cli', 'mock-child.js');
}

function spawnMockChild(tag) {
  const script = mockChildPath();
  if (!fs.existsSync(script)) throw new Error(`mock-child fixture missing: ${script}`);
  const child = spawn(process.execPath, [script], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  // Drain pipes so the fixture can never block; output is only logged, never
  // used as liveness proof (CIM identity is).
  child.stdout?.on('data', (d) => logChild(`${tag}-stdout`, d));
  child.stderr?.on('data', (d) => logChild(`${tag}-stderr`, d));
  child.stdin?.on('error', () => {});
  child.on('error', (err) => log(`${tag}: spawn error: ${err.message}`));
  return child;
}

function requestChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ exited: true, code: child.exitCode, signal: child.signalCode });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ exited: false, code: null });
      }
    }, Math.max(1000, Math.min(timeoutMs, 15000)));
    child.once('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ exited: true, code, signal });
      }
    });
    try {
      child.stdin?.write('exit\n');
    } catch {
      /* pipe gone; the exit event or the timeout decides */
    }
  });
}

async function cleanupChild(tag, child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  log(`${tag}: cleanup: requesting normal exit via stdin (no PID kill)`);
  const res = await requestChildExit(child, CHILD_EXIT_TIMEOUT_MS);
  if (res.exited) {
    log(`${tag}: cleanup: child exited (code=${res.code})`);
  } else {
    log(`${tag}: cleanup: child did not exit on request within ${CHILD_EXIT_TIMEOUT_MS}ms; leaving to 60s self-expire (no PID kill, no pass claimed)`);
  }
  try {
    child.stdin?.destroy();
  } catch {
    /* ignore */
  }
}

// Run the verified-identity helper once. Resolves with { code, output }.
// On timeout the runner kills ONLY its own helper ChildProcess handle.
function runVerifiedStop(helperPs1, pid, creationISO) {
  return new Promise((resolve, reject) => {
    let output = '';
    let child;
    try {
      child = spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPs1, '-TargetPid', String(pid), '-TargetCreationTime', creationISO], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* runner-owned helper handle only */
      }
      reject(new Error(`verified-identity helper timed out after ${HELPER_TIMEOUT_MS}ms (helper handle killed, no PID kill)`));
    }, HELPER_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      output += d.toString('utf8');
      logChild('verified-stop', d);
    });
    child.stderr?.on('data', (d) => {
      output += d.toString('utf8');
      logChild('verified-stop', d);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 2, output });
    });
  });
}

function wrongCreationISO(correctISO) {
  const t = new Date(correctISO).getTime();
  if (!Number.isFinite(t)) throw new Error(`cannot parse correct creation time '${correctISO}' for wrong-identity construction`);
  // +1h is parseable, far beyond the 10-tick (1us) bound, and cannot collide
  // with a real PID-reuse creation time on this run.
  return new Date(t + 3600000).toISOString();
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`[runner] SKIP: verified-identity stop probe is Windows-only (platform=${process.platform}; no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  const probeStartedAt = Date.now();
  const helperPs1 = path.resolve(__dirname, 'verified-identity-stop.ps1');
  if (!fs.existsSync(helperPs1)) {
    console.error('[runner] FAIL: verified-identity-stop.ps1 missing (harness failure, no pass)');
    process.exitCode = 2;
    return;
  }

  let target = null;
  let control = null;
  try {
    log('spawn target mock-child directly with stdin held open (isolated, no PTY)');
    target = spawnMockChild('target');
    const targetPid = target.pid;
    if (targetPid === undefined) throw new Error('target child has no PID');
    log('spawn unrelated control mock-child directly with stdin held open');
    control = spawnMockChild('control');
    const controlPid = control.pid;
    if (controlPid === undefined) throw new Error('control child has no PID');
    const targetSpawnedAt = Date.now();

    const targetId = await captureIdentity(targetPid, CIM_CAPTURE_TIMEOUT_MS);
    log(`target: captured identity: pid=${targetId.pid} created=${targetId.creationTime} name=${targetId.name} parentPid=${targetId.parentPid}`);
    const controlId = await captureIdentity(controlPid, CIM_CAPTURE_TIMEOUT_MS);
    log(`control: captured identity: pid=${controlId.pid} created=${controlId.creationTime} name=${controlId.name} parentPid=${controlId.parentPid}`);
    if (targetId.pid === controlId.pid) throw new Error('target and control share a PID (harness failure, no pass)');
    if (!(await isExactAlive(targetId))) throw new Error('target gone immediately after spawn (harness failure, no pass)');
    if (!(await isExactAlive(controlId))) throw new Error('control gone immediately after spawn (harness failure, no pass)');
    log('both target and control alive by exact PID+creation (CIM single-PID query)');

    // ---- Wrong-identity refusal.
    const wrongISO = wrongCreationISO(targetId.creationTime);
    log(`wrong-identity: invoking helper with pid=${targetId.pid} and deliberately wrong creation=${wrongISO} (expect REFUSED, no termination)`);
    let wrong;
    try {
      wrong = await runVerifiedStop(helperPs1, targetId.pid, wrongISO);
    } catch (err) {
      console.error(`[runner] INCONCLUSIVE: wrong-identity helper failed to run: ${err && err.message ? err.message : err} (no pass)`);
      await cleanupChild('target', target);
      await cleanupChild('control', control);
      process.exitCode = 2;
      return;
    }
    log(`wrong-identity: helper exited code=${wrong.code}`);
    if (wrong.code !== 1 || !REFUSED_RE.test(wrong.output)) {
      const failTail = (wrong.output || '').slice(-500);
      console.error(`[runner] FAIL: wrong-identity helper did not refuse as contracted (want exit 1 + REFUSED; got exit=${wrong.code}${FAIL_RE.test(wrong.output || '') ? ' + FAIL' : ''}; no pass)${failTail ? ` output tail: ${failTail}` : ''}`);
      // Fail closed: the helper may have terminated something it should not
      // have. Check before any further step; never fall back to a PID kill.
      const stillAlive = await isExactAlive(targetId).catch(() => null);
      if (stillAlive === false) {
        console.error('[runner] FAIL: target identity is gone after the WRONG-identity call (safety violation; no pass)');
        process.exitCode = 1;
      } else {
        process.exitCode = 2;
      }
      await cleanupChild('target', target);
      await cleanupChild('control', control);
      return;
    }
    log('wrong-identity: helper REFUSED as contracted (exit 1, no termination claimed)');
    if (!(await isExactAlive(targetId))) {
      console.error('[runner] FAIL: target identity is gone after the refused wrong-identity call (safety violation; no pass)');
      await cleanupChild('control', control);
      try {
        target.stdin?.destroy();
      } catch {
        /* ignore */
      }
      process.exitCode = 1;
      return;
    }
    log('wrong-identity: target still alive with the exact saved identity (refusal proved)');
    if (!(await isExactAlive(controlId))) {
      console.error('[runner] FAIL: control identity is gone after the wrong-identity call (unrelated process touched; no pass)');
      await cleanupChild('target', target);
      try {
        control.stdin?.destroy();
      } catch {
        /* ignore */
      }
      process.exitCode = 1;
      return;
    }
    log('wrong-identity: unrelated control still alive with its exact identity (not touched)');

    if (Date.now() - probeStartedAt >= MAX_PRE_STOP_MS || Date.now() - targetSpawnedAt >= MAX_PRE_STOP_MS) {
      console.error('[runner] INCONCLUSIVE: pre-stop setup exceeded the fixture safety margin (no pass)');
      await cleanupChild('target', target);
      await cleanupChild('control', control);
      process.exitCode = 2;
      return;
    }

    // ---- Correct-identity stop.
    log(`correct-identity: invoking helper with pid=${targetId.pid} created=${targetId.creationTime} (expect STOPPED on the SAME handle)`);
    let correct;
    try {
      correct = await runVerifiedStop(helperPs1, targetId.pid, targetId.creationTime);
    } catch (err) {
      console.error(`[runner] INCONCLUSIVE: correct-identity helper failed to run: ${err && err.message ? err.message : err} (no pass)`);
      await cleanupChild('target', target);
      await cleanupChild('control', control);
      process.exitCode = 2;
      return;
    }
    log(`correct-identity: helper exited code=${correct.code}`);
    if (correct.code !== 0 || !STOPPED_RE.test(correct.output)) {
      console.error(`[runner] INCONCLUSIVE: correct-identity helper did not stop as contracted (want exit 0 + STOPPED; got exit=${correct.code}; no pass)`);
      await cleanupChild('target', target);
      await cleanupChild('control', control);
      process.exitCode = 2;
      return;
    }
    log('correct-identity: helper STOPPED as contracted (same-handle identity check + TerminateProcess + bounded wait)');

    log(`re-enumerating pid=${targetId.pid} created=${targetId.creationTime} (bound ${GONE_BOUND_MS}ms, read-only, no PID kill)`);
    const wait = await waitForIdentityGone(targetId, GONE_BOUND_MS, GONE_POLL_MS);
    const elapsedSinceSpawn = Date.now() - targetSpawnedAt;
    const elapsedSinceProbe = Date.now() - probeStartedAt;
    if (!wait.gone) {
      console.error(`[runner] FAIL: target identity pid=${targetId.pid} created=${targetId.creationTime} survived the verified stop (attempts=${wait.attempts}; no pass)`);
      log('requesting its normal exit through the still-open stdin (no PID kill) before failing');
      const exitRes = await requestChildExit(target, CHILD_EXIT_TIMEOUT_MS);
      if (exitRes.exited) log(`target: exited on normal stdin request (code=${exitRes.code}); verified stop did not end it`);
      else console.error(`[runner] FAIL: target ignored normal stdin exit too; leaving to 60s self-expire (no PID kill)`);
      try {
        target.stdin?.destroy();
      } catch {
        /* ignore */
      }
      await cleanupChild('control', control);
      console.error('[runner] IDENTITY-STOP FAIL: verified stop did not end the target; S1 9f stays open');
      process.exitCode = 1;
      return;
    }
    log(`target: exact identity gone (attempts=${wait.attempts}, ${elapsedSinceSpawn}ms since spawn, ${elapsedSinceProbe}ms since probe start; fixture bound is 60000ms)`);
    if (elapsedSinceSpawn >= MAX_OBSERVATION_MS) {
      console.error(`[runner] INCONCLUSIVE: target gone but ${elapsedSinceSpawn}ms after spawn is too close to the 60s self-expiry to attribute to the helper (no pass claimed)`);
      await cleanupChild('control', control);
      try {
        target.stdin?.destroy();
      } catch {
        /* ignore */
      }
      process.exitCode = 2;
      return;
    }
    try {
      target.stdin?.destroy();
    } catch {
      /* ignore */
    }

    // Control must be untouched by the verified stop (different PID, never opened).
    if (!(await isExactAlive(controlId))) {
      console.error('[runner] FAIL: control identity is gone after the correct verified stop (unrelated process touched; no pass)');
      try {
        control.stdin?.destroy();
      } catch {
        /* ignore */
      }
      process.exitCode = 1;
      return;
    }
    log('control: still alive with its exact identity after the verified target stop (not touched)');
    log('control: stopping it via its stdin `exit` line (normal fixture path, no PID kill)');
    const controlExit = await requestChildExit(control, CHILD_EXIT_TIMEOUT_MS);
    if (!controlExit.exited || controlExit.code !== 0) {
      console.error(`[runner] FAIL: control child did not exit normally on stdin request within ${CHILD_EXIT_TIMEOUT_MS}ms (code=${controlExit.code} signal=${controlExit.signal ?? 'none'}, no pass)`);
      process.exitCode = 2;
      return;
    }
    log(`control: exited as requested (code=${controlExit.code}); control case ok`);
    try {
      control.stdin?.destroy();
    } catch {
      /* ignore */
    }

    log('IDENTITY-STOP PASS: wrong creation identity was refused with the target alive; correct PID+creation identity was terminated via the SAME opened handle and the exact identity was gone well before 60s; the unrelated control was untouched until its normal stdin exit.');
    log('Scope: isolated process only (mock-child fixture, no PTY/Electron). No durable-registry trust, no recovery integration, no vendor CLI, no full 9f pass. S1 9f stays open.');
    process.exitCode = 0;
  } catch (err) {
    console.error(`[runner] INCONCLUSIVE: ${err && err.message ? err.message : err} (no pass)`);
    if (target !== null) await cleanupChild('target', target);
    if (control !== null) await cleanupChild('control', control);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`[runner] INCONCLUSIVE: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

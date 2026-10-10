'use strict';
// Standalone Windows Job Object feasibility probe runner (isolated, no
// Electron/PTY integration, no new npm dependencies).
//
// Control case: spawn mock-cli/mock-child.js OUTSIDE a PTY with stdin held
// open; confirm PID+creation identity and that it remains alive for about 2s
// with no job, then ask it to exit via its stdin and observe its exit.
//
// Job case: spawn another child, capture PID+creation identity, start the
// PowerShell+C# controller (scripts/job-probe-controller.ps1) and wait for
// READY, verify the child is still alive, force-terminate ONLY the
// runner-owned controller ChildProcess via its handle, then re-enumerate the
// captured PID+creation identity and assert the child is gone well before its
// 60s self-expiry.
//
// Failure contract (never claim a pass unless the job kill is observed):
//   exit 0 = PASS (control ok + job closure ended the exact child identity
//            well before the 60s fixture bound).
//   exit 1 = FAIL (job READY was reached but the child survived job closure;
//            the runner then requested its normal `exit` through the
//            still-open stdin and observed it).
//   exit 2 = INCONCLUSIVE / harness failure (control failure, READY never
//            arrived, Win32 assignment error, timeout, non-Windows). The
//            runner asks the child to exit via stdin, observes the exit, and
//            never claims a pass.
//
// Never taskkill / Stop-Process / PID-only termination anywhere here. The
// only kill() targets are runner-owned ChildProcess handles (the controller,
// or this helper's own short-lived CIM enumeration on timeout) -- never a
// captured fixture PID. Bounded timeouts everywhere; no fixture is orphaned:
// every spawned mock-child is asked to exit via stdin and observed, or it is
// proven gone by PID+creation re-enumeration (fixture self-expires at 60s).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const READY_TIMEOUT_MS = 20000;
const CIM_TIMEOUT_MS = 20000;
const CIM_CAPTURE_TIMEOUT_MS = 15000;
const CONTROL_ALIVE_MS = 2000;
const CHILD_EXIT_TIMEOUT_MS = 10000;
const CONTROLLER_KILL_WAIT_MS = 10000;
const JOB_GONE_BOUND_MS = 15000;
const JOB_GONE_POLL_MS = 500;
// The mock-child fixture self-expires at 60s. The whole job observation must
// finish far inside that window so a "gone" result cannot be explained by the
// fixture's own safety timer.
const MAX_JOB_OBSERVATION_MS = 45000;
const MAX_PRE_KILL_MS = 30000;

const READY_RE = /\[job-controller\] READY childPid=(\d+)/;
const FAIL_RE = /\[job-controller\] FAIL:(.*)/;

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

const ENUM_SCRIPT =
  'Get-CimInstance Win32_Process | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.ParentProcessId.ToString() + "|" + $_.CreationDate.ToString("o") + "|" + $_.Name }';

function enumerateAllOnce() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ENUM_SCRIPT], {
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
      reject(new Error(`CIM enumeration timed out after ${CIM_TIMEOUT_MS}ms`));
    }, CIM_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      stdout += d.toString('utf8');
      if (stdout.length > 4000000) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            child.kill();
          } catch {
            /* ignore */
          }
          reject(new Error('CIM enumeration output exceeded bound'));
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
        reject(new Error(`CIM enumeration failed (exit ${code}): ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        const map = new Map();
        for (const rawLine of stdout.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (line === '') continue;
          const first = line.indexOf('|');
          const second = line.indexOf('|', first + 1);
          const third = line.indexOf('|', second + 1);
          if (first < 0 || second < 0 || third < 0) throw new Error('malformed CIM row');
          const pid = Number(line.slice(0, first));
          const parentPid = Number(line.slice(first + 1, second));
          const creationTime = line.slice(second + 1, third);
          const name = line.slice(third + 1);
          if (!Number.isInteger(pid) || !Number.isInteger(parentPid) || creationTime === '' || name === '') {
            throw new Error('invalid CIM identity');
          }
          map.set(pid, { pid, parentPid, creationTime, name });
        }
        resolve(map);
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
    const all = await enumerateAllOnce();
    const row = all.get(pid);
    if (row !== undefined) return { pid: row.pid, parentPid: row.parentPid, creationTime: row.creationTime, name: row.name };
    lastError = new Error(`PID ${pid} not present in CIM enumeration yet`);
    await sleep(500);
  }
  throw lastError ?? new Error(`PID ${pid} not present in CIM enumeration`);
}

async function isIdentityAlive(identity) {
  const all = await enumerateAllOnce();
  const cur = all.get(identity.pid);
  return cur !== undefined && cur.creationTime === identity.creationTime;
}

async function waitForIdentityGone(identity, boundMs, pollMs) {
  const deadline = Date.now() + boundMs;
  let attempts = 0;
  while (true) {
    attempts += 1;
    const all = await enumerateAllOnce();
    const cur = all.get(identity.pid);
    if (cur === undefined || cur.creationTime !== identity.creationTime) {
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
  // Drain pipes so the fixture can never block on a full buffer; output is
  // only logged, never used as liveness proof (CIM identity is).
  child.stdout?.on('data', (d) => logChild(`${tag}-stdout`, d));
  child.stderr?.on('data', (d) => logChild(`${tag}-stderr`, d));
  child.stdin?.on('error', () => {});
  child.on('error', (err) => log(`${tag}: spawn error: ${err.message}`));
  return child;
}

function requestChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve({ exited: true, code: child.exitCode });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ exited: false, code: null });
      }
    }, Math.max(1000, Math.min(timeoutMs, 15000)));
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ exited: true, code });
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
  if (child.exitCode !== null) return;
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

async function main() {
  if (process.platform !== 'win32') {
    console.error(`[runner] SKIP: Windows Job Object probe is Windows-only (platform=${process.platform}; no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  const probeStartedAt = Date.now();
  const controllerPs1 = path.resolve(__dirname, 'job-probe-controller.ps1');
  if (!fs.existsSync(controllerPs1)) {
    console.error('[runner] FAIL: job-probe-controller.ps1 missing (harness failure, no pass)');
    process.exitCode = 2;
    return;
  }

  // ---- Control case: no job; stdin held open; ~2s alive; exit via stdin.
  log('control: spawn mock-child OUTSIDE a PTY with stdin held open (no job)');
  let control = null;
  try {
    control = spawnMockChild('control');
    const controlPid = control.pid;
    if (controlPid === undefined) throw new Error('control child has no PID');
    const controlId = await captureIdentity(controlPid, CIM_CAPTURE_TIMEOUT_MS);
    log(`control: captured identity: pid=${controlId.pid} created=${controlId.creationTime} name=${controlId.name} parentPid=${controlId.parentPid}`);
    if (!(await isIdentityAlive(controlId))) throw new Error('control child gone immediately after spawn (harness failure, no pass)');
    log(`control: alive with no job; holding stdin open for ~${CONTROL_ALIVE_MS}ms`);
    await sleep(CONTROL_ALIVE_MS);
    if (!(await isIdentityAlive(controlId))) throw new Error('control child died during the 2s no-job hold (harness failure, no pass)');
    log('control: still alive after ~2s with no job (as expected: stdin-close ignored, 60s self-expire only)');
    log('control: asking it to exit via its stdin and observing exit');
    const controlExit = await requestChildExit(control, CHILD_EXIT_TIMEOUT_MS);
    if (!controlExit.exited) {
      console.error(`[runner] FAIL: control child did not exit on stdin request within ${CHILD_EXIT_TIMEOUT_MS}ms (harness failure, no pass)`);
      process.exitCode = 2;
      return;
    }
    log(`control: exited as requested (code=${controlExit.code}); control case ok`);
  } catch (err) {
    console.error(`[runner] FAIL (control): ${err && err.message ? err.message : err} (no pass)`);
    if (control !== null) await cleanupChild('control', control);
    process.exitCode = 2;
    return;
  } finally {
    if (control !== null) {
      try {
        control.stdin?.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  // ---- Job case.
  log('job: spawn a second mock-child (stdin held open) for the job probe');
  let child = null;
  let controller = null;
  let controllerOutput = '';
  try {
    child = spawnMockChild('job-child');
    const childPid = child.pid;
    if (childPid === undefined) throw new Error('job child has no PID');
    const childSpawnedAt = Date.now();
    const childId = await captureIdentity(childPid, CIM_CAPTURE_TIMEOUT_MS);
    log(`job: captured identity: pid=${childId.pid} created=${childId.creationTime} name=${childId.name} parentPid=${childId.parentPid}`);
    if (!(await isIdentityAlive(childId))) throw new Error('job child gone immediately after spawn (harness failure, no pass)');

    log(`job: starting controller (powershell + C# P/Invoke): ${controllerPs1} -ChildPid ${childId.pid}`);
    try {
      controller = spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', controllerPs1, '-ChildPid', String(childId.pid), '-ChildCreationTime', childId.creationTime], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      throw new Error(`controller launch failed: ${err && err.message ? err.message : err}`);
    }
    let readyPid = null;
    let failLine = null;
    let controllerExited = null;
    const readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`READY timeout after ${READY_TIMEOUT_MS}ms (job setup failed, no pass)`)), READY_TIMEOUT_MS);
      controller.stdout?.on('data', (d) => {
        controllerOutput += d.toString('utf8');
        logChild('job-controller', d);
        const m = controllerOutput.match(READY_RE);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
          return;
        }
        const f = controllerOutput.match(FAIL_RE);
        if (f) {
          clearTimeout(timer);
          reject(new Error(`controller reported FAIL:${f[1].trim()} (job setup failed, no pass)`));
        }
      });
      controller.stderr?.on('data', (d) => {
        controllerOutput += d.toString('utf8');
        logChild('job-controller', d);
      });
      controller.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`controller launch failed: ${err.message}`));
      });
      controller.on('exit', (code, signal) => {
        controllerExited = { code, signal };
        if (readyPid === null && failLine === null) {
          clearTimeout(timer);
          const f = controllerOutput.match(FAIL_RE);
          reject(new Error(`controller exited before READY (code=${code} signal=${signal}${f ? ` FAIL:${f[1].trim()}` : ''}; job setup failed, no pass)`));
        }
      });
    });

    try {
      readyPid = await readyPromise;
    } catch (err) {
      console.error(`[runner] INCONCLUSIVE: ${err && err.message ? err.message : err}`);
      if (controllerOutput.trim() !== '') log(`controller output tail: ${controllerOutput.slice(-500)}`);
      else log('controller produced no output before failure');
      try {
        controller?.kill();
      } catch {
        /* runner-owned handle only */
      }
      await cleanupChild('job-child', child);
      console.error('[runner] INCONCLUSIVE: job setup failed (exact Win32 error above when present); child asked to exit via stdin; no pass claimed');
      process.exitCode = 2;
      return;
    }

    if (readyPid !== childId.pid) {
      console.error(`[runner] FAIL: controller READY pid=${readyPid} does not match job child pid=${childId.pid} (no pass)`);
      try {
        controller?.kill();
      } catch {
        /* runner-owned handle only */
      }
      await cleanupChild('job-child', child);
      process.exitCode = 2;
      return;
    }
    log(`job: controller READY for pid=${readyPid} (unnamed job, KILL_ON_JOB_CLOSE, IsProcessInJob=true)`);

    if (Date.now() - probeStartedAt >= MAX_PRE_KILL_MS || Date.now() - childSpawnedAt >= MAX_PRE_KILL_MS) {
      console.error('[runner] FAIL: pre-kill setup exceeded the fixture safety margin (no pass)');
      try {
        controller?.kill();
      } catch {
        /* runner-owned handle only */
      }
      await cleanupChild('job-child', child);
      process.exitCode = 2;
      return;
    }
    if (!(await isIdentityAlive(childId))) {
      console.error('[runner] FAIL: job child was gone before the controller kill (no pass)');
      try {
        controller?.kill();
      } catch {
        /* runner-owned handle only */
      }
      process.exitCode = 2;
      return;
    }
    log(`job: child still alive after READY (pid=${childId.pid} created=${childId.creationTime}); terminating ONLY the runner-owned controller ChildProcess via its handle`);

    let ctrlExited = false;
    const ctrlExit = new Promise((resolve) => {
      controller.on('exit', (code, signal) => {
        ctrlExited = true;
        log(`job: controller exited (code=${code} signal=${signal}); OS closes the job handle, KILL_ON_JOB_CLOSE should fire`);
        resolve();
      });
    });
    try {
      controller.kill();
    } catch (err) {
      console.error(`[runner] FAIL: runner-owned controller kill failed: ${err && err.message ? err.message : err} (no pass)`);
      await cleanupChild('job-child', child);
      process.exitCode = 2;
      return;
    }
    const killDeadline = Date.now() + CONTROLLER_KILL_WAIT_MS;
    while (!ctrlExited && Date.now() < killDeadline) {
      await sleep(250);
    }
    if (!ctrlExited) {
      log('job: controller still alive after 10s; retrying kill() on the same runner-owned handle');
      try {
        controller.kill();
      } catch {
        /* ignore */
      }
      await sleep(3000);
    }
    if (!ctrlExited) {
      console.error('[runner] FAIL: runner-owned controller did not exit after kill (no taskkill fallback by design; no pass)');
      await cleanupChild('job-child', child);
      process.exitCode = 2;
      return;
    }
    await ctrlExit;
    await sleep(1000);

    log(`job: re-enumerating pid=${childId.pid} created=${childId.creationTime} (bound ${JOB_GONE_BOUND_MS}ms, read-only, no PID kill)`);
    const wait = await waitForIdentityGone(childId, JOB_GONE_BOUND_MS, JOB_GONE_POLL_MS);
    const elapsedSinceSpawn = Date.now() - childSpawnedAt;
    const elapsedSinceProbe = Date.now() - probeStartedAt;
    if (wait.gone) {
      log(`job: child gone after job closure (attempts=${wait.attempts}, ${elapsedSinceSpawn}ms since child spawn, ${elapsedSinceProbe}ms since probe start; fixture bound is 60000ms)`);
      if (elapsedSinceSpawn >= MAX_JOB_OBSERVATION_MS) {
        console.error(`[runner] INCONCLUSIVE: child gone but ${elapsedSinceSpawn}ms after spawn is too close to the 60s self-expiry to attribute to the job (no pass claimed)`);
        process.exitCode = 2;
        return;
      }
      log('JOB-PROBE PASS: closing the controller-owned unnamed job (KILL_ON_JOB_CLOSE) ended the exact assigned child identity well before its 60s self-expiry.');
      log('Scope: isolated Job Object API observation only (PowerShell + C# P/Invoke, mock-child fixture, no PTY/Electron). S1 9f stays open: Electron main-owned PTY assignment, descendant inheritance, crash relaunch, durable registry reconciliation, and vendor CLIs remain separate.');
      process.exitCode = 0;
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      return;
    }

    console.error(`[runner] FAIL: child identity pid=${childId.pid} created=${childId.creationTime} survived job closure (attempts=${wait.attempts}, ${elapsedSinceSpawn}ms since spawn; no pass)`);
    log('job: requesting its normal exit through the still-open stdin (no PID kill) before failing');
    const exitRes = await requestChildExit(child, CHILD_EXIT_TIMEOUT_MS);
    if (exitRes.exited) {
      log(`job: child exited on normal stdin request (code=${exitRes.code}); job closure did not end it`);
    } else {
      console.error(`[runner] FAIL: child ignored normal stdin exit within ${CHILD_EXIT_TIMEOUT_MS}ms too; leaving to 60s self-expire (no PID kill)`);
    }
    try {
      child.stdin?.destroy();
    } catch {
      /* ignore */
    }
    console.error('[runner] JOB-PROBE FAIL: job closure did not end the child; S1 9f stays open');
    process.exitCode = 1;
  } catch (err) {
    console.error(`[runner] FAIL (job): ${err && err.message ? err.message : err} (no pass)`);
    try {
      controller?.kill();
    } catch {
      /* runner-owned handle only */
    }
    if (child !== null) await cleanupChild('job-child', child);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`[runner] FAIL: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

'use strict';
// S1 step 9f crash+job feasibility probe runner (bounded Windows mock-tree
// experiment only, not the product guarantee). Keeps smoke:crash-baseline
// untouched: this file is the job-enabled counterpart.
// Flow:
//   1. Spawn ONE runner-owned Electron main in --crash-job mode with a
//      test-specific TIYE_CRASH_JOB_REGISTRY_PATH (+ TIYE_MOCK_CRASH_MODE=1).
//      Electron starts the mock CLI in its main-owned PTY, captures the root
//      PID+creation identity, launches scripts/job-probe-controller.ps1 with
//      the NEW opt-in -HoldUntilStdinClose hold (piped stdin), waits for
//      controller READY (queried KILL_ON_JOB_CLOSE=0x2000, same-handle
//      creation check, assignment, IsProcessInJob=true) BEFORE sending `tree`,
//      VERIFies root + mock child as job members over that pipe, writes the
//      durable registry (schema tiye-crash-job-registry v1, explicit
//      jobMode/controller identity + jobVerified evidence) BEFORE READY, and
//      stays alive. When main dies its stdin pipe to the controller closes;
//      the controller exits and closes the last job handle.
//   2. Pre-kill checks (fail closed, exit 2): READY matches the durable
//      registry (including jobControllerPid/jobVerified), timing inside the
//      fixture safety margin, every captured tree identity still alive by
//      exact PID+creation, AND the recorded controller identity still alive
//      (a controller that exited before the main kill is harness failure).
//   3. Terminate ONLY the runner-owned Electron ChildProcess via the handle,
//      relaunch --crash-job-recovery-check (read-only, no duplicate, no PID
//      kill), record exact identities gone/surviving.
// Exit codes: 0 = PASS (bounded observation: verified membership at capture
// and zero survivors; 9f stays partial — zero alone does not prove job
// cause); 1 = FAIL (job setup/verification failed is exit 2, survivors
// present is exit 1 — both nonzero); 2 = harness failure/inconclusive
// (missing/malformed registry, READY mismatch, controller exited early,
// lookup failure, or observation outside the fixture safety bound — never a
// pass). Fixture self-expiry (55s root / 60s child) is safety-only and never
// produces a pass: observations outside the bound are exit 2.
// Never taskkill / Stop-Process / PID-only kill; never targets a captured
// member PID. The only kill() targets are runner-owned Electron handles or
// this helper's own short-lived CIM enumeration on timeout.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');

const READY_TIMEOUT_MS = 60000;
const RECOVERY_TIMEOUT_MS = 45000;
const KILL_WAIT_MS = 10000;
// Both fixture timers begin near spawn (root 55s, child 60s). Keep the crash
// and recovery observation far inside that window so a zero-survivor result
// cannot be explained by the fixture's own safety expiry.
const MAX_PRE_KILL_MS = 20000;
const MAX_RECOVERY_OBSERVATION_MS = 35000;

const READY_RE = /\[crash-job\] READY registry=(.+?) session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+) jobControllerPid=(\d+) jobVerified=(\d+)/;
const SURVIVORS_RE = /\[crash-job-recovery\] SURVIVORS count=(\d+)/;
const RESULT_RE = /\[crash-job-recovery\] RESULT survivors=(\d+)/;

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

// Read-only CIM enumeration (same contract as src/process-tree-9e.ts).
// Never terminates anything; the only kill() in this file targets
// runner-owned Electron ChildProcess handles or this helper's own
// short-lived powershell enumeration on timeout — never a member PID.
const ENUM_SCRIPT =
  'Get-CimInstance Win32_Process | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.ParentProcessId.ToString() + "|" + $_.CreationDate.ToString("o") + "|" + $_.Name }';

function powershellBin() {
  const system = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  try {
    if (fs.existsSync(system)) return system;
  } catch {
    /* fall through */
  }
  return 'powershell.exe';
}

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
      reject(new Error('runner CIM enumeration timed out'));
    }, 20000);
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
          reject(new Error('runner CIM enumeration output exceeded bound'));
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
        reject(new Error(`runner CIM enumeration failed (exit ${code}): ${stderr.slice(0, 300)}`));
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

function readJobRegistryOrFail(registryPath) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  let r;
  try {
    r = JSON.parse(raw);
  } catch {
    throw new Error('registry is not valid JSON (no pass)');
  }
  if (r.schema !== 'tiye-crash-job-registry' || r.version !== 1) {
    throw new Error(`registry schema/version mismatch (want tiye-crash-job-registry v1, got ${r.schema} v${r.version}, no pass)`);
  }
  if (typeof r.sessionId !== 'string' || typeof r.memberId !== 'string') throw new Error('registry session/member missing (no pass)');
  if (r.jobMode !== 'job') throw new Error('registry jobMode missing/invalid (want "job", no pass)');
  if (!Number.isInteger(r.controllerPid) || r.controllerPid <= 0) throw new Error('registry controllerPid missing/malformed (no pass)');
  if (typeof r.controllerCreationTime !== 'string' || r.controllerCreationTime === '') throw new Error('registry controllerCreationTime missing/malformed (no pass)');
  if (r.jobFlags !== '0x2000') throw new Error('registry jobFlags must be 0x2000 (no pass)');
  if (!Array.isArray(r.tree) || r.tree.length < 2) throw new Error(`registry tree too small (got ${Array.isArray(r.tree) ? r.tree.length : 'non-array'}, no pass)`);
  if (!Array.isArray(r.jobVerified) || r.jobVerified.length < 2) throw new Error(`registry jobVerified must hold >=2 verified job members (got ${Array.isArray(r.jobVerified) ? r.jobVerified.length : 'non-array'}, no pass)`);
  if (typeof r.jobConhostNote !== 'string') throw new Error('registry jobConhostNote missing/malformed (no pass)');
  const root = r.tree.find((id) => id.pid === r.rootPid && id.creationTime === r.rootCreationTime);
  if (!root) throw new Error('registry root identity absent from captured tree (no pass)');
  const vroot = r.jobVerified.find((id) => id.pid === r.rootPid && id.creationTime === r.rootCreationTime);
  if (!vroot) throw new Error('registry jobVerified lacks the verified root identity (no pass)');
  const capturedKeys = new Set(r.tree.map((id) => `${id.pid}|${id.creationTime}`));
  if (r.jobVerified.some((id) => !capturedKeys.has(`${id.pid}|${id.creationTime}`))) throw new Error('registry verified member absent from captured tree (no pass)');
  if (!r.jobVerified.some((id) => id.pid !== r.rootPid && id.name.toLowerCase() === 'node.exe')) throw new Error('registry verified mock child missing (no pass)');
  return r;
}

async function main() {
  const probeStartedAt = Date.now();
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[runner] FAIL: dist/main.js missing (run npm run build first)');
    process.exitCode = 2;
    return;
  }
  const runDir = path.join(os.tmpdir(), `tiye-crash-job-${Date.now()}-${process.pid}`);
  const registryPath = path.join(runDir, 'registry.json');
  fs.mkdirSync(runDir, { recursive: true });
  log(`registry path: ${registryPath}`);
  log('phase 1: spawn runner-owned Electron --crash-job (mock crash fixture self-expires within 60s; job controller holds KILL_ON_JOB_CLOSE)');

  const env1 = { ...process.env, TIYE_CRASH_JOB_REGISTRY_PATH: registryPath, TIYE_CRASH_REGISTRY_PATH: registryPath, TIYE_MOCK_CRASH_MODE: '1' };
  delete env1.ELECTRON_RUN_AS_NODE;
  const first = spawn(electron, [distMain, '--crash-job'], {
    cwd: path.resolve(__dirname, '..'),
    env: env1,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let firstOutput = '';
  let ready = null;
  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`READY + registry timeout after ${READY_TIMEOUT_MS}ms (harness failure, no pass)`)), READY_TIMEOUT_MS);
    const check = () => {
      const m = firstOutput.match(READY_RE);
      if (m && fs.existsSync(registryPath)) {
        try {
          const reg = readJobRegistryOrFail(registryPath);
          clearTimeout(timer);
          resolve({ match: m, registry: reg });
          return true;
        } catch (err) {
          // Registry present but invalid: keep waiting briefly for a rewrite,
          // but a persistently malformed registry is harness failure at timeout.
        }
      }
      return false;
    };
    first.stdout?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild('crash-job-main', d);
      check();
    });
    first.stderr?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild('crash-job-main', d);
      check();
    });
    first.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`first Electron launch failed: ${err.message}`));
    });
    first.on('exit', (code, signal) => {
      // Exiting before READY is a harness failure (the mode must stay alive
      // until the runner kills it; a controller that exited early makes
      // Electron exit 2, which also lands here).
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`first Electron exited before READY (code=${code} signal=${signal}, harness failure, no pass)`));
      }
    });
  });

  try {
    const found = await readyPromise;
    ready = found;
  } catch (err) {
    console.error(`[runner] FAIL: ${err.message}`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    await sleep(1000);
    process.exitCode = 2;
    return;
  }

  const [, regPathLogged, sessionId, memberId, rootPidStr, treeSizeStr, controllerPidStr, jobVerifiedStr] = ready.match;
  log(`READY observed: session=${sessionId} member=${memberId} rootPid=${rootPidStr} treeSize=${treeSizeStr} jobControllerPid=${controllerPidStr} jobVerified=${jobVerifiedStr}`);
  let registry;
  try {
    registry = readJobRegistryOrFail(registryPath);
  } catch (err) {
    console.error(`[runner] FAIL: durable registry invalid: ${err.message}`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    process.exitCode = 2;
    return;
  }
  log(`registry ok: session=${registry.sessionId} member=${registry.memberId} rootPid=${registry.rootPid} treeSize=${registry.tree.length} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version} jobMode=${registry.jobMode} controllerPid=${registry.controllerPid} jobFlags=${registry.jobFlags} jobVerified=${registry.jobVerified.length}`);
  for (const id of registry.tree) {
    log(`captured identity: pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`);
  }
  for (const v of registry.jobVerified) {
    log(`job-verified member: pid=${v.pid} created=${v.creationTime} name=${v.name} parentPid=${v.parentPid} inJob=true(at-capture)`);
  }
  log(`conhost note: ${registry.jobConhostNote}`);
  if (
    registryPath !== regPathLogged ||
    registry.sessionId !== sessionId ||
    registry.memberId !== memberId ||
    registry.rootPid !== Number(rootPidStr) ||
    registry.tree.length !== Number(treeSizeStr) ||
    registry.controllerPid !== Number(controllerPidStr) ||
    registry.jobVerified.length !== Number(jobVerifiedStr)
  ) {
    console.error('[runner] FAIL: READY does not match the durable registry (controller READY mismatch, no pass)');
    first.kill();
    process.exitCode = 2;
    return;
  }
  if (registry.jobVerified.length < 2) {
    console.error('[runner] FAIL: registry jobVerified holds fewer than root+child (job membership not proven, no pass)');
    first.kill();
    process.exitCode = 2;
    return;
  }
  if (Date.now() - probeStartedAt >= MAX_PRE_KILL_MS) {
    console.error('[runner] FAIL: pre-kill setup exceeded the fixture safety margin (no pass)');
    first.kill();
    process.exitCode = 2;
    return;
  }
  try {
    const live = await enumerateAllOnce();
    const missing = registry.tree.filter((id) => live.get(id.pid)?.creationTime !== id.creationTime);
    if (missing.length > 0) {
      console.error(`[runner] FAIL: ${missing.length} captured identity/identities were gone before the main kill (no pass)`);
      for (const m of missing) console.error(`[runner] missing pre-kill: pid=${m.pid} created=${m.creationTime} name=${m.name}`);
      first.kill();
      process.exitCode = 2;
      return;
    }
    log(`pre-kill identity check: all ${registry.tree.length} exact PID+creation identities still alive`);
    const ctrlCur = live.get(registry.controllerPid);
    if (ctrlCur === undefined || ctrlCur.creationTime !== registry.controllerCreationTime) {
      console.error(`[runner] FAIL: job controller pid=${registry.controllerPid} was gone or reused before the main kill (controller exited early, no pass)`);
      first.kill();
      process.exitCode = 2;
      return;
    }
    log(`pre-kill controller check: controller pid=${registry.controllerPid} still alive (exact PID+creation match; last job handle held)`);
  } catch (err) {
    console.error(`[runner] FAIL: pre-kill identity lookup failed: ${err.message} (no pass)`);
    first.kill();
    process.exitCode = 2;
    return;
  }
  if (Date.now() - probeStartedAt >= MAX_PRE_KILL_MS || first.exitCode !== null || first.signalCode !== null) {
    console.error('[runner] FAIL: fixture expired or Electron main exited before the deliberate kill (controller may have exited early; no pass)');
    process.exitCode = 2;
    return;
  }

  // Phase 2: force-terminate ONLY the runner-owned Electron ChildProcess via
  // the handle. Never taskkill / Stop-Process / PID-only kill, never a
  // captured member PID. The dead main's stdin pipe to the controller must
  // close; the controller then exits and closes the last job handle.
  log('phase 2: terminating ONLY the runner-owned Electron ChildProcess via handle (child.kill(), no PID kill)');
  let firstExited = false;
  const firstExit = new Promise((resolve) => {
    first.on('exit', (code, signal) => {
      firstExited = true;
      log(`first Electron exited (code=${code} signal=${signal})`);
      resolve();
    });
  });
  try {
    first.kill();
  } catch (err) {
    console.error(`[runner] FAIL: runner-owned kill failed: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  const killDeadline = Date.now() + KILL_WAIT_MS;
  while (!firstExited && Date.now() < killDeadline) {
    await sleep(250);
  }
  if (!firstExited) {
    log('first Electron still alive after 10s; retrying child.kill() on the same runner-owned handle');
    try {
      first.kill();
    } catch {
      /* ignore */
    }
    await sleep(3000);
  }
  if (!firstExited) {
    console.error('[runner] FAIL: runner-owned Electron did not exit after kill (no taskkill fallback by design; harness failure, no pass)');
    process.exitCode = 2;
    return;
  }
  await firstExit;
  await sleep(2000);
  try {
    const afterKill = await enumerateAllOnce();
    if (afterKill.get(registry.controllerPid)?.creationTime === registry.controllerCreationTime) {
      console.error('[runner] FAIL: exact job-controller identity still alive after Electron main exit; last job handle may remain open (no pass)');
      process.exitCode = 2;
      return;
    }
    log(`post-kill controller check: exact controller pid=${registry.controllerPid} identity gone (stdin EOF released job handle)`);
  } catch (err) {
    console.error(`[runner] FAIL: post-kill controller identity lookup failed: ${err.message} (no pass)`);
    process.exitCode = 2;
    return;
  }

  // Phase 3: relaunch a NEW Electron main in job recovery-check mode. It reads
  // the registry, re-enumerates by PID+creation identity, reports survivors,
  // and pauses (no duplicate launch, no PID kill).
  log('phase 3: relaunch NEW Electron --crash-job-recovery-check (read-only, no duplicate, no PID kill)');
  const env2 = { ...process.env, TIYE_CRASH_JOB_REGISTRY_PATH: registryPath, TIYE_CRASH_REGISTRY_PATH: registryPath };
  delete env2.ELECTRON_RUN_AS_NODE;
  delete env2.TIYE_MOCK_CRASH_MODE;
  const second = spawn(electron, [distMain, '--crash-job-recovery-check'], {
    cwd: path.resolve(__dirname, '..'),
    env: env2,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let secondOutput = '';
  second.stdout?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild('job-recovery-main', d);
  });
  second.stderr?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild('job-recovery-main', d);
  });
  const secondExit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        second.kill();
      } catch {
        /* runner-owned handle only */
      }
      reject(new Error(`recovery-check timeout after ${RECOVERY_TIMEOUT_MS}ms (harness failure, no pass)`));
    }, RECOVERY_TIMEOUT_MS);
    second.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`recovery-check launch failed: ${err.message}`));
    });
    second.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? 2, signal });
    });
  }).catch((err) => {
    console.error(`[runner] FAIL: ${err.message}`);
    return { code: 2, signal: null, failed: true };
  });

  const survMatch = secondOutput.match(SURVIVORS_RE);
  const resultMatch = secondOutput.match(RESULT_RE);
  const immediateSurvivors = survMatch ? Number(survMatch[1]) : null;
  const observationElapsedMs = Date.now() - probeStartedAt;
  log(`recovery observation elapsed=${observationElapsedMs}ms since fixture launch (safety bound <${MAX_RECOVERY_OBSERVATION_MS}ms)`);
  log(`immediate recovery outcome: exit=${secondExit.code}${secondExit.signal ? ` signal=${secondExit.signal}` : ''} survivors=${immediateSurvivors !== null ? immediateSurvivors : 'unknown'}${resultMatch ? ` (${resultMatch[0]})` : ''}`);
  for (const id of registry.tree) {
    log(`recorded identity: pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`);
  }

  if (secondExit.code === 2 || immediateSurvivors === null || observationElapsedMs >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error('[runner] FAIL: recovery-check harness failure (missing/malformed registry, lookup failure, or observation outside the fixture safety bound — fixture self-expiry is safety-only and never a pass; no cleanup claimed)');
    process.exitCode = 2;
    return;
  }

  if (immediateSurvivors === 0 && secondExit.code === 0) {
    log(`CRASH-JOB OBSERVATION: survivors=0 with ${registry.jobVerified.length} VERIFIED job members at capture (root+mock-child inJob=true, flags=${registry.jobFlags}).`);
    log('Added evidence vs the no-job baseline (which also saw 0 survivors without a job): the registry records actual job membership; zero alone is still not cited as job-cause proof. 9f stays partial (Windows mock-tree experiment only).');
    log('no bounded-cleanup wait needed (nothing survived); no PID kill used at any point; fixture bound respected.');
    process.exitCode = 0;
    return;
  }

  if (immediateSurvivors > 0) {
    console.error(`[runner] CRASH-JOB FAIL: ${immediateSurvivors} captured member identity/identities survived the job-bounded crash (exit 1; fixture self-expire bounds orphans but is safety-only, never a pass; 9f stays partial)`);
    process.exitCode = 1;
    return;
  }

  console.error(`[runner] FAIL: ambiguous recovery outcome (exit=${secondExit.code} survivors=${immediateSurvivors}, harness failure, no pass)`);
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(`[runner] FAIL: ${err && err.message ? err.message : err}`);
  process.exitCode = 2;
});

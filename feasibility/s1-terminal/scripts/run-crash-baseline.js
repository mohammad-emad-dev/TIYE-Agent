'use strict';
// S1 step 9f BASELINE crash-and-relaunch feasibility probe runner.
// Feasibility only: no Job Object, no product recovery state machine, no 9f
// pass claimed. Bounds everything; never uses taskkill / Stop-Process /
// PID-only termination; never targets a captured member PID.
//
// Flow:
//   1. Spawn ONE runner-owned Electron main in --crash-baseline mode with a
//      test-specific TIYE_CRASH_REGISTRY_PATH (+ TIYE_MOCK_CRASH_MODE=1 so the
//      mock root/child self-expire within 60s). Wait for its structured READY
//      line AND the atomic durable registry.
//   2. Force-terminate ONLY that runner-owned Electron ChildProcess via the
//      handle (child.kill()), never an arbitrary PID.
//   3. Relaunch a NEW Electron main in --crash-recovery-check mode. It reads
//      the registry, re-enumerates by PID+creation identity, reports
//      survivors, and pauses (no duplicate launch, no PID kill). Its exit
//      code is the immediate recovery outcome: 0 = no survivors, 1 =
//      survivors (expected without a job), 2 = harness failure.
//   4. After recording the immediate outcome, wait for THOSE EXACT identities
//      to disappear via read-only re-enumeration (no PID kill) within the
//      fixture bound. If any remain beyond the bound, report loudly and do
//      NOT claim cleanup.
// Exit codes: 1 = survivors observed (expected baseline without a job),
// 0 = Windows already reaped the tree (record honestly, infer no job),
// 2 = harness failure (READY/registry/lookup/cleanup-bound failure).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');

const READY_TIMEOUT_MS = 60000;
const RECOVERY_TIMEOUT_MS = 45000;
const CLEANUP_BOUND_MS = 75000;
const CLEANUP_POLL_MS = 2000;
const KILL_WAIT_MS = 10000;
// Both fixture timers begin near spawn (root 55s, child 60s). Keep the
// crash and recovery observation far inside that window so a zero-survivor
// result cannot be explained by the fixture's own safety expiry.
const MAX_PRE_KILL_MS = 20000;
const MAX_RECOVERY_OBSERVATION_MS = 35000;

const READY_RE = /\[crash-baseline\] READY registry=(.+?) session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+)/;
const SURVIVORS_RE = /\[crash-recovery\] SURVIVORS count=(\d+)/;
const RESULT_RE = /\[crash-recovery\] RESULT survivors=(\d+)/;

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

async function waitForIdentitiesGone(captured, boundMs, pollMs) {
  const deadline = Date.now() + boundMs;
  let attempts = 0;
  // biome-ignore lint: bounded poll loop
  while (true) {
    attempts += 1;
    const all = await enumerateAllOnce();
    const survivors = captured.filter((id) => {
      const cur = all.get(id.pid);
      return cur !== undefined && cur.creationTime === id.creationTime;
    });
    const gone = captured.filter((id) => !survivors.includes(id));
    if (survivors.length === 0) return { gone, survivors, attempts };
    if (Date.now() >= deadline) return { gone, survivors, attempts };
    await sleep(pollMs);
  }
}

function readRegistryOrFail(registryPath) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const r = JSON.parse(raw);
  if (r.schema !== 'tiye-crash-baseline-registry' || r.version !== 1) {
    throw new Error('registry schema/version mismatch (no pass)');
  }
  if (typeof r.sessionId !== 'string' || typeof r.memberId !== 'string') throw new Error('registry session/member missing (no pass)');
  if (!Array.isArray(r.tree) || r.tree.length < 2) throw new Error(`registry tree too small (got ${Array.isArray(r.tree) ? r.tree.length : 'non-array'}, no pass)`);
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
  const runDir = path.join(os.tmpdir(), `tiye-crash-baseline-${Date.now()}-${process.pid}`);
  const registryPath = path.join(runDir, 'registry.json');
  fs.mkdirSync(runDir, { recursive: true });
  log(`registry path: ${registryPath}`);
  log('phase 1: spawn runner-owned Electron --crash-baseline (mock crash fixture self-expires within 60s)');

  const env1 = { ...process.env, TIYE_CRASH_REGISTRY_PATH: registryPath, TIYE_MOCK_CRASH_MODE: '1' };
  delete env1.ELECTRON_RUN_AS_NODE;
  const first = spawn(electron, [distMain, '--crash-baseline'], {
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
          const reg = readRegistryOrFail(registryPath);
          clearTimeout(timer);
          resolve({ match: m, registry: reg });
          return true;
        } catch (err) {
          // Registry present but invalid: keep waiting briefly for a rewrite?
          // No — a malformed registry is a harness failure, but wait until
          // timeout so a slow atomic rename still has a chance.
        }
      }
      return false;
    };
    first.stdout?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild('baseline-main', d);
      check();
    });
    first.stderr?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild('baseline-main', d);
      check();
    });
    first.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`first Electron launch failed: ${err.message}`));
    });
    first.on('exit', (code, signal) => {
      // Exiting before READY is a harness failure (the mode must stay alive
      // until the runner kills it).
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

  const [, regPathLogged, sessionId, memberId, rootPidStr, treeSizeStr] = ready.match;
  log(`READY observed: session=${sessionId} member=${memberId} rootPid=${rootPidStr} treeSize=${treeSizeStr}`);
  let registry;
  try {
    registry = readRegistryOrFail(registryPath);
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
  log(`registry ok: session=${registry.sessionId} member=${registry.memberId} rootPid=${registry.rootPid} treeSize=${registry.tree.length} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version}`);
  for (const id of registry.tree) {
    log(`captured identity: pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`);
  }
  if (registryPath !== regPathLogged || registry.sessionId !== sessionId || registry.memberId !== memberId || registry.rootPid !== Number(rootPidStr) || registry.tree.length !== Number(treeSizeStr)) {
    console.error('[runner] FAIL: READY does not match the durable registry (no pass)');
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
      first.kill();
      process.exitCode = 2;
      return;
    }
    log(`pre-kill identity check: all ${registry.tree.length} exact PID+creation identities still alive`);
  } catch (err) {
    console.error(`[runner] FAIL: pre-kill identity lookup failed: ${err.message} (no pass)`);
    first.kill();
    process.exitCode = 2;
    return;
  }
  if (Date.now() - probeStartedAt >= MAX_PRE_KILL_MS || first.exitCode !== null || first.signalCode !== null) {
    console.error('[runner] FAIL: fixture expired or Electron main exited before the deliberate kill (no pass)');
    process.exitCode = 2;
    return;
  }

  // Phase 2: force-terminate ONLY the runner-owned Electron ChildProcess via
  // the handle. Never taskkill / Stop-Process / PID-only kill, never a
  // captured member PID.
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
    // Retry once via the same runner-owned handle (still not a PID kill).
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
  // Small settle so the OS state after main death is what recovery observes.
  await sleep(2000);

  // Phase 3: relaunch a NEW Electron main in recovery-check mode. It reads
  // the registry, re-enumerates by PID+creation identity, reports survivors,
  // and pauses (no duplicate launch, no PID kill).
  log('phase 3: relaunch NEW Electron --crash-recovery-check (read-only, no duplicate, no PID kill)');
  const env2 = { ...process.env, TIYE_CRASH_REGISTRY_PATH: registryPath };
  delete env2.ELECTRON_RUN_AS_NODE;
  delete env2.TIYE_MOCK_CRASH_MODE;
  const second = spawn(electron, [distMain, '--crash-recovery-check'], {
    cwd: path.resolve(__dirname, '..'),
    env: env2,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let secondOutput = '';
  second.stdout?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild('recovery-main', d);
  });
  second.stderr?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild('recovery-main', d);
  });
  const secondExit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Recovery-check should exit itself; a hang is a harness failure. Kill
      // via the runner-owned handle only (never a PID).
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

  if (secondExit.code === 2 || immediateSurvivors === null || observationElapsedMs >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error('[runner] FAIL: recovery-check harness failure (registry missing/malformed or identity lookup failed — no pass, no cleanup claimed)');
    process.exitCode = 2;
    return;
  }

  if (immediateSurvivors === 0 && secondExit.code === 0) {
    log('BASELINE OBSERVATION: survivors=0 — Windows already reaped the tree. Record honestly: no Job Object exists here, so no job behavior is inferred. 9f stays partial.');
    log('no bounded-cleanup wait needed (nothing survived); no PID kill used at any point.');
    process.exitCode = 0;
    return;
  }

  if (!(immediateSurvivors > 0 && secondExit.code === 1)) {
    console.error(`[runner] FAIL: ambiguous recovery outcome (exit=${secondExit.code} survivors=${immediateSurvivors}, harness failure, no pass)`);
    process.exitCode = 2;
    return;
  }

  // Expected baseline path: survivors present without a job. Record the
  // immediate outcome FIRST, then bound cleanup by waiting for THOSE EXACT
  // identities to disappear via read-only polling (no PID kill).
  log(`BASELINE OBSERVATION: survivors=${immediateSurvivors} (expected without a Windows Job Object; 9f stays partial, no job inferred)`);
  log(`phase 4: bounded cleanup wait — read-only re-enumeration of the ${registry.tree.length} exact captured identities until gone (bound ${CLEANUP_BOUND_MS}ms, no PID kill)`);
  let cleanup;
  try {
    cleanup = await waitForIdentitiesGone(registry.tree, CLEANUP_BOUND_MS, CLEANUP_POLL_MS);
  } catch (err) {
    console.error(`[runner] FAIL: cleanup re-enumeration failed: ${err.message} (no cleanup claimed)`);
    process.exitCode = 2;
    return;
  }
  if (cleanup.survivors.length === 0) {
    log(`bounded self-expire observed: all ${registry.tree.length} captured identities gone within the bound (attempts=${cleanup.attempts}, no PID kill used — fixture 60s self-expire, not a job)`);
    log(`BASELINE RESULT: exit 1 (survivors were present immediately after the crash; later self-expire is NOT job cleanup; 9f stays partial)`);
    process.exitCode = 1;
    return;
  }
  console.error(`[runner] CLEANUP BOUND EXCEEDED: ${cleanup.survivors.length} identit(ies) still present after ${CLEANUP_BOUND_MS}ms: ${cleanup.survivors.map((id) => `pid=${id.pid} created=${id.creationTime} name=${id.name}`).join('; ')}`);
  console.error('[runner] DO NOT CLAIM CLEANUP: fixture self-expire did not bound the orphan; no PID kill was used and none will be. Harness/fixture failure (exit 2), 9f stays partial.');
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(`[runner] FAIL: ${err && err.message ? err.message : err}`);
  process.exitCode = 2;
});

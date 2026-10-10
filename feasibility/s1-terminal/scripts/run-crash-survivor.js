'use strict';
// S1 step 9f crash-survivor feasibility runner (bounded Windows mock-sidecar
// experiment only, not the product guarantee). Keeps smoke:crash-baseline,
// smoke:crash-job, smoke:identity-stop untouched: this file is the
// survivor-cleanup counterpart that integrates the verified-identity-stop
// primitive with a relaunched Electron main.
//
// Sidecar contract (unchanged fixture mock-cli/mock-child.js): exits itself
// on an `exit` stdin line, ignores stdin EOF, self-expires at 60s. Electron
// --crash-survivor spawns it as a DIRECT child outside any PTY/job, holds
// stdin open, records PID+creation in a distinct registry
// (tiye-crash-survivor-registry v1), and stays alive. Recovery
// (--crash-survivor-recovery-check) strictly validates that registry, fails
// closed with ALERT on absent/mismatched/inconsistent identities (never
// invoking the helper there), otherwise invokes
// scripts/verified-identity-stop.ps1 with the SAVED identity and requires
// STOPPED exit 0 plus exact-gone re-enumeration. No fallback PID kill.
//
// Flow:
//   Scenario 1 (positive): READY + registry match, pre-kill exact alive,
//     runner-owned Electron kill via handle, post-kill exact still alive
//     BEFORE recovery (else inconclusive exit 2, never a pass), recovery
//     CLEANED + PAUSED/no-duplicate with helper STOPPED, then exact gone
//     well before 60s.
//   Scenario 2 (tampered creation): fresh sidecar, same kill + post-kill
//     alive proof, then change ONLY saved childCreationTime by +1h (original
//     retained separately). Recovery must ALERT/PAUSE with NO helper
//     invocation and NO duplicate spawn; original exact must remain alive.
//     Runner then uses the helper with the ORIGINAL trusted identity as
//     test-only teardown (reported separately), proving exact gone.
// Exit codes: 0 = PASS (both scenarios, well inside bounds); 1 = FAIL /
//   safety violation (helper invoked on tampered, tampered cleaned, positive
//   survivor remains after claimed CLEANED, duplicate spawn, wrong identity
//   terminated); 2 = inconclusive/harness failure (setup/timeout/lookup
//   failure, sidecar did not survive main death, observation near 60s expiry,
//   non-Windows -- never a pass).
// Never taskkill / Stop-Process / PID-only kill / name matching; the only
// kill() targets are runner-owned Electron handles or this helper's own
// short-lived CIM/helper processes on timeout -- never a captured sidecar
// PID. Every teardown of a surviving sidecar uses the verified-identity
// helper with a trusted identity, never a raw PID kill.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');

const READY_TIMEOUT_MS = 60000;
const RECOVERY_TIMEOUT_MS = 45000;
const HELPER_TIMEOUT_MS = 15000;
const KILL_WAIT_MS = 10000;
const CIM_TIMEOUT_MS = 20000;
const GONE_BOUND_MS = 10000;
const GONE_POLL_MS = 250;
// Fixture self-expires at 60s from spawn. Keep each scenario's crash and
// recovery observation far inside that window so a gone result cannot be
// explained by the safety timer. The whole two-scenario suite must also
// finish well inside 60s from suite start for a pass; anything near expiry
// is inconclusive exit 2, never a pass.
const MAX_PRE_KILL_MS = 20000;
const MAX_RECOVERY_OBSERVATION_MS = 35000;
const MAX_SUITE_MS = 55000;

const READY_RE = /\[crash-survivor\] READY registry=(.+?) session=(\S+) member=(\S+) childPid=(\d+) mainPid=(\d+)/;
const CLEANED_RE = /\[crash-survivor-recovery\] CLEANED/;
const PAUSED_RE = /\[crash-survivor-recovery\] PAUSED/;
const ALERT_RE = /\[crash-survivor-recovery\] ALERT/;
const NO_DUP_RE = /no-duplicate-launch/;
const HELPER_INVOKED_RE = /HELPER-INVOKED|\[verified-stop\]/;
const STOPPED_RE = /\[verified-stop\] STOPPED/;

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

// Narrow single-PID CIM query (same contract as run-identity-stop.js).
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
      const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
      if (lines.length === 0) {
        resolve(null);
        return;
      }
      if (lines.length > 1) {
        reject(new Error(`CIM query for PID ${pid} returned ${lines.length} rows`));
        return;
      }
      const line = lines[0];
      const first = line.indexOf('|');
      const second = line.indexOf('|', first + 1);
      if (first < 0 || second < 0) {
        reject(new Error('malformed CIM row'));
        return;
      }
      const creationTime = line.slice(0, first);
      const name = line.slice(first + 1, second);
      const parentPid = Number(line.slice(second + 1));
      if (creationTime === '' || name === '' || !Number.isInteger(parentPid)) {
        reject(new Error('invalid CIM identity'));
        return;
      }
      resolve({ pid, creationTime, name, parentPid });
    });
  });
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
    if (cur === null || cur.creationTime !== identity.creationTime) return { gone: true, attempts };
    if (Date.now() >= deadline) return { gone: false, attempts };
    await sleep(pollMs);
  }
}

function readSurvivorRegistryOrFail(registryPath) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  let r;
  try {
    r = JSON.parse(raw);
  } catch {
    throw new Error('registry is not valid JSON (no pass)');
  }
  if (r.schema !== 'tiye-crash-survivor-registry' || r.version !== 1) {
    throw new Error(`registry schema/version mismatch (want tiye-crash-survivor-registry v1, got ${r.schema} v${r.version}, no pass)`);
  }
  if (typeof r.sessionId !== 'string' || r.sessionId === '') throw new Error('registry sessionId missing (no pass)');
  if (typeof r.memberId !== 'string' || r.memberId === '') throw new Error('registry memberId missing (no pass)');
  if (r.lastIntent !== 'run') throw new Error('registry lastIntent missing/invalid (want "run", no pass)');
  if (!Number.isInteger(r.childPid) || r.childPid <= 0) throw new Error('registry childPid missing/malformed (no pass)');
  if (typeof r.childCreationTime !== 'string' || r.childCreationTime === '') throw new Error('registry childCreationTime missing/malformed (no pass)');
  if (typeof r.childName !== 'string' || r.childName === '') throw new Error('registry childName missing/malformed (no pass)');
  if (!Number.isInteger(r.mainPid) || r.mainPid <= 0) throw new Error('registry mainPid missing/malformed (no pass)');
  if (typeof r.mainCreationTime !== 'string' || r.mainCreationTime === '') throw new Error('registry mainCreationTime missing/malformed (no pass)');
  if (!Number.isInteger(r.childParentPid) || r.childParentPid < 0) throw new Error('registry childParentPid missing/malformed (no pass)');
  if (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) throw new Error('registry createdAt missing/malformed (no pass)');
  return r;
}

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
      reject(new Error(`verified-identity teardown helper timed out after ${HELPER_TIMEOUT_MS}ms (helper handle killed, no PID kill)`));
    }, HELPER_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      output += d.toString('utf8');
      logChild('teardown-helper', d);
    });
    child.stderr?.on('data', (d) => {
      output += d.toString('utf8');
      logChild('teardown-helper', d);
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
  if (!Number.isFinite(t)) throw new Error(`cannot parse correct creation time '${correctISO}'`);
  return new Date(t + 3600000).toISOString();
}

// Spawn ONE runner-owned Electron --crash-survivor, wait READY + registry,
// verify pre-kill alive, kill ONLY the runner-owned handle, verify post-kill
// survivor alive BEFORE recovery. Returns the live context for the caller to
// drive recovery. Throws with .code 1 (safety FAIL) or 2 (harness).
async function startKillAndProveSurvivor(tag, registryPath, suiteStartedAt) {
  const scenarioStartedAt = Date.now();
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    const err = new Error('dist/main.js missing (run npm run build first)');
    err.code = 2;
    throw err;
  }
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  log(`${tag}: phase 1: spawn runner-owned Electron --crash-survivor (direct sidecar, no PTY, no job; 60s self-expire)`);
  log(`${tag}: registry path: ${registryPath}`);
  const env1 = { ...process.env, TIYE_CRASH_SURVIVOR_REGISTRY_PATH: registryPath };
  delete env1.ELECTRON_RUN_AS_NODE;
  delete env1.TIYE_MOCK_CRASH_MODE;
  const first = spawn(electron, [distMain, '--crash-survivor'], {
    cwd: path.resolve(__dirname, '..'),
    env: env1,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let firstOutput = '';
  let ready = null;
  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(`READY + registry timeout after ${READY_TIMEOUT_MS}ms (harness failure, no pass)`), { code: 2 })), READY_TIMEOUT_MS);
    const check = () => {
      const m = firstOutput.match(READY_RE);
      if (m && fs.existsSync(registryPath)) {
        try {
          const reg = readSurvivorRegistryOrFail(registryPath);
          clearTimeout(timer);
          resolve({ match: m, registry: reg });
          return true;
        } catch (err) {
          // Keep waiting briefly for a rewrite; persistent mismatch fails at timeout.
        }
      }
      return false;
    };
    first.stdout?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild(`${tag}-main`, d);
      check();
    });
    first.stderr?.on('data', (d) => {
      firstOutput += d.toString('utf8');
      logChild(`${tag}-main`, d);
      check();
    });
    first.on('error', (err) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`first Electron launch failed: ${err.message}`), { code: 2 }));
    });
    first.on('exit', (code, signal) => {
      if (!ready) {
        clearTimeout(timer);
        reject(Object.assign(new Error(`first Electron exited before READY (code=${code} signal=${signal}, harness failure, no pass)`), { code: 2 }));
      }
    });
  });
  try {
    ready = await readyPromise;
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: ${err.message}`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    await sleep(1000);
    throw err.code === 1 ? err : Object.assign(err, { code: 2 });
  }
  const [, regPathLogged, sessionId, memberId, childPidStr, mainPidStr] = ready.match;
  log(`${tag}: READY observed: session=${sessionId} member=${memberId} childPid=${childPidStr} mainPid=${mainPidStr}`);
  let registry;
  try {
    registry = readSurvivorRegistryOrFail(registryPath);
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: durable registry invalid: ${err.message}`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(err, { code: 2 });
  }
  log(`${tag}: registry ok: session=${registry.sessionId} member=${registry.memberId} childPid=${registry.childPid} mainPid=${registry.mainPid} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version}`);
  log(`${tag}: captured: child pid=${registry.childPid} created=${registry.childCreationTime} name=${registry.childName} parentPid=${registry.childParentPid}; main pid=${registry.mainPid} created=${registry.mainCreationTime}`);
  if (registryPath !== regPathLogged || registry.sessionId !== sessionId || registry.memberId !== memberId || registry.childPid !== Number(childPidStr) || registry.mainPid !== Number(mainPidStr)) {
    console.error(`[runner] ${tag} FAIL: READY does not match the durable registry (no pass)`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(new Error('READY/registry mismatch'), { code: 2 });
  }
  if (registry.childParentPid !== registry.mainPid) {
    console.error(`[runner] ${tag} FAIL: registry childParentPid=${registry.childParentPid} != mainPid=${registry.mainPid} (not a direct child, no pass)`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(new Error('registry direct-child inconsistency'), { code: 2 });
  }
  if (String(registry.childName).toLowerCase() !== 'node.exe') {
    console.error(`[runner] ${tag} FAIL: registry childName=${registry.childName} != node.exe (no pass)`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(new Error('registry childName mismatch'), { code: 2 });
  }
  if (Date.now() - scenarioStartedAt >= MAX_PRE_KILL_MS) {
    console.error(`[runner] ${tag} FAIL: pre-kill setup exceeded the fixture safety margin (no pass)`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(new Error('pre-kill safety margin exceeded'), { code: 2 });
  }
  const trustedChild = { pid: registry.childPid, creationTime: registry.childCreationTime, name: registry.childName, parentPid: registry.childParentPid };
  try {
    const cur = await queryIdentityOnce(trustedChild.pid);
    if (cur === null || cur.creationTime !== trustedChild.creationTime) {
      console.error(`[runner] ${tag} FAIL: exact sidecar identity gone before the main kill (no pass)`);
      try {
        first.kill();
      } catch {
        /* runner-owned handle only */
      }
      throw new Error('pre-kill sidecar absent');
    }
    log(`${tag}: pre-kill identity check: exact sidecar pid=${cur.pid} created=${cur.creationTime} name=${cur.name} parentPid=${cur.parentPid} still alive`);
  } catch (err) {
    if (err.code === 1 || err.code === 2) throw err;
    console.error(`[runner] ${tag} FAIL: pre-kill identity lookup failed: ${err.message} (no pass)`);
    try {
      first.kill();
    } catch {
      /* runner-owned handle only */
    }
    throw Object.assign(err, { code: 2 });
  }
  if (Date.now() - scenarioStartedAt >= MAX_PRE_KILL_MS || first.exitCode !== null || first.signalCode !== null) {
    console.error(`[runner] ${tag} FAIL: fixture expired or Electron main exited before the deliberate kill (no pass)`);
    throw Object.assign(new Error('expired before deliberate kill'), { code: 2 });
  }
  log(`${tag}: phase 2: terminating ONLY the runner-owned Electron ChildProcess via handle (child.kill(), no PID kill)`);
  let firstExited = false;
  const firstExit = new Promise((resolve) => {
    first.on('exit', (code, signal) => {
      firstExited = true;
      log(`${tag}: first Electron exited (code=${code} signal=${signal})`);
      resolve();
    });
  });
  try {
    first.kill();
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: runner-owned kill failed: ${err.message}`);
    throw Object.assign(err, { code: 2 });
  }
  const killDeadline = Date.now() + KILL_WAIT_MS;
  while (!firstExited && Date.now() < killDeadline) {
    await sleep(250);
  }
  if (!firstExited) {
    log(`${tag}: first Electron still alive after 10s; retrying child.kill() on the same runner-owned handle`);
    try {
      first.kill();
    } catch {
      /* ignore */
    }
    await sleep(3000);
  }
  if (!firstExited) {
    console.error(`[runner] ${tag} FAIL: runner-owned Electron did not exit after kill (no taskkill fallback by design; harness failure, no pass)`);
    throw Object.assign(new Error('runner-owned Electron did not exit'), { code: 2 });
  }
  await firstExit;
  await sleep(2000);
  // Post-kill survivor proof BEFORE recovery. If the sidecar did not survive
  // main death on this host, the experiment is inconclusive, never a pass.
  try {
    const cur = await queryIdentityOnce(trustedChild.pid);
    if (cur === null || cur.creationTime !== trustedChild.creationTime) {
      console.error(`[runner] ${tag} INCONCLUSIVE: exact sidecar pid=${trustedChild.pid} is gone after main death (sidecar did not survive on this host; inconclusive, not pass)`);
      throw Object.assign(new Error('sidecar did not survive main death (inconclusive, not pass)'), { code: 2 });
    }
    log(`${tag}: post-kill survivor proof: exact sidecar pid=${cur.pid} created=${cur.creationTime} name=${cur.name} parentPid=${cur.parentPid} still alive AFTER main death and BEFORE recovery`);
  } catch (err) {
    if (err.code === 1 || err.code === 2) throw err;
    console.error(`[runner] ${tag} FAIL: post-kill survivor lookup failed: ${err.message} (no pass)`);
    throw Object.assign(err, { code: 2 });
  }
  if (Date.now() - scenarioStartedAt >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error(`[runner] ${tag} INCONCLUSIVE: post-kill observation already outside the fixture safety bound (no pass)`);
    throw Object.assign(new Error('post-kill observation outside safety bound'), { code: 2 });
  }
  return { registry, trustedChild, scenarioStartedAt, suiteStartedAt };
}

function launchRecovery(tag, registryPath) {
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  const env2 = { ...process.env, TIYE_CRASH_SURVIVOR_REGISTRY_PATH: registryPath };
  delete env2.ELECTRON_RUN_AS_NODE;
  delete env2.TIYE_MOCK_CRASH_MODE;
  const second = spawn(electron, [distMain, '--crash-survivor-recovery-check'], {
    cwd: path.resolve(__dirname, '..'),
    env: env2,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let secondOutput = '';
  second.stdout?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild(`${tag}-recovery`, d);
  });
  second.stderr?.on('data', (d) => {
    secondOutput += d.toString('utf8');
    logChild(`${tag}-recovery`, d);
  });
  const secondExit = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        second.kill();
      } catch {
        /* runner-owned handle only */
      }
      reject(Object.assign(new Error(`recovery-check timeout after ${RECOVERY_TIMEOUT_MS}ms (harness failure, no pass)`), { code: 2 }));
    }, RECOVERY_TIMEOUT_MS);
    second.on('error', (err) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`recovery-check launch failed: ${err.message}`), { code: 2 }));
    });
    second.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? 2, signal });
    });
  });
  return { secondExitPromise: secondExit, getOutput: () => secondOutput };
}

async function scenarioPositive(suiteStartedAt, runDir) {
  const tag = 'positive';
  const registryPath = path.join(runDir, 'positive', 'registry.json');
  const ctx = await startKillAndProveSurvivor(tag, registryPath, suiteStartedAt);
  log(`${tag}: phase 3: relaunch NEW Electron --crash-survivor-recovery-check (read-only until verified cleanup; no duplicate, no PID kill)`);
  const { secondExitPromise, getOutput } = launchRecovery(tag, registryPath);
  let secondExit;
  try {
    secondExit = await secondExitPromise;
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: ${err.message}`);
    throw err.code === 1 ? err : Object.assign(err, { code: 2 });
  }
  const secondOutput = getOutput();
  const observationElapsedMs = Date.now() - ctx.scenarioStartedAt;
  const hasCleaned = CLEANED_RE.test(secondOutput);
  const hasPaused = PAUSED_RE.test(secondOutput);
  const hasNoDup = NO_DUP_RE.test(secondOutput);
  const hasHelper = HELPER_INVOKED_RE.test(secondOutput);
  const hasStopped = STOPPED_RE.test(secondOutput);
  const hasAlert = ALERT_RE.test(secondOutput);
  log(`${tag}: recovery observation elapsed=${observationElapsedMs}ms since sidecar spawn (safety bound <${MAX_RECOVERY_OBSERVATION_MS}ms)`);
  log(`${tag}: immediate recovery outcome: exit=${secondExit.code}${secondExit.signal ? ` signal=${secondExit.signal}` : ''} CLEANED=${hasCleaned} PAUSED=${hasPaused} no-dup=${hasNoDup} helper=${hasHelper} STOPPED=${hasStopped} ALERT=${hasAlert}`);
  if (secondExit.code === 2 || observationElapsedMs >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error(`[runner] ${tag} FAIL: recovery harness failure or observation outside the fixture safety bound (fixture self-expiry is safety-only and never a pass; no cleanup claimed)`);
    throw Object.assign(new Error('positive recovery harness failure / bound exceeded'), { code: 2 });
  }
  if (!(secondExit.code === 0 && hasCleaned && hasPaused && hasNoDup && hasHelper && hasStopped && !hasAlert)) {
    // Positive recovery must CLEAN; anything else is a failure. An ALERT
    // here after a proven post-kill survivor is a safety-relevant FAIL
    // (exit 1), not a harness flake, unless the output shows a harness FAIL.
    const harnessHint = /FAIL:/.test(secondOutput) && !hasCleaned;
    if (secondExit.code === 1 && hasAlert && harnessHint) {
      console.error(`[runner] ${tag} FAIL: recovery paused with ALERT despite a proven live survivor (treating as harness failure; output tail: ${secondOutput.slice(-400)})`);
      throw Object.assign(new Error('positive recovery unexpected ALERT'), { code: 2 });
    }
    console.error(`[runner] ${tag} FAIL: positive recovery did not CLEAN as contracted (want exit 0 + CLEANED + PAUSED/no-duplicate + helper STOPPED, no ALERT; no pass)`);
    throw Object.assign(new Error('positive recovery did not CLEAN'), { code: 1 });
  }
  log(`${tag}: recovery CLEANED with helper STOPPED and PAUSED/no-duplicate as contracted`);
  // Independent runner proof that the EXACT identity is gone well before 60s.
  const wait = await waitForIdentityGone(ctx.trustedChild, GONE_BOUND_MS, GONE_POLL_MS);
  const elapsedSinceSpawn = Date.now() - ctx.scenarioStartedAt;
  if (!wait.gone) {
    console.error(`[runner] ${tag} FAIL: exact sidecar pid=${ctx.trustedChild.pid} survived the verified cleanup (attempts=${wait.attempts}; safety violation -- helper claimed STOPPED but the identity remains; no fallback kill; no pass)`);
    throw Object.assign(new Error('positive survivor remains after CLEANED'), { code: 1 });
  }
  log(`${tag}: exact identity gone (attempts=${wait.attempts}, ${elapsedSinceSpawn}ms since sidecar spawn, fixture bound is 60000ms)`);
  if (elapsedSinceSpawn >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error(`[runner] ${tag} INCONCLUSIVE: exact gone but ${elapsedSinceSpawn}ms after spawn is too close to the 60s self-expiry to attribute to the helper (no pass claimed)`);
    throw Object.assign(new Error('positive observation near expiry'), { code: 2 });
  }
  log(`${tag}: PASS: sidecar survived main death, recovery CLEANED it via the verified helper, and the exact identity is gone well before 60s with no duplicate spawn.`);
  return ctx;
}

async function scenarioTampered(suiteStartedAt, runDir) {
  const tag = 'tampered';
  const registryPath = path.join(runDir, 'tampered', 'registry.json');
  const ctx = await startKillAndProveSurvivor(tag, registryPath, suiteStartedAt);
  const originalChild = { ...ctx.trustedChild };
  const originalMain = { pid: ctx.registry.mainPid, creationTime: ctx.registry.mainCreationTime };
  // Change ONLY the saved creation time by +1h; retain the original trusted
  // identity separately in the runner (never re-read from the tampered file).
  const tamperedISO = wrongCreationISO(originalChild.creationTime);
  const raw = fs.readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  parsed.childCreationTime = tamperedISO;
  fs.writeFileSync(registryPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  log(`${tag}: tampered registry: changed ONLY saved childCreationTime ${originalChild.creationTime} -> ${tamperedISO} (+1h); original trusted identity retained separately (pid=${originalChild.pid} created=${originalChild.creationTime})`);
  const reRead = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (reRead.childCreationTime !== tamperedISO) throw Object.assign(new Error('tamper write did not persist'), { code: 2 });
  if (reRead.childPid !== originalChild.pid || reRead.mainPid !== originalMain.pid || reRead.childName !== originalChild.name) {
    throw Object.assign(new Error('tamper changed more than childCreationTime'), { code: 2 });
  }
  log(`${tag}: phase 3: relaunch NEW Electron --crash-survivor-recovery-check against the TAMPERED registry (expect ALERT/PAUSED, no helper, no duplicate)`);
  const { secondExitPromise, getOutput } = launchRecovery(tag, registryPath);
  let secondExit;
  try {
    secondExit = await secondExitPromise;
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: ${err.message}`);
    throw err.code === 1 ? err : Object.assign(err, { code: 2 });
  }
  const secondOutput = getOutput();
  const observationElapsedMs = Date.now() - ctx.scenarioStartedAt;
  const hasAlert = ALERT_RE.test(secondOutput);
  const hasPaused = PAUSED_RE.test(secondOutput);
  const hasNoDup = NO_DUP_RE.test(secondOutput);
  const hasHelper = HELPER_INVOKED_RE.test(secondOutput);
  const hasStopped = STOPPED_RE.test(secondOutput);
  const hasCleaned = CLEANED_RE.test(secondOutput);
  log(`${tag}: recovery observation elapsed=${observationElapsedMs}ms since sidecar spawn (safety bound <${MAX_RECOVERY_OBSERVATION_MS}ms)`);
  log(`${tag}: tampered recovery outcome: exit=${secondExit.code}${secondExit.signal ? ` signal=${secondExit.signal}` : ''} ALERT=${hasAlert} PAUSED=${hasPaused} no-dup=${hasNoDup} helper-invoked=${hasHelper} STOPPED=${hasStopped} CLEANED=${hasCleaned}`);
  if (secondExit.code === 2 || observationElapsedMs >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error(`[runner] ${tag} FAIL: tampered recovery harness failure or observation outside the fixture safety bound (no pass)`);
    throw Object.assign(new Error('tampered recovery harness failure / bound exceeded'), { code: 2 });
  }
  if (hasHelper || hasStopped || hasCleaned) {
    console.error(`[runner] ${tag} FAIL: SAFETY VIOLATION -- tampered recovery invoked the stop helper or reported CLEANED despite a wrong saved creation time (helper must NEVER run on mismatch; no pass)`);
    throw Object.assign(new Error('tampered recovery invoked helper (safety violation)'), { code: 1 });
  }
  if (!(secondExit.code === 1 && hasAlert && hasPaused && hasNoDup)) {
    console.error(`[runner] ${tag} FAIL: tampered recovery did not fail closed as contracted (want exit 1 + ALERT + PAUSED/no-duplicate, no helper; no pass)`);
    // Ambiguous outcome without helper invocation leans harness, but a
    // missing ALERT/PAUSED after tampering is a safety-relevant FAIL.
    throw Object.assign(new Error('tampered recovery did not ALERT/PAUSE'), { code: 1 });
  }
  log(`${tag}: recovery correctly ALERTED/PAUSED with no helper invocation and no duplicate spawn`);
  // Original exact sidecar must remain alive (helper never ran).
  const stillAlive = await isExactAlive(originalChild).catch((err) => {
    console.error(`[runner] ${tag} FAIL: post-ALERT liveness lookup failed: ${err.message} (no pass)`);
    throw Object.assign(err, { code: 2 });
  });
  if (!stillAlive) {
    // No helper ran, so disappearance cannot be a verified cleanup. Treat as
    // harness failure (likely bound/lookup race), never a safety pass.
    console.error(`[runner] ${tag} INCONCLUSIVE: original exact sidecar pid=${originalChild.pid} is gone after the refused tampered recovery (no helper ran, so this is not a verified cleanup; fixture bound or race -- no pass)`);
    throw Object.assign(new Error('original gone after refused recovery (inconclusive)'), { code: 2 });
  }
  log(`${tag}: original exact sidecar pid=${originalChild.pid} created=${originalChild.creationTime} remains alive after the refused recovery (untouched as required)`);
  // Test-only teardown with the ORIGINAL trusted identity (separate from
  // recovery): proves the survivor CAN be stopped once the true identity is
  // supplied. Reported separately; never a PID kill.
  const helperPs1 = path.resolve(__dirname, 'verified-identity-stop.ps1');
  if (!fs.existsSync(helperPs1)) {
    console.error(`[runner] ${tag} FAIL: verified-identity-stop.ps1 missing for teardown (no pass)`);
    throw Object.assign(new Error('teardown helper missing'), { code: 2 });
  }
  log(`${tag}: teardown (test-only, SEPARATE from recovery): invoking verified-identity-stop.ps1 with the ORIGINAL trusted identity pid=${originalChild.pid}`);
  let teardown;
  try {
    teardown = await runVerifiedStop(helperPs1, originalChild.pid, originalChild.creationTime);
  } catch (err) {
    console.error(`[runner] ${tag} FAIL: teardown helper failed to run: ${err.message} (no pass)`);
    throw Object.assign(err, { code: 2 });
  }
  log(`${tag}: teardown helper exited code=${teardown.code}`);
  if (teardown.code !== 0 || !/\[verified-stop\] STOPPED/.test(teardown.output)) {
    console.error(`[runner] ${tag} FAIL: teardown with the original identity did not STOP as contracted (want exit 0 + STOPPED; no pass)`);
    throw Object.assign(new Error('teardown did not STOP'), { code: 2 });
  }
  log(`${tag}: teardown helper STOPPED as contracted (same-handle check + TerminateProcess)`);
  const wait = await waitForIdentityGone(originalChild, GONE_BOUND_MS, GONE_POLL_MS);
  const elapsedSinceSpawn = Date.now() - ctx.scenarioStartedAt;
  if (!wait.gone) {
    console.error(`[runner] ${tag} FAIL: original exact identity survived the teardown helper (attempts=${wait.attempts}; no pass)`);
    throw Object.assign(new Error('teardown survivor remains'), { code: 2 });
  }
  log(`${tag}: teardown proof: original exact identity gone (attempts=${wait.attempts}, ${elapsedSinceSpawn}ms since sidecar spawn, fixture bound is 60000ms)`);
  if (elapsedSinceSpawn >= MAX_RECOVERY_OBSERVATION_MS) {
    console.error(`[runner] ${tag} INCONCLUSIVE: teardown gone but ${elapsedSinceSpawn}ms after spawn is too close to the 60s self-expiry to attribute to the helper (no pass claimed)`);
    throw Object.assign(new Error('teardown observation near expiry'), { code: 2 });
  }
  log(`${tag}: PASS: wrong creation refused with the survivor untouched (no helper, no duplicate), then test-only teardown with the original identity proved exact-gone separately from recovery.`);
  return ctx;
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`[runner] SKIP: crash-survivor probe is Windows-only (platform=${process.platform}; no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  const suiteStartedAt = Date.now();
  const runDir = path.join(os.tmpdir(), `tiye-crash-survivor-${Date.now()}-${process.pid}`);
  fs.mkdirSync(runDir, { recursive: true });
  log(`suite run dir: ${runDir} (two fresh sidecars: positive + tampered; each 60s self-expire)`);
  try {
    await scenarioPositive(suiteStartedAt, runDir);
  } catch (err) {
    if (err && (err.code === 1 || err.code === 2)) {
      if (err.code === 1) console.error(`[runner] CRASH-SURVIVOR FAIL (positive scenario safety violation): ${err.message}; S1 9f stays open`);
      else console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE (positive scenario harness failure): ${err.message}; no pass claimed`);
      process.exitCode = err.code;
      return;
    }
    console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE (positive scenario): ${err && err.message ? err.message : err}; no pass claimed`);
    process.exitCode = 2;
    return;
  }
  // Suite bound check between scenarios: a slow positive must not push the
  // tampered sidecar observation near its own expiry either, and the overall
  // suite must stay well inside 60s for a pass.
  if (Date.now() - suiteStartedAt >= MAX_SUITE_MS) {
    console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE: suite already ${Date.now() - suiteStartedAt}ms old before the tampered scenario (near 60s; no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  try {
    await scenarioTampered(suiteStartedAt, runDir);
  } catch (err) {
    if (err && (err.code === 1 || err.code === 2)) {
      if (err.code === 1) console.error(`[runner] CRASH-SURVIVOR FAIL (tampered scenario safety violation): ${err.message}; S1 9f stays open`);
      else console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE (tampered scenario harness failure): ${err.message}; no pass claimed`);
      process.exitCode = err.code;
      return;
    }
    console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE (tampered scenario): ${err && err.message ? err.message : err}; no pass claimed`);
    process.exitCode = 2;
    return;
  }
  const suiteElapsed = Date.now() - suiteStartedAt;
  if (suiteElapsed >= MAX_SUITE_MS) {
    console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE: suite finished but ${suiteElapsed}ms total is too close to the 60s fixture bound to claim a pass (no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  log(`CRASH-SURVIVOR PASS: positive CLEANED via the verified helper with no duplicate, tampered creation ALERTED/PAUSED with no helper and the survivor untouched until separate test-only teardown; suite ${suiteElapsed}ms (well inside 60s); no PID kill used at any point.`);
  log('Scope: controlled Windows mock-sidecar feasibility only (direct Electron child, no PTY/job). Registry schema checks do NOT establish file authenticity against same-user tampering -- the tampered scenario proves fail-closed refusal, not production trust. No HMAC, no vendor CLI, no full 9f pass. S1 9f stays open.');
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(`[runner] CRASH-SURVIVOR INCONCLUSIVE: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

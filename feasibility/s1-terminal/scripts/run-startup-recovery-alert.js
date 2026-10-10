'use strict';
// Ordinary-startup recovery gate: visible paused alert with a bounded
// read-only current-process observation, never cleanup/spawn/mutation.
// Covers invalid + absent registries plus controlled live exact and tampered
// creation/name mismatches using the existing mock-child fixture. Verifies
// no helper/recovery/PTY invocation and that the live process remains alive;
// teardown uses only the verified-identity helper with the trusted identity
// (never a raw PID kill). Mock feasibility only.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const TIMEOUT_MS = 45000;
const CIM_TIMEOUT_MS = 20000;
const HELPER_TIMEOUT_MS = 15000;
const GONE_BOUND_MS = 10000;
const GONE_POLL_MS = 250;
const CAPTURE_TIMEOUT_MS = 10000;
const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');

function logChild(label, chunk) {
  for (const line of chunk.toString('utf8').split(/\r?\n/)) {
    if (line) console.log(`[${label}] ${line}`);
  }
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureLiveIdentity(pid) {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  for (;;) {
    const cur = await queryIdentityOnce(pid);
    if (cur !== null) return cur;
    if (Date.now() >= deadline) throw new Error(`controlled PID ${pid} absent in CIM after ${CAPTURE_TIMEOUT_MS}ms`);
    await sleep(500);
  }
}

async function findAbsentPid() {
  for (const candidate of [999999, 1999999, 2999999, 4000000]) {
    const cur = await queryIdentityOnce(candidate).catch(() => 'lookup-failed');
    if (cur === null) return candidate;
    if (cur === 'lookup-failed') throw new Error('CIM lookup failed while searching for an absent PID (no pass)');
  }
  throw new Error('no absent high PID found (no pass)');
}

function buildRegistry({ sessionId, childPid, childCreationTime, childName, childParentPid }) {
  const createdAt = new Date().toISOString();
  return {
    schema: 'tiye-crash-pty-survivor-registry', version: 1,
    sessionId, memberId: 'crash-pty-survivor-member',
    mainPid: process.pid, rootPid: process.pid, rootCreationTime: createdAt, rootName: 'node.exe',
    childPid, childCreationTime, childName,
    childParentPid, lastIntent: 'run', createdAt,
  };
}

function wrongCreationISO(correctISO) {
  const t = new Date(correctISO).getTime();
  if (!Number.isFinite(t)) throw new Error(`cannot parse correct creation time '${correctISO}'`);
  return new Date(t + 3600000).toISOString();
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

async function waitForIdentityGone(trusted, boundMs, pollMs) {
  const deadline = Date.now() + boundMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    const cur = await queryIdentityOnce(trusted.pid);
    if (cur === null || cur.creationTime !== trusted.creationTime) return { gone: true, attempts };
    if (Date.now() >= deadline) return { gone: false, attempts };
    await sleep(pollMs);
  }
}

async function runCase(label, registryContents, { registryLine, observationLine, expectedStatus }) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-startup-recovery-alert-'));
  const registryPath = path.join(runDir, 'registry.json');
  fs.writeFileSync(registryPath, registryContents, 'utf8');
  let output = '';
  try {
    const env = { ...process.env, TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH: registryPath };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [distMain, '--startup-recovery-alert-smoke'], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        output += chunk.toString('utf8');
        logChild(label, chunk);
      });
    }
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          child.kill(); // runner-owned Electron handle only
        } catch {
          /* the timeout is still a harness failure */
        }
        reject(Object.assign(new Error(`${label}: Electron timed out`), { code: 2 }));
      }, TIMEOUT_MS);
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(Object.assign(err, { code: 2 }));
      });
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 2);
      });
    });
    if (code === 2 || /\[startup-recovery-alert-smoke\] INCONCLUSIVE/.test(output)) {
      throw Object.assign(new Error(`${label}: UI could not be verified`), { code: 2 });
    }
    const required = [
      /\[startup-recovery\] ALERT/,
      /\[startup-recovery\] NO-MEMBER no-pty-spawn no-duplicate-launch spawnCount=0/,
      /\[startup-recovery\] NO-HELPER/,
      /\[startup-recovery-alert-smoke\] VISIBLE isVisible=true/,
      /\[startup-recovery-alert-smoke\] PASS/,
      registryLine,
      observationLine,
      new RegExp(`\\[startup-recovery-alert-smoke\\] STATUS status=${expectedStatus}\\b`),
      new RegExp(`domStatus=${expectedStatus}\\b`),
      /statusText=true/,
    ];
    const forbidden = [
      /\[crash-pty-survivor-recovery\]/,
      /HELPER-INVOKED|\[verified-stop\]/,
      /\[s1\] spawning/,
      /tree-detached ready/i,
    ];
    if (code !== 0 || required.some((re) => !re.test(output)) || forbidden.some((re) => re.test(output))) {
      throw Object.assign(new Error(`${label}: alert/no-member/no-helper/status contract failed (exit=${code})`), { code: 1 });
    }
    console.log(`[runner] ${label}: PASS visible paused alert status=${expectedStatus}, no member, no recovery/helper call`);
  } finally {
    try {
      fs.unlinkSync(registryPath);
    } catch {
      /* already gone */
    }
    try {
      fs.rmdirSync(runDir);
    } catch {
      /* already gone */
    }
  }
}

async function assertExactAlive(tag, trusted, spawnStartedAt) {
  let cur;
  try {
    cur = await queryIdentityOnce(trusted.pid);
  } catch (err) {
    throw Object.assign(new Error(`${tag}: liveness lookup failed: ${err.message} (no pass)`), { code: 2 });
  }
  if (cur === null || cur.creationTime !== trusted.creationTime) {
    const elapsed = Date.now() - spawnStartedAt;
    if (elapsed >= 50000) {
      throw Object.assign(new Error(`${tag}: controlled pid=${trusted.pid} gone ${elapsed}ms after spawn, near the 60s fixture bound (inconclusive, not pass)`), { code: 2 });
    }
    throw Object.assign(new Error(`${tag}: SAFETY VIOLATION -- controlled pid=${trusted.pid} is gone after the read-only gate (gate must never stop a process; no pass)`), { code: 1 });
  }
  console.log(`[runner] ${tag}: controlled pid=${cur.pid} still alive after the read-only gate (untouched as required)`);
}

async function main() {
  if (process.platform !== 'win32') {
    throw Object.assign(new Error(`Windows-only smoke (platform=${process.platform})`), { code: 2 });
  }
  if (!fs.existsSync(distMain)) {
    throw Object.assign(new Error('dist/main.js missing; run npm run build first'), { code: 2 });
  }
  await runCase('malformed', 'INVALID-REGISTRY\n', {
    registryLine: /\[startup-recovery\] ALERT malformed-or-missing registry/,
    observationLine: /\[startup-recovery\] OBSERVATION status=invalid/,
    expectedStatus: 'invalid',
  });
  const absentPid = await findAbsentPid();
  const createdAt = '2000-01-01T00:00:00.000Z';
  const absentRegistry = buildRegistry({
    sessionId: 'startup-alert-absent', childPid: absentPid,
    childCreationTime: createdAt, childName: 'node.exe', childParentPid: process.pid,
  });
  await runCase('absent', JSON.stringify(absentRegistry), {
    registryLine: /\[startup-recovery\] PENDING valid-looking registry/,
    observationLine: /\[startup-recovery\] OBSERVATION status=absent/,
    expectedStatus: 'absent',
  });

  // Controlled live process from the existing mock-child fixture (60s
  // self-expiry bounds any orphan). One runner-owned child serves the exact
  // + creation-mismatch + name-mismatch cases; teardown uses only the
  // verified-identity helper with the trusted identity (never a raw PID kill).
  const mockChild = path.resolve(__dirname, '..', 'mock-cli', 'mock-child.js');
  if (!fs.existsSync(mockChild)) {
    throw Object.assign(new Error(`mock-child fixture missing: ${mockChild}`), { code: 2 });
  }
  const liveChild = spawn(process.execPath, [mockChild], {
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  const spawnStartedAt = Date.now();
  if (liveChild.pid === undefined) {
    throw Object.assign(new Error('controlled mock-child has no OS PID'), { code: 2 });
  }
  liveChild.on('error', (err) => {
    console.error(`[runner] controlled mock-child spawn error: ${err.message}`);
  });
  let trusted;
  try {
    const live = await captureLiveIdentity(liveChild.pid);
    if (live.name.toLowerCase() !== 'node.exe') {
      throw Object.assign(new Error(`controlled child name=${live.name} != node.exe (no pass)`), { code: 2 });
    }
    trusted = { pid: live.pid, creationTime: live.creationTime, name: live.name, parentPid: live.parentPid };
    console.log(`[runner] controlled live child: pid=${trusted.pid} created=${trusted.creationTime} name=${trusted.name} parentPid=${trusted.parentPid} (runner-owned mock-child fixture, 60s self-expiry)`);

    const exactRegistry = buildRegistry({
      sessionId: 'startup-alert-exact', childPid: trusted.pid,
      childCreationTime: trusted.creationTime, childName: trusted.name, childParentPid: trusted.parentPid,
    });
    await runCase('exact', JSON.stringify(exactRegistry), {
      registryLine: /\[startup-recovery\] PENDING valid-looking registry/,
      observationLine: /\[startup-recovery\] OBSERVATION status=exact/,
      expectedStatus: 'exact',
    });
    await assertExactAlive('exact', trusted, spawnStartedAt);

    const tamperedCreationRegistry = buildRegistry({
      sessionId: 'startup-alert-creation-mismatch', childPid: trusted.pid,
      childCreationTime: wrongCreationISO(trusted.creationTime), childName: trusted.name, childParentPid: trusted.parentPid,
    });
    await runCase('creation-mismatch', JSON.stringify(tamperedCreationRegistry), {
      registryLine: /\[startup-recovery\] PENDING valid-looking registry/,
      observationLine: /\[startup-recovery\] OBSERVATION status=mismatch reason=creation-mismatch/,
      expectedStatus: 'mismatch',
    });
    await assertExactAlive('creation-mismatch', trusted, spawnStartedAt);

    const tamperedNameRegistry = buildRegistry({
      sessionId: 'startup-alert-name-mismatch', childPid: trusted.pid,
      childCreationTime: trusted.creationTime, childName: 'tampered.exe', childParentPid: trusted.parentPid,
    });
    await runCase('name-mismatch', JSON.stringify(tamperedNameRegistry), {
      registryLine: /\[startup-recovery\] PENDING valid-looking registry/,
      observationLine: /\[startup-recovery\] OBSERVATION status=mismatch reason=name-mismatch/,
      expectedStatus: 'mismatch',
    });
    await assertExactAlive('name-mismatch', trusted, spawnStartedAt);
  } finally {
    // Test-only teardown with the TRUSTED identity only (never the tampered
    // file contents, never a raw PID kill): verified-identity helper on the
    // same handle, then exact-gone proof. Mock-child also self-expires.
    if (trusted !== undefined) {
      try {
        const cur = await queryIdentityOnce(trusted.pid);
        if (cur === null || cur.creationTime !== trusted.creationTime) {
          console.log(`[runner] teardown: exact identity pid=${trusted.pid} already gone; no helper invoked`);
        } else {
          const helperPs1 = path.resolve(__dirname, 'verified-identity-stop.ps1');
          if (!fs.existsSync(helperPs1)) {
            console.log('[runner] teardown: helper missing; asking the runner-owned child to exit itself via its stdin pipe (no PID kill; 60s self-expiry bounds the rest)');
            try {
              liveChild.stdin?.write('exit\n');
            } catch {
              /* pipe already gone */
            }
          } else {
            console.log(`[runner] teardown: invoking verified-identity-stop.ps1 with the TRUSTED identity pid=${trusted.pid} (test-only, separate from the gate)`);
            const res = await runVerifiedStop(helperPs1, trusted.pid, trusted.creationTime);
            if (res.code !== 0 || !/\[verified-stop\] STOPPED/.test(res.output)) {
              console.log(`[runner] teardown: helper did not STOP (exit=${res.code}); asking the runner-owned child to exit itself via its stdin pipe (no PID kill; 60s self-expiry bounds the rest)`);
              try {
                liveChild.stdin?.write('exit\n');
              } catch {
                /* pipe already gone */
              }
            } else {
              console.log('[runner] teardown: helper STOPPED with the trusted identity');
            }
          }
          const wait = await waitForIdentityGone(trusted, GONE_BOUND_MS, GONE_POLL_MS);
          console.log(`[runner] teardown: exact gone=${wait.gone} (attempts=${wait.attempts}); reported separately from the gate outcome`);
          if (!wait.gone) {
            console.log('[runner] teardown: survivor left to the 60s fixture self-expiry (no PID kill by design)');
          }
        }
      } catch (err) {
        console.log(`[runner] teardown lookup/helper issue: ${err && err.message ? err.message : err}; survivor left to the 60s fixture self-expiry (no PID kill)`);
      }
    }
    try {
      liveChild.stdin?.end();
    } catch {
      /* pipe already gone */
    }
    try {
      liveChild.stdin?.destroy();
    } catch {
      /* ignore */
    }
  }
  console.log('[runner] STARTUP-RECOVERY-ALERT PASS: invalid/absent/exact/creation-mismatch/name-mismatch each showed the visible paused per-state alert without a PTY, recovery call, or helper; live processes stayed alive until verified teardown.');
  console.log('[runner] Scope: mock feasibility only; the unauthenticated registry makes every observation informational only, and ordinary startup never cleans, resumes, or proves safe relaunch.');
}

main().catch((err) => {
  console.error(`[runner] STARTUP-RECOVERY-ALERT ${err.code === 1 ? 'FAIL' : 'INCONCLUSIVE'}: ${err.message}`);
  process.exitCode = err.code === 1 ? 1 : 2;
});

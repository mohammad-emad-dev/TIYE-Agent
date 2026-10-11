'use strict';
// Bounded real-CLI TUI startup/render probe: installed `opencode` with EMPTY
// args inside the existing Electron BrowserWindow renderer (hidden window is
// accepted: the renderer still runs; NO human visual comparison is performed).
// Proves exactly this and nothing more: the bare `opencode` name resolves to
// the installed shim, launches in the main-owned PTY via resolveLaunch /
// ensureMember, startup bytes reach the PTY, the renderer reports READY, and
// an xterm screenshot lands at dist/cli-tui-startup-shot.png (separate from
// the mock dist/smoke-shot.png). Sends NO stdin or prompt text, NO model request.
// Do NOT cite this as S1 steps 1-8, editing keys, approvals, unicode, resize,
// or lifecycle success.
//
// --input-probe mode (same file, distinct Electron flag --cli-input-smoke):
// bounded real-CLI input feasibility slice. Same fixed command + empty args,
// same scrubbed env, same teardown proof below (no copy of the enumeration
// code). Types a harmless ASCII token via the actual Electron keyboard/xterm
// path (sendInputEvent keyDown+char+keyUp per char, no Enter, never submitted,
// no model request) in a VISIBLE opt-in BrowserWindow (hidden windows cannot
// reliably receive keyboard focus on Windows; still the existing Electron
// renderer, NOT a new native terminal window), captures distinct before/after
// screenshots (dist/cli-input-before.png + dist/cli-input-after.png), and
// rejects an unchanged render. Automated PASS means keyboard event + changed
// render only, NOT semantic prompt acceptance (orchestrator visually inspects
// the after-shot). Do NOT cite as S1 step 3 (editing keys/history), visual
// parity, Unicode, approvals, or model behavior.
//
// --edit-probe mode (same file, distinct Electron flag --cli-edit-smoke):
// bounded real-CLI editing-keys feasibility slice. Same fixed command + empty
// args, same scrubbed env, same teardown proof below (no copy of the
// enumeration code). Captures dist/cli-edit-before.png pre-input, then types
// a fixed harmless ASCII initial token via sendInputEvent (no Enter, never
// submitted, no model request) plus bounded editing keys (Home, Right,
// Delete, End, Backspace, plus one ASCII replacement, never Enter/submit)
// via sendInputEvent in one focused sequence, and captures
// dist/cli-edit-after.png, rejecting an unchanged render. Automated PASS
// means keyboard events delivered + changed render + teardown only, NOT
// semantic editing correctness (orchestrator visually inspects both shots
// against the logged EDIT-PLAN expectation). Do NOT cite as command history
// or S1 step 3 complete.
//
// Determinism: the runner OVERWRITES TIYE_S1_COMMAND=opencode and
// TIYE_S1_ARGS_JSON=[] and DELETES inherited TIYE_S1_CWD plus every
// crash/crash-survivor registry env and TIYE_MOCK_CRASH_MODE so an outer
// shell cannot change behavior or trigger the startup recovery gate.
// The Electron side refuses any non-empty args without spawn.
//
// Teardown: after the screenshot the Electron side stays alive (no
// term.kill() by design: node-pty on Windows has a documented teardown race
// after term.kill / app exit with a live PTY). The runner ends ONLY its
// runner-owned Electron ChildProcess via the handle, then read-only verifies
// the exact captured PID+creation tree is gone. If teardown cannot be proven
// the runner exits inconclusive (2), never PASS. Never taskkill /
// Stop-Process / PID-only kill; never a captured member PID; unrelated
// processes are never touched. Existing mock smoke behavior is untouched.
//
// Exit contract: 0 TUI-STARTUP PASS (or CLI-INPUT PASS in --input-probe mode,
// or CLI-EDIT PASS in --edit-probe mode),
// 1 FAIL (wrong resolution, missing startup marker, empty screenshot, or — in
// input/edit mode — unchanged before/after render; no pass), 2 inconclusive/harness
// failure (missing dist, launch/timeout/lookup failure, pre-kill tree not
// alive, or teardown unproven — never a pass).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const electron = require('electron');

const IS_EDIT_PROBE = process.argv.includes('--edit-probe');
const IS_INPUT_PROBE = process.argv.includes('--input-probe') && !IS_EDIT_PROBE;
const FLAG = IS_EDIT_PROBE ? '--cli-edit-smoke' : IS_INPUT_PROBE ? '--cli-input-smoke' : '--cli-tui-startup-smoke';
const SMOKE_TAG = IS_EDIT_PROBE ? 'cli-edit-smoke' : IS_INPUT_PROBE ? 'cli-input-smoke' : 'cli-tui-startup-smoke';
const READY_TIMEOUT_MS = 60000;
const KILL_WAIT_MS = 10000;
const POST_KILL_SETTLE_MS = 2000;
const POST_KILL_VERIFY_BOUND_MS = 15000;
const POST_KILL_POLL_MS = 500;

const READY_RE = IS_EDIT_PROBE
  ? /\[cli-edit-smoke\] READY session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+)/
  : IS_INPUT_PROBE
    ? /\[cli-input-smoke\] READY session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+)/
    : /\[cli-tui-startup-smoke\] READY session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+)/;
const IDENTITY_RE = IS_EDIT_PROBE
  ? /\[cli-edit-smoke\] IDENTITY pid=(\d+) created=(\S+) name=(\S+) parentPid=(\d+)/g
  : IS_INPUT_PROBE
    ? /\[cli-input-smoke\] IDENTITY pid=(\d+) created=(\S+) name=(\S+) parentPid=(\d+)/g
    : /\[cli-tui-startup-smoke\] IDENTITY pid=(\d+) created=(\S+) name=(\S+) parentPid=(\d+)/g;

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

// Read-only CIM enumeration (same contract as src/process-tree-9e.ts).
// Never terminates anything; the only kill() in this file targets
// runner-owned Electron handles or this helper's own short-lived
// powershell enumeration on timeout — never a member PID.
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

function parseIdentities(output) {
  const out = [];
  const seen = new Set();
  let m;
  IDENTITY_RE.lastIndex = 0;
  while ((m = IDENTITY_RE.exec(output)) !== null) {
    const key = `${m[1]}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pid: Number(m[1]), creationTime: m[2], name: m[3], parentPid: Number(m[4]) });
  }
  return out;
}

async function main() {
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[runner] FAIL: dist/main.js missing (run npm run build first; harness failure, no pass)');
    process.exitCode = 2;
    return;
  }
  const shotPath = IS_EDIT_PROBE
    ? path.resolve(__dirname, '..', 'dist', 'cli-edit-after.png')
    : IS_INPUT_PROBE
      ? path.resolve(__dirname, '..', 'dist', 'cli-input-after.png')
      : path.resolve(__dirname, '..', 'dist', 'cli-tui-startup-shot.png');
  const beforeShotPath = IS_EDIT_PROBE
    ? path.resolve(__dirname, '..', 'dist', 'cli-edit-before.png')
    : path.resolve(__dirname, '..', 'dist', 'cli-input-before.png');
  const afterShotPath = IS_EDIT_PROBE
    ? path.resolve(__dirname, '..', 'dist', 'cli-edit-after.png')
    : path.resolve(__dirname, '..', 'dist', 'cli-input-after.png');

  // Deterministic probe env: fixed command + empty args, scrubbed S1
  // overrides so inherited values cannot change behavior.
  const env = {
    ...process.env,
    TIYE_S1_COMMAND: 'opencode',
    TIYE_S1_ARGS_JSON: '[]',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TIYE_S1_CWD;
  delete env.TIYE_CRASH_REGISTRY_PATH;
  delete env.TIYE_CRASH_JOB_REGISTRY_PATH;
  delete env.TIYE_CRASH_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_MOCK_CRASH_MODE;
  log('env: TIYE_S1_COMMAND=opencode TIYE_S1_ARGS_JSON=[] (fixed; no stdin, no prompt, no model request)');
  log('env: scrubbed TIYE_S1_CWD + TIYE_CRASH_* registry paths + TIYE_MOCK_CRASH_MODE (inherited values cannot change behavior or trigger the recovery gate)');

  log(`phase 1: spawn runner-owned Electron ${FLAG} ${IS_EDIT_PROBE ? 'visible-window (opt-in keyboard editing)' : IS_INPUT_PROBE ? 'visible-window (opt-in keyboard delivery)' : 'hidden-window'} (real installed CLI via resolveLaunch/ensureMember, ConPTY + renderer)`);
  const child = spawn(electron, [distMain, FLAG], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let ready = null;
  const childTag = IS_EDIT_PROBE ? 'cli-edit-main' : IS_INPUT_PROBE ? 'cli-input-main' : 'tui-startup-main';
  child.stdout?.on('data', (d) => {
    output += d.toString('utf8');
    logChild(childTag, d);
    const m = output.match(READY_RE);
    if (m && !ready) ready = m;
  });
  child.stderr?.on('data', (d) => {
    output += d.toString('utf8');
    logChild(childTag, d);
    const m = output.match(READY_RE);
    if (m && !ready) ready = m;
  });

  const exitPromise = new Promise((resolve) => {
    child.on('error', (err) => resolve({ code: 2, signal: null, error: err.message, early: true }));
    child.on('exit', (code, signal) => resolve({ code: code ?? 2, signal, early: !ready }));
  });
  const readyDeadline = Date.now() + READY_TIMEOUT_MS;
  while (!ready && Date.now() < readyDeadline) {
    const st = await Promise.race([exitPromise.then((e) => ({ exited: true, e })), sleep(250).then(() => ({ exited: false }))]);
    if (st.exited) {
      console.error(`[runner] FAIL: Electron exited before READY (code=${st.e.code} signal=${st.e.signal}; no pass)`);
      process.exitCode = st.e.code === 1 ? 1 : 2;
      return;
    }
  }
  if (!ready) {
    console.error(`[runner] INCONCLUSIVE: READY timeout after ${READY_TIMEOUT_MS}ms (harness failure, no pass)`);
    try {
      child.kill();
    } catch {
      /* runner-owned handle only */
    }
    await sleep(1000);
    process.exitCode = 2;
    return;
  }

  const [, sessionId, memberId, rootPidStr, treeSizeStr] = ready;
  log(`READY observed: session=${sessionId} member=${memberId} rootPid=${rootPidStr} treeSize=${treeSizeStr}`);

  const spawningLine = output.split(/\r?\n/).find((l) => /\[s1\] spawning:/i.test(l)) ?? '';
  const tagEsc = SMOKE_TAG.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const resolvedLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] resolved command=`, 'i').test(l)) ?? '';
  const markersLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] MARKERS `, 'i').test(l)) ?? '';
  const versionLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] VERSION \\d+\\.\\d+\\.\\d+`, 'i').test(l)) ?? '';
  const shotLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] ok: screenshot `, 'i').test(l)) ?? '';
  const resolvedOpencode = /opencode/i.test(spawningLine) || /opencode/i.test(resolvedLine);
  const resolvedCmdShim = process.platform === 'win32'
    ? /\.cmd\b/i.test(spawningLine)
    : resolvedOpencode;
  const rendererReady = new RegExp(`\\[${tagEsc}\\] ok: renderer READY`, 'i').test(output);
  const ptyData = new RegExp(`\\[${tagEsc}\\] ok: real CLI PTY data observed`, 'i').test(output);
  const markersOk = new RegExp(`\\[${tagEsc}\\] MARKERS .*opencode=true`, 'i').test(output);
  const versionOk = new RegExp(`\\[${tagEsc}\\] VERSION \\d+\\.\\d+\\.\\d+`, 'i').test(output);
  const inputTypedOk = IS_EDIT_PROBE
    ? /\[cli-edit-smoke\] ok: input typed len=\d+ via sendInputEvent/i.test(output)
    : IS_INPUT_PROBE
      ? /\[cli-input-smoke\] ok: input typed len=\d+ via sendInputEvent/i.test(output)
      : true;
  const editKeysOk = IS_EDIT_PROBE
    ? /\[cli-edit-smoke\] ok: edit keys .* via sendInputEvent/i.test(output)
    : true;
  const editPlanOk = IS_EDIT_PROBE
    ? /\[cli-edit-smoke\] EDIT-PLAN initial=\S+ expected=\S+ steps=Home,Right,Delete,End,Backspace/i.test(output)
    : true;
  const shotsLogOk = IS_EDIT_PROBE
    ? /\[cli-edit-smoke\] SHOTS before=.* changed=true/i.test(output)
    : IS_INPUT_PROBE
      ? /\[cli-input-smoke\] SHOTS before=.* changed=true/i.test(output)
      : true;
  log(`assert: spawning line: ${spawningLine.slice(0, 300)}`);
  log(`assert: resolved line: ${resolvedLine.slice(0, 300)}`);
  log(`assert: markers line: ${markersLine.slice(0, 200)}`);
  log(`assert: version line: ${versionLine.slice(0, 120)}`);
  log(`assert: shot line: ${shotLine.slice(0, 300)}`);
  log(`assert: mode=${IS_EDIT_PROBE ? 'edit-probe' : IS_INPUT_PROBE ? 'input-probe' : 'tui-startup'} resolvedOpencode=${resolvedOpencode} resolvedCmdShim=${resolvedCmdShim} rendererReady=${rendererReady} ptyData=${ptyData} markersOk=${markersOk} versionOk=${versionOk} inputTypedOk=${inputTypedOk} editKeysOk=${editKeysOk} editPlanOk=${editPlanOk} shotsLogOk=${shotsLogOk}`);

  const killOwned = async () => {
    try {
      child.kill();
    } catch {
      /* runner-owned handle only */
    }
  };

  if (spawningLine === '' || resolvedLine === '' || !resolvedOpencode) {
    console.error('[runner] FAIL: Electron did not resolve/launch the installed opencode executable (expected [s1] spawning + resolved lines with opencode; no pass)');
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (process.platform === 'win32' && !resolvedCmdShim) {
    console.error(`[runner] FAIL: expected Windows .cmd shim resolution (spawning line with opencode.cmd, got: ${spawningLine.slice(0, 200)}; no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (!rendererReady || !ptyData || !markersOk || !inputTypedOk || !editKeysOk || !editPlanOk || !shotsLogOk) {
    console.error(`[runner] FAIL: renderer READY + real CLI PTY data + markers${IS_EDIT_PROBE ? ' + keyboard input + editing keys + EDIT-PLAN + changed SHOTS' : IS_INPUT_PROBE ? ' + keyboard input + changed SHOTS' : ''} not all proven (no pass; not S1 steps 1-8)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (!versionOk) {
    log('note: bare semver not present in this startup window (dynamic TUI; best-effort marker only — installed-command proof is the resolved .cmd path + opencode marker, not this line)');
  }
  let shotBytes = 0;
  let beforeBytes = 0;
  let afterBytes = 0;
  let beforeHash = '';
  let afterHash = '';
  if (IS_INPUT_PROBE || IS_EDIT_PROBE) {
    try {
      beforeBytes = fs.statSync(beforeShotPath).size;
    } catch {
      console.error(`[runner] FAIL: before screenshot missing at ${beforeShotPath} (no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    try {
      afterBytes = fs.statSync(afterShotPath).size;
    } catch {
      console.error(`[runner] FAIL: after screenshot missing at ${afterShotPath} (no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    if (beforeBytes <= 0 || afterBytes <= 0) {
      console.error(`[runner] FAIL: before/after screenshot empty (before=${beforeBytes} after=${afterBytes}; rendering not proven; no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    try {
      beforeHash = crypto.createHash('sha256').update(fs.readFileSync(beforeShotPath)).digest('hex');
      afterHash = crypto.createHash('sha256').update(fs.readFileSync(afterShotPath)).digest('hex');
    } catch (err) {
      console.error(`[runner] FAIL: before/after screenshot hash failed: ${err.message} (no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    if (beforeHash === afterHash) {
      console.error(`[runner] FAIL: before/after screenshots identical sha256=${beforeHash} (no keyboard/render change proven; no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    shotBytes = afterBytes;
    if (IS_EDIT_PROBE) {
      log(`screenshots ok: before=${beforeShotPath} (${beforeBytes} bytes sha256=${beforeHash.slice(0, 16)}…) after=${afterShotPath} (${afterBytes} bytes sha256=${afterHash.slice(0, 16)}…) changed (visible opt-in editing window, keyboard events delivered + changed render only, NOT semantic editing correctness; orchestrator visual inspection only)`);
    } else {
      log(`screenshots ok: before=${beforeShotPath} (${beforeBytes} bytes sha256=${beforeHash.slice(0, 16)}…) after=${afterShotPath} (${afterBytes} bytes sha256=${afterHash.slice(0, 16)}…) changed (visible opt-in window, orchestrator visual inspection only)`);
    }
  } else {
    try {
      shotBytes = fs.statSync(shotPath).size;
    } catch {
      console.error(`[runner] FAIL: screenshot missing at ${shotPath} (no pass)`);
      await killOwned();
      process.exitCode = 1;
      return;
    }
    if (shotBytes <= 0) {
      console.error('[runner] FAIL: screenshot file empty (rendering not proven; no pass)');
      await killOwned();
      process.exitCode = 1;
      return;
    }
    log(`screenshot ok: ${shotPath} (${shotBytes} bytes; hidden window, no human visual comparison performed)`);
  }

  const captured = parseIdentities(output);
  if (captured.length < 1 || captured.length !== Number(treeSizeStr)) {
    console.error(`[runner] INCONCLUSIVE: captured tree parse failed (parsed=${captured.length} want=${treeSizeStr}; no pass)`);
    await killOwned();
    process.exitCode = 2;
    return;
  }
  const rootCaptured = captured.find((id) => id.pid === Number(rootPidStr));
  if (!rootCaptured) {
    console.error('[runner] INCONCLUSIVE: root PID absent from captured tree log (no pass)');
    await killOwned();
    process.exitCode = 2;
    return;
  }
  for (const id of captured) {
    log(`captured identity: pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`);
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    console.error('[runner] INCONCLUSIVE: Electron exited before the deliberate runner-owned kill (no pass)');
    process.exitCode = 2;
    return;
  }
  try {
    const live = await enumerateAllOnce();
    const missing = captured.filter((id) => live.get(id.pid)?.creationTime !== id.creationTime);
    if (missing.length > 0) {
      console.error(`[runner] INCONCLUSIVE: ${missing.length} captured identity/identities were gone before the main kill (no pass)`);
      await killOwned();
      process.exitCode = 2;
      return;
    }
    log(`pre-kill identity check: all ${captured.length} exact PID+creation identities still alive`);
  } catch (err) {
    console.error(`[runner] INCONCLUSIVE: pre-kill identity lookup failed: ${err.message} (no pass)`);
    await killOwned();
    process.exitCode = 2;
    return;
  }

  // Phase 2: end ONLY the runner-owned Electron ChildProcess via the handle.
  // Never taskkill / Stop-Process / PID-only kill, never a member PID.
  log('phase 2: terminating ONLY the runner-owned Electron ChildProcess via handle (child.kill(), no PID kill; no term.kill by design)');
  let exited = false;
  const exitedPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      exited = true;
      log(`runner-owned Electron exited (code=${code} signal=${signal})`);
      resolve();
    });
  });
  await killOwned();
  const killDeadline = Date.now() + KILL_WAIT_MS;
  while (!exited && Date.now() < killDeadline) {
    await sleep(250);
  }
  if (!exited) {
    log('runner-owned Electron still alive after 10s; retrying child.kill() on the same runner-owned handle');
    await killOwned();
    await sleep(3000);
  }
  if (!exited) {
    console.error('[runner] INCONCLUSIVE: runner-owned Electron did not exit after kill (no taskkill fallback by design; no pass)');
    process.exitCode = 2;
    return;
  }
  await exitedPromise;
  await sleep(POST_KILL_SETTLE_MS);

  // Phase 3: bounded read-only proof that the exact captured tree is gone.
  // Survivors (or lookup failure) are inconclusive, never PASS.
  log(`phase 3: bounded read-only re-enumeration of the ${captured.length} exact captured identities (bound ${POST_KILL_VERIFY_BOUND_MS}ms, no PID kill)`);
  const deadline = Date.now() + POST_KILL_VERIFY_BOUND_MS;
  let attempts = 0;
  let survivors = captured;
  try {
    // biome-ignore lint: bounded poll loop
    while (true) {
      attempts += 1;
      const all = await enumerateAllOnce();
      survivors = captured.filter((id) => {
        const cur = all.get(id.pid);
        return cur !== undefined && cur.creationTime === id.creationTime;
      });
      if (survivors.length === 0) break;
      if (Date.now() >= deadline) break;
      await sleep(POST_KILL_POLL_MS);
    }
  } catch (err) {
    console.error(`[runner] INCONCLUSIVE: post-kill re-enumeration failed: ${err.message} (teardown unproven, no pass)`);
    process.exitCode = 2;
    return;
  }
  if (survivors.length > 0) {
    console.error(`[runner] INCONCLUSIVE: teardown unproven — ${survivors.length} survivor(s) after ${POST_KILL_VERIFY_BOUND_MS}ms (attempts=${attempts}): ${survivors.map((id) => `pid=${id.pid} created=${id.creationTime} name=${id.name}`).join('; ')} (no pass; no PID kill used)`);
    process.exitCode = 2;
    return;
  }
  const resolvedPath = (resolvedLine.match(/resolved command=(\S+)/) || [])[1] || 'unknown';
  const semverObserved = (versionLine.match(/VERSION (\d+\.\d+\.\d+)/) || [])[1] || 'none';
  if (IS_EDIT_PROBE) {
    const tokenLine = output.split(/\r?\n/).find((l) => /\[cli-edit-smoke\] TOKEN initial=/i.test(l)) ?? '';
    const editPlanLine = output.split(/\r?\n/).find((l) => /\[cli-edit-smoke\] EDIT-PLAN initial=/i.test(l)) ?? '';
    const initialTok = (tokenLine.match(/initial=(\S+)/) || [])[1] || 'unknown';
    const expectedTok = (tokenLine.match(/expected=(\S+)/) || [])[1] || (editPlanLine.match(/expected=(\S+)/) || [])[1] || 'unknown';
    console.log(`[runner] CLI-EDIT PASS: resolved=${resolvedPath} semverObserved=${semverObserved} (best-effort; installed-version proof stays smoke:cli-launch) session=${sessionId} rootPid=${rootPidStr} tree=${captured.length} gone (attempts=${attempts}) initial=${initialTok} expected=${expectedTok} before=${beforeShotPath} (${beforeBytes} bytes sha256=${beforeHash.slice(0, 16)}…) after=${afterShotPath} (${afterBytes} bytes sha256=${afterHash.slice(0, 16)}…) changed (keyboard events delivered + changed render via sendInputEvent Home,Right,Delete,End,Backspace plus ASCII replacement, no Enter, never submitted; NOT semantic editing correctness, orchestrator visual inspection only; NOT command history, NOT S1 step 3, parity, Unicode, approvals, or model behavior)`);
  } else if (IS_INPUT_PROBE) {
    const tokenLine = output.split(/\r?\n/).find((l) => /\[cli-input-smoke\] TOKEN len=/i.test(l)) ?? '';
    const tokenLen = (tokenLine.match(/len=(\d+)/) || [])[1] || 'unknown';
    console.log(`[runner] CLI-INPUT PASS: resolved=${resolvedPath} semverObserved=${semverObserved} (best-effort; installed-version proof stays smoke:cli-launch) session=${sessionId} rootPid=${rootPidStr} tree=${captured.length} gone (attempts=${attempts}) inputLen=${tokenLen} before=${beforeShotPath} (${beforeBytes} bytes sha256=${beforeHash.slice(0, 16)}…) after=${afterShotPath} (${afterBytes} bytes sha256=${afterHash.slice(0, 16)}…) changed (keyboard event + changed render via sendInputEvent keyDown+char+keyUp, no Enter, never submitted; NOT semantic prompt acceptance; orchestrator visual inspection only; NOT S1 step 3, parity, Unicode, approvals, or model behavior)`);
  } else {
    console.log(`[runner] TUI-STARTUP PASS: resolved=${resolvedPath} semverObserved=${semverObserved} (best-effort; installed-version proof stays smoke:cli-launch) session=${sessionId} rootPid=${rootPidStr} tree=${captured.length} gone (attempts=${attempts}) shot=${shotPath} (${shotBytes} bytes; hidden window, no human visual comparison; NOT S1 steps 1-8)`);
  }
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(`[runner] INCONCLUSIVE: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

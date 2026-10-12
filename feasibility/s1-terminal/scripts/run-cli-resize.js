'use strict';
// Bounded real-CLI TUI resize feasibility slice: installed `opencode` with
// EMPTY args inside the existing Electron BrowserWindow renderer (VISIBLE
// opt-in window only; hidden windows do not produce a user-meaningful
// resize). Proves exactly this and nothing more: the bare `opencode` name
// resolves to the installed shim, launches in the main-owned PTY via
// resolveLaunch / ensureMember, startup bytes reach the PTY, the renderer
// reports READY, a before screenshot is captured, the window is resized
// EXACTLY ONCE, an ACTUAL changed valid xterm->IPC->node-pty cols/rows
// observation arrives (not merely a logged requested window size), an after
// screenshot lands at distinct pixel dimensions, and the runner-owned
// Electron teardown leaves none of the exact captured PID+creation
// identities alive. Sends NO keyboard input, NO PTY write, NO prompt text,
// NO Enter/submit, NO model request. Do NOT cite as visual reflow, S1 step
// 5, or S1 pass.
//
// Determinism: the runner OVERWRITES TIYE_S1_COMMAND=opencode and
// TIYE_S1_ARGS_JSON=[] and DELETES inherited TIYE_S1_CWD plus every
// crash/crash-survivor registry env and TIYE_MOCK_CRASH_MODE so an outer
// shell cannot change behavior or trigger the startup recovery gate.
// The Electron side refuses any non-empty args without spawn.
//
// Teardown: after the screenshots the Electron side stays alive (no
// term.kill() by design: node-pty on Windows has a documented teardown race
// after term.kill / app exit with a live PTY). The runner ends ONLY its
// runner-owned Electron ChildProcess via the handle, then read-only verifies
// the exact captured PID+creation tree is gone. If teardown cannot be proven
// the runner exits inconclusive (2), never PASS. Never taskkill /
// Stop-Process / PID-only kill; never a captured member PID; unrelated
// processes are never touched. Existing mock smoke behavior is untouched.
//
// Exit contract: 0 CLI-RESIZE PASS, 1 FAIL (wrong resolution, missing
// startup marker, missing/invalid/unchanged resize observation, missing or
// identical screenshots, same pixel dims, unexpected keyboard input), 2
// inconclusive/harness failure (missing dist, launch/timeout/lookup failure,
// pre-kill tree not alive, or teardown unproven — never a pass).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const electron = require('electron');

const FLAG = '--cli-resize-smoke';
const SMOKE_TAG = 'cli-resize-smoke';
const READY_TIMEOUT_MS = 60000;
const KILL_WAIT_MS = 10000;
const POST_KILL_SETTLE_MS = 2000;
const POST_KILL_VERIFY_BOUND_MS = 15000;
const POST_KILL_POLL_MS = 500;

const READY_RE = /\[cli-resize-smoke\] READY session=(\S+) member=(\S+) rootPid=(\d+) treeSize=(\d+)/;
const IDENTITY_RE = /\[cli-resize-smoke\] IDENTITY pid=(\d+) created=(\S+) name=(\S+) parentPid=(\d+)/g;
const RESIZE_OBSERVED_RE = /\[cli-resize-smoke\] RESIZE-OBSERVED which=(initial|final) cols=(\d+) rows=(\d+) ptyCols=(\d+) ptyRows=(\d+)/g;

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

function parseResizeObserved(output) {
  const found = { initial: null, final: null };
  let m;
  RESIZE_OBSERVED_RE.lastIndex = 0;
  while ((m = RESIZE_OBSERVED_RE.exec(output)) !== null) {
    const which = m[1];
    const rec = { cols: Number(m[2]), rows: Number(m[3]), ptyCols: Number(m[4]), ptyRows: Number(m[5]) };
    if (which === 'initial' && found.initial === null) found.initial = rec;
    if (which === 'final' && found.final === null) found.final = rec;
  }
  return found;
}

function isValidDims(cols, rows) {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols >= 2 && cols <= 500 && rows >= 1 && rows <= 200;
}

// Independent PNG pixel-dimension read (IHDR width/height, big-endian).
// Does not trust logged sizes alone; the runner requires distinct pixel
// dims from the files themselves plus distinct hashes.
function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 33) throw new Error(`PNG too short (${buf.length} bytes)`);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) throw new Error('not a PNG file (bad signature)');
  const ihdr = buf.subarray(12, 16).toString('ascii');
  if (ihdr !== 'IHDR') throw new Error(`first chunk is ${ihdr}, want IHDR`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`invalid PNG dimensions ${width}x${height}`);
  }
  return { width, height, bytes: buf.length };
}

async function main() {
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[runner] FAIL: dist/main.js missing (run npm run build first; harness failure, no pass)');
    process.exitCode = 2;
    return;
  }
  const beforeShotPath = path.resolve(__dirname, '..', 'dist', 'cli-resize-before.png');
  const afterShotPath = path.resolve(__dirname, '..', 'dist', 'cli-resize-after.png');

  // Deterministic probe env: fixed command + empty args, scrubbed S1
  // overrides so inherited values cannot change behavior.
  const env = {
    ...process.env,
    TIYE_S1_COMMAND: 'opencode',
    TIYE_S1_ARGS_JSON: '[]',
  };
  const gatePath = path.resolve(__dirname, '..', 'dist', `cli-gate-${crypto.randomBytes(8).toString('hex')}.tmp`);
  const gateToken = crypto.randomBytes(16).toString('hex');
  process.once('exit', () => { try { fs.unlinkSync(gatePath); } catch { /* already removed */ } });
  env.TIYE_CLI_CONTAINMENT_GATE = gatePath;
  env.TIYE_CLI_CONTAINMENT_TOKEN = gateToken;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TIYE_S1_CWD;
  delete env.TIYE_CRASH_REGISTRY_PATH;
  delete env.TIYE_CRASH_JOB_REGISTRY_PATH;
  delete env.TIYE_CRASH_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_MOCK_CRASH_MODE;
  log('env: TIYE_S1_COMMAND=opencode TIYE_S1_ARGS_JSON=[] (fixed; no keyboard input, no PTY write, no prompt, no model request)');
  log('env: scrubbed TIYE_S1_CWD + TIYE_CRASH_* registry paths + TIYE_MOCK_CRASH_MODE (inherited values cannot change behavior or trigger the recovery gate)');

  log(`phase 1: spawn runner-owned Electron ${FLAG} visible-window (opt-in resize observation) (real installed CLI via resolveLaunch/ensureMember, ConPTY + renderer)`);
  const child = spawn(electron, [distMain, FLAG], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let ready = null;
  const childTag = 'cli-resize-main';
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
  let cliController = null;
  const releaseCliJob = () => {
    try { fs.unlinkSync(gatePath); } catch { /* already removed */ }
    if (!cliController) return;
    try { cliController.stdin?.end(); } catch { /* already closed */ }
  };
  const setupDeadline = Date.now() + 10000;
  const waitingMarker = `[${SMOKE_TAG}] WAITING containment before PTY spawn`;
  while (!output.includes(waitingMarker) && Date.now() < setupDeadline) {
    const st = await Promise.race([exitPromise.then(() => true), sleep(100).then(() => false)]);
    if (st) break;
  }
  if (!output.includes(waitingMarker) || !child.pid) {
    console.error('[runner] INCONCLUSIVE: CLI containment gate not ready; no CLI spawned');
    child.kill();
    process.exitCode = 2;
    return;
  }
  try {
    const identity = (await enumerateAllOnce()).get(child.pid);
    if (!identity || !/^electron\.exe$/i.test(identity.name)) throw new Error(`Electron identity unavailable: ${JSON.stringify(identity)}`);
    const controllerPath = path.resolve(__dirname, 'job-probe-controller.ps1');
    if (!fs.existsSync(controllerPath)) throw new Error('job controller missing');
    let controllerOutput = '';
    cliController = spawn(powershellBin(), [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', controllerPath,
      '-ChildPid', String(identity.pid), '-ChildCreationTime', identity.creationTime, '-HoldUntilStdinClose',
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    cliController.stdout?.on('data', (d) => { controllerOutput += d.toString('utf8'); });
    cliController.stderr?.on('data', (d) => { controllerOutput += d.toString('utf8'); });
    cliController.on('error', (err) => { controllerOutput += `\nERROR ${err.message}`; });
    const deadline = Date.now() + 12000;
    const expectedReady = `[job-controller] READY childPid=${identity.pid} `;
    while (!controllerOutput.includes(expectedReady) && Date.now() < deadline) {
      if (/\[job-controller\] FAIL:|ERROR /.test(controllerOutput) || cliController.exitCode !== null) break;
      await sleep(100);
    }
    if (!controllerOutput.includes(expectedReady)
        || !controllerOutput.includes('confirmed JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE read-back flags=0x2000')
        || !controllerOutput.includes(`confirmed IsProcessInJob(pid=${identity.pid})=true`)) {
      throw new Error(`job assignment unverified: ${controllerOutput.slice(-500)}`);
    }
    log(`CLI containment READY: Electron pid=${identity.pid} creation=${identity.creationTime} in kill-on-close Job Object`);
    fs.writeFileSync(gatePath, gateToken, { flag: 'wx' });
  } catch (err) {
    console.error(`[runner] INCONCLUSIVE: CLI containment setup failed: ${err.message} (no CLI allowed)`);
    child.kill();
    releaseCliJob();
    process.exitCode = 2;
    return;
  }
  const readyDeadline = Date.now() + READY_TIMEOUT_MS;
  while (!ready && Date.now() < readyDeadline) {
    const st = await Promise.race([exitPromise.then((e) => ({ exited: true, e })), sleep(250).then(() => ({ exited: false }))]);
    if (st.exited) {
      console.error(`[runner] FAIL: Electron exited before READY (code=${st.e.code} signal=${st.e.signal}; no pass)`);
      releaseCliJob();
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
    releaseCliJob();
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
  const resizePlanLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] RESIZE-PLAN `, 'i').test(l)) ?? '';
  const resizeRequestedLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] RESIZE-REQUESTED `, 'i').test(l)) ?? '';
  const shotsLine = output.split(/\r?\n/).find((l) => new RegExp(`\\[${tagEsc}\\] SHOTS `, 'i').test(l)) ?? '';
  const resolvedOpencode = /opencode/i.test(spawningLine) || /opencode/i.test(resolvedLine);
  const resolvedCmdShim = process.platform === 'win32'
    ? /\.cmd\b/i.test(spawningLine)
    : resolvedOpencode;
  const rendererReady = new RegExp(`\\[${tagEsc}\\] ok: renderer READY`, 'i').test(output);
  const ptyData = new RegExp(`\\[${tagEsc}\\] ok: real CLI PTY data observed`, 'i').test(output);
  const markersOk = new RegExp(`\\[${tagEsc}\\] MARKERS .*opencode=true`, 'i').test(output);
  const versionOk = new RegExp(`\\[${tagEsc}\\] VERSION \\d+\\.\\d+\\.\\d+`, 'i').test(output);
  const resizePlanOk = new RegExp(`\\[${tagEsc}\\] RESIZE-PLAN steps=shot\\(before\\),resize-once`, 'i').test(output);
  const shotsChangedOk = new RegExp(`\\[${tagEsc}\\] SHOTS .*changed=true`, 'i').test(output);
  const shotsDimsChangedOk = new RegExp(`\\[${tagEsc}\\] SHOTS .*dimsChanged=true`, 'i').test(output);
  const beforeShotLogOk = new RegExp(`\\[${tagEsc}\\] ok: screenshot before .*cli-resize-before\\.png`, 'i').test(output);
  const afterShotLogOk = new RegExp(`\\[${tagEsc}\\] ok: screenshot after .*cli-resize-after\\.png`, 'i').test(output);
  // Resize mode must send NO keyboard input: any sendInputEvent delivery log
  // is a FAIL (unexpected input path).
  const unexpectedInput = /via sendInputEvent/i.test(output) || /ok: input typed/i.test(output) || /ok: edit keys/i.test(output) || /history input typed/i.test(output);
  log(`assert: spawning line: ${spawningLine.slice(0, 300)}`);
  log(`assert: resolved line: ${resolvedLine.slice(0, 300)}`);
  log(`assert: markers line: ${markersLine.slice(0, 200)}`);
  log(`assert: version line: ${versionLine.slice(0, 120)}`);
  log(`assert: resize-plan line: ${resizePlanLine.slice(0, 300)}`);
  log(`assert: resize-requested line: ${resizeRequestedLine.slice(0, 200)}`);
  log(`assert: shots line: ${shotsLine.slice(0, 400)}`);
  const observed = parseResizeObserved(output);
  const initialOk = observed.initial !== null && isValidDims(observed.initial.cols, observed.initial.rows);
  const finalOk = observed.final !== null && isValidDims(observed.final.cols, observed.final.rows);
  const dimsChangedOk =
    observed.initial !== null &&
    observed.final !== null &&
    (observed.initial.cols !== observed.final.cols || observed.initial.rows !== observed.final.rows);
  log(`assert: resize observed initial=${observed.initial ? `${observed.initial.cols}x${observed.initial.rows} pty=${observed.initial.ptyCols}x${observed.initial.ptyRows}` : 'none'} final=${observed.final ? `${observed.final.cols}x${observed.final.rows} pty=${observed.final.ptyCols}x${observed.final.ptyRows}` : 'none'} initialOk=${initialOk} finalOk=${finalOk} dimsChangedOk=${dimsChangedOk}`);
  log(`assert: mode=resize-probe resolvedOpencode=${resolvedOpencode} resolvedCmdShim=${resolvedCmdShim} rendererReady=${rendererReady} ptyData=${ptyData} markersOk=${markersOk} versionOk=${versionOk} resizePlanOk=${resizePlanOk} shotsChangedOk=${shotsChangedOk} shotsDimsChangedOk=${shotsDimsChangedOk} beforeShotLogOk=${beforeShotLogOk} afterShotLogOk=${afterShotLogOk} unexpectedInput=${unexpectedInput}`);

  const killOwned = async () => {
    try {
      child.kill();
    } catch {
      /* runner-owned handle only */
    }
    releaseCliJob();
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
  if (!rendererReady || !ptyData || !markersOk || !resizePlanOk || !shotsChangedOk || !shotsDimsChangedOk || !beforeShotLogOk || !afterShotLogOk) {
    console.error('[runner] FAIL: renderer READY + real CLI PTY data + markers + RESIZE-PLAN + changed SHOTS (changed=true dimsChanged=true) + before/after screenshot logs not all proven (no pass; requested window size alone is never proof; not S1 step 5)');
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (unexpectedInput) {
    console.error('[runner] FAIL: unexpected keyboard-input delivery log in resize mode (this probe sends NO input, NO PTY write, NO submit; no pass)');
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (!initialOk || !finalOk) {
    console.error(`[runner] FAIL: observed xterm->IPC->node-pty dims missing or invalid (initialOk=${initialOk} finalOk=${finalOk}; want cols 2..500 rows 1..200 via RESIZE-OBSERVED, not RESIZE-REQUESTED; no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (!dimsChangedOk) {
    console.error(`[runner] FAIL: observed dims unchanged after single resize (initial=${observed.initial.cols}x${observed.initial.rows} final=${observed.final.cols}x${observed.final.rows}; requested size alone is not proof; no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (resizeRequestedLine === '') {
    console.error('[runner] FAIL: single RESIZE-REQUESTED log missing (expected exactly one BrowserWindow resize; no pass)');
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (!versionOk) {
    log('note: bare semver not present in this startup window (dynamic TUI; best-effort marker only — installed-command proof is the resolved .cmd path + opencode marker, not this line)');
  }
  let beforeStat = 0;
  let afterStat = 0;
  let beforeHash = '';
  let afterHash = '';
  let beforeDims = null;
  let afterDims = null;
  try {
    beforeStat = fs.statSync(beforeShotPath).size;
  } catch {
    console.error(`[runner] FAIL: before screenshot missing at ${beforeShotPath} (no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  try {
    afterStat = fs.statSync(afterShotPath).size;
  } catch {
    console.error(`[runner] FAIL: after screenshot missing at ${afterShotPath} (no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (beforeStat <= 0 || afterStat <= 0) {
    console.error(`[runner] FAIL: before/after screenshot empty (before=${beforeStat} after=${afterStat}; rendering not proven; no pass)`);
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
    console.error(`[runner] FAIL: before/after screenshots identical sha256=${beforeHash} (no resize/render change proven; no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  try {
    beforeDims = readPngSize(beforeShotPath);
  } catch (err) {
    console.error(`[runner] FAIL: before PNG dimension read failed: ${err.message} (no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  try {
    afterDims = readPngSize(afterShotPath);
  } catch (err) {
    console.error(`[runner] FAIL: after PNG dimension read failed: ${err.message} (no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  if (beforeDims.width === afterDims.width && beforeDims.height === afterDims.height) {
    console.error(`[runner] FAIL: before/after screenshots share pixel dimensions ${beforeDims.width}x${beforeDims.height} (distinct pixel dims required; file-independent proof, not logged size; no pass)`);
    await killOwned();
    process.exitCode = 1;
    return;
  }
  log(`screenshots ok: before=${beforeShotPath} (${beforeStat} bytes sha256=${beforeHash.slice(0, 16)}… ${beforeDims.width}x${beforeDims.height}) after=${afterShotPath} (${afterStat} bytes sha256=${afterHash.slice(0, 16)}… ${afterDims.width}x${afterDims.height}) changed distinct-dims (visible opt-in resize window, no keyboard input, orchestrator visual inspection only; NOT visual reflow proof)`);
  log(`resize observed ok: initial cols=${observed.initial.cols} rows=${observed.initial.rows} pty=${observed.initial.ptyCols}x${observed.initial.ptyRows} final cols=${observed.final.cols} rows=${observed.final.rows} pty=${observed.final.ptyCols}x${observed.final.ptyRows} changed (xterm->IPC->node-pty observed, NOT requested size)`);

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
  console.log(`[runner] CLI-RESIZE PASS: resolved=${resolvedPath} semverObserved=${semverObserved} (best-effort; installed-version proof stays smoke:cli-launch) session=${sessionId} rootPid=${rootPidStr} tree=${captured.length} gone (attempts=${attempts}) initial=${observed.initial.cols}x${observed.initial.rows} final=${observed.final.cols}x${observed.final.rows} before=${beforeShotPath} (${beforeStat} bytes sha256=${beforeHash.slice(0, 16)}… ${beforeDims.width}x${beforeDims.height}) after=${afterShotPath} (${afterStat} bytes sha256=${afterHash.slice(0, 16)}… ${afterDims.width}x${afterDims.height}) changed distinct-dims (single BrowserWindow resize, observed xterm->IPC->node-pty dims change + distinct screenshots + exact teardown, no keyboard input, never submitted, no model request; NOT visual reflow proof, NOT S1 step 5, NOT S1 pass — orchestrator visual inspection only)`);
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(`[runner] INCONCLUSIVE: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

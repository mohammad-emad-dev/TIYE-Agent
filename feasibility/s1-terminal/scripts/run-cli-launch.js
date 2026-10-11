'use strict';
// Bounded real-CLI launch smoke: installed `opencode --version` inside
// Electron via ConPTY, headless. Proves exactly this and nothing more:
// resolveLaunch() resolves the bare `opencode` name (Windows .cmd shim
// aware), spawnMember() launches it in a main-owned PTY, a version line is
// observed, and the PTY exits 0 with NO stdin written.
//
// Safety: args are fixed to ["--version"] (no prompt or model request).
// The child stdio is ['ignore','pipe','pipe'] so no stdin is forwarded. The Electron
// side refuses any non-version args without spawn (see runCliLaunchSmoke)
// and never calls term.write in this mode.
//
// Determinism: the runner OVERWRITES TIYE_S1_COMMAND=opencode and
// TIYE_S1_ARGS_JSON=["--version"] and DELETES inherited TIYE_S1_CWD plus
// every crash/crash-survivor registry env and TIYE_MOCK_CRASH_MODE so an
// outer shell cannot change behavior or trigger the startup recovery gate.
// Existing mock smoke behavior is untouched (separate flag/runner).
//
// Headless: no window, no renderer, no display/input claim. Do not cite
// this as interactive/display S1 success.
//
// Exit contract: 0 CLI-LAUNCH PASS, 1 FAIL (wrong resolution or smoke
// failure), 2 inconclusive/harness failure (missing dist, launch failure,
// timeout — never a pass). Never taskkill / PID kill; the only kill()
// target is the runner-owned Electron handle on timeout.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const electron = require('electron');

const FLAG = '--cli-launch-smoke';
const SMOKE_TIMEOUT_MS = 45000;

function log(msg) {
  console.log(`[runner] ${msg}`);
}

function logChild(prefix, chunk) {
  const text = chunk.toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (line !== '') console.log(`[${prefix}] ${line}`);
  }
}

async function main() {
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[runner] FAIL: dist/main.js missing (run npm run build first; harness failure, no pass)');
    process.exitCode = 2;
    return;
  }

  // Deterministic probe env: fixed command + version-only args, scrubbed S1
  // overrides so inherited values cannot change behavior.
  const env = {
    ...process.env,
    TIYE_S1_COMMAND: 'opencode',
    TIYE_S1_ARGS_JSON: '["--version"]',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TIYE_S1_CWD;
  delete env.TIYE_CRASH_REGISTRY_PATH;
  delete env.TIYE_CRASH_JOB_REGISTRY_PATH;
  delete env.TIYE_CRASH_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH;
  delete env.TIYE_MOCK_CRASH_MODE;
  log('env: TIYE_S1_COMMAND=opencode TIYE_S1_ARGS_JSON=["--version"] (fixed; no stdin, no model request)');
  log('env: scrubbed TIYE_S1_CWD + TIYE_CRASH_* registry paths + TIYE_MOCK_CRASH_MODE (inherited values cannot change behavior or trigger the recovery gate)');

  log(`phase: spawn runner-owned Electron ${FLAG} headless (real installed CLI via resolveLaunch/spawnMember, ConPTY)`);
  const child = spawn(electron, [distMain, FLAG], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (d) => {
    output += d.toString('utf8');
    logChild('cli-launch-main', d);
  });
  child.stderr?.on('data', (d) => {
    output += d.toString('utf8');
    logChild('cli-launch-main', d);
  });

  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[runner] Electron ${FLAG} timed out after ${SMOKE_TIMEOUT_MS}ms (harness failure, no pass)`);
      try {
        child.kill();
      } catch {
        /* runner-owned handle only */
      }
      resolve({ code: 2, timedOut: true });
    }, SMOKE_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`[runner] Electron launch failed: ${err.message} (harness failure, no pass)`);
      resolve({ code: 2, timedOut: false });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 2, timedOut: false });
    });
  });

  const spawningLine = output.split(/\r?\n/).find((l) => /\[s1\] spawning:/i.test(l)) ?? '';
  const resolvedLine = output.split(/\r?\n/).find((l) => /\[cli-launch-smoke\] resolved command=/i.test(l)) ?? '';
  const versionLine = output.split(/\r?\n/).find((l) => /opencode[^\r\n]*\d+\.\d+\.\d+/i.test(l)) ?? '';
  const resolvedOpencode = /opencode/i.test(spawningLine) || /opencode/i.test(resolvedLine);
  const resolvedCmdShim = process.platform === 'win32'
    ? /\.cmd\b/i.test(spawningLine)
    : resolvedOpencode;
  const versionOk = /opencode[^\r\n]*\d+\.\d+\.\d+/i.test(output);
  const exitOk = /\[cli-launch-smoke\] ok: exit code 0/i.test(output);
  const smokePass = /\[cli-launch-smoke\] PASS/i.test(output);
  log(`assert: spawning line: ${spawningLine.slice(0, 300)}`);
  log(`assert: resolved line: ${resolvedLine.slice(0, 300)}`);
  log(`assert: version line: ${versionLine.slice(0, 200)}`);
  log(`assert: resolvedOpencode=${resolvedOpencode} resolvedCmdShim=${resolvedCmdShim} versionOk=${versionOk} exitOk=${exitOk} smokePass=${smokePass} electronExit=${exit.code} timedOut=${exit.timedOut}`);

  if (exit.timedOut) {
    process.exitCode = 2;
    return;
  }
  if (spawningLine === '' || resolvedLine === '' || !resolvedOpencode) {
    console.error('[runner] FAIL: Electron did not resolve/launch the installed opencode executable (expected [s1] spawning + resolved lines with opencode; no pass)');
    process.exitCode = 1;
    return;
  }
  if (process.platform === 'win32' && !resolvedCmdShim) {
    console.error(`[runner] FAIL: expected Windows .cmd shim resolution (spawning line with opencode.cmd, got: ${spawningLine.slice(0, 200)}; no pass)`);
    process.exitCode = 1;
    return;
  }
  if (!versionOk) {
    console.error('[runner] FAIL: version output not observed (want opencode + semver, e.g. "opencode v2.0.22"; no pass)');
    process.exitCode = 1;
    return;
  }
  if (exit.code !== 0 || !exitOk || !smokePass) {
    console.error(`[runner] FAIL: clean PTY exit not proven (electronExit=${exit.code} exitOk=${exitOk} smokePass=${smokePass}; no pass)`);
    process.exitCode = 1;
    return;
  }
  const resolvedPath = (resolvedLine.match(/resolved command=(\S+)/) || [])[1] || (spawningLine.match(/spawning:\s*(\S+)/) || [])[1] || 'unknown';
  console.log(`[runner] CLI-LAUNCH PASS: resolved=${resolvedPath} version="${versionLine.trim().slice(0, 120)}" exit=0 via headless ConPTY (no stdin, no model request; NOT interactive/display S1 success)`);
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(`[runner] FAIL: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

'use strict';
// Bounded Windows launch-resolution regression (extensionless POSIX shim vs
// .cmd). Reproduces `where.exe opencode` returning an extensionless POSIX
// shim before `opencode.cmd`: old resolveOnPath picked the first line, and
// node-pty/ConPTY fails to spawn it (error 193). The fix picks the first
// supported Windows executable/script result in original where.exe order.
//
// Fixture (local only, always cleaned): a temp dir containing both an
// extensionless file and a same-name `.cmd` shim that launches the existing
// local mock CLI through Node. The temp dir is prepended to PATH (raw entry,
// no quoting — PATH entries with spaces need none), TIYE_S1_COMMAND is the
// bare name, TIYE_S1_ARGS_JSON is []. The runner then drives the real
// Electron S1 smoke (--smoke-test) through actual node-pty/ConPTY and
// asserts it resolved/spawned the `.cmd` and the existing mock behavior
// (banner/echo/resize/fast/exit) still passes. No vendor CLI, no network
// model, no new dependency. All spawns use argv arrays; the executable
// and mock-cli paths are quoted inside the generated `.cmd`.
//
// Exit contract: 0 PASS (where order reproduced + Electron spawned .cmd +
// smoke PASS), 1 FAIL (wrong resolution or smoke failure), 2 inconclusive /
// harness failure (non-Windows, missing dist, where order unexpected,
// timeout — never a pass). Never taskkill / PID kill; the only kill()
// target is the runner-owned Electron handle on timeout.

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require('electron');

const BARE_NAME = 'tiye-shim-probe';
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

function mockCliPath() {
  return path.resolve(__dirname, '..', 'mock-cli', 'mock-cli.js');
}

async function main() {
  if (process.platform !== 'win32') {
    console.error(`[runner] SKIP: launch-shim probe is Windows-only (platform=${process.platform}; no pass claimed)`);
    process.exitCode = 2;
    return;
  }
  const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    console.error('[runner] FAIL: dist/main.js missing (run npm run build first; harness failure, no pass)');
    process.exitCode = 2;
    return;
  }
  const mockCli = mockCliPath();
  if (!fs.existsSync(mockCli)) {
    console.error(`[runner] FAIL: mock-cli fixture missing: ${mockCli} (harness failure, no pass)`);
    process.exitCode = 2;
    return;
  }

  // Temp dir prefix intentionally contains spaces so PATH-prepend and the
  // quoted mock-cli path inside the .cmd both prove space-safe handling.
  let tmpDir = null;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye launch shim-'));
  } catch (err) {
    console.error(`[runner] FAIL: could not create temp dir: ${err.message} (harness failure, no pass)`);
    process.exitCode = 2;
    return;
  }
  log(`fixture dir (spaces intentional): ${tmpDir}`);
  const extensionlessPath = path.join(tmpDir, BARE_NAME);
  const cmdPath = path.join(tmpDir, `${BARE_NAME}.cmd`);
  try {
    // Extensionless POSIX-style shim (mimics npm's `opencode` shell shim):
    // must be SKIPPED by the resolver. It is not a Windows executable, so
    // CreateProcess via node-pty/ConPTY fails with error 193.
    fs.writeFileSync(extensionlessPath, '#!/bin/sh\n# tiye launch-shim fixture: must never be spawned on Windows\necho BAD-SHIM-SHOULD-NOT-RUN\n exit 1\n', 'utf8');
    // Launchable shim: runs the existing local mock CLI through Node.
    // Both paths are quoted because the workspace and Node installation may
    // contain spaces. %* forwards any args (the smoke passes []).
    fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${mockCli}" %*\r\n`, 'utf8');
    log(`fixture wrote extensionless: ${extensionlessPath}`);
    log(`fixture wrote cmd shim: ${cmdPath}`);
  } catch (err) {
    console.error(`[runner] FAIL: could not write fixture: ${err.message} (harness failure, no pass)`);
    cleanup(tmpDir);
    process.exitCode = 2;
    return;
  }

  // Child env: temp dir FIRST on PATH (raw, no quoting), bare command, no
  // args. delete ELECTRON_RUN_AS_NODE like scripts/run-smoke.js.
  const env = {
    ...process.env,
    PATH: tmpDir + path.delimiter + process.env.PATH,
    TIYE_S1_COMMAND: BARE_NAME,
    TIYE_S1_ARGS_JSON: '[]',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  // Prove the fixture reproduces the bug shape: where.exe must list the
  // extensionless file BEFORE the .cmd (same as `where.exe opencode`).
  let whereLines = [];
  try {
    const out = spawnSync('where.exe', [BARE_NAME], { env, encoding: 'utf8' });
    if (out.error) throw out.error;
    if (out.status !== 0) throw new Error(`where.exe exited ${out.status}: ${(out.stderr || '').slice(0, 300)}`);
    whereLines = (out.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    console.error(`[runner] FAIL: where.exe probe failed: ${err.message} (harness failure, no pass)`);
    cleanup(tmpDir);
    process.exitCode = 2;
    return;
  }
  log(`where.exe ${BARE_NAME} returned ${whereLines.length} line(s):`);
  for (const line of whereLines) log(`  where: ${line}`);
  const firstExt = whereLines.length > 0 ? path.extname(whereLines[0]).toLowerCase() : null;
  const cmdLine = whereLines.find((p) => path.extname(p).toLowerCase() === '.cmd');
  if (whereLines.length < 2 || firstExt !== '' || cmdLine === undefined) {
    console.error('[runner] FAIL: fixture did not reproduce extensionless-before-.cmd order (harness failure, no pass)');
    cleanup(tmpDir);
    process.exitCode = 2;
    return;
  }
  if (!whereLines[0].toLowerCase().startsWith(tmpDir.toLowerCase()) || !cmdLine.toLowerCase().startsWith(tmpDir.toLowerCase())) {
    console.error('[runner] FAIL: where.exe results are not from the fixture dir first (harness failure, no pass)');
    cleanup(tmpDir);
    process.exitCode = 2;
    return;
  }
  log('fixture order ok: extensionless POSIX shim listed before the .cmd (old code would pick the bad line)');

  // Run the REAL Electron S1 smoke through actual node-pty/ConPTY with the
  // shim env. Capture output to assert .cmd resolution + mock behavior.
  log('phase: spawn runner-owned Electron --smoke-test with TIYE_S1_COMMAND=<bare> TIYE_S1_ARGS_JSON=[] (mock CLI only, no vendor model)');
  const child = spawn(electron, [distMain, '--smoke-test'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (d) => {
    output += d.toString('utf8');
    logChild('smoke-main', d);
  });
  child.stderr?.on('data', (d) => {
    output += d.toString('utf8');
    logChild('smoke-main', d);
  });
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`[runner] Electron smoke timed out after ${SMOKE_TIMEOUT_MS}ms (harness failure, no pass)`);
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

  // Assertions: resolved/spawned the .cmd (not the extensionless shim) and
  // the existing mock behavior passed through it.
  const spawningLine = output.split(/\r?\n/).find((l) => /\[s1\] spawning:/i.test(l)) ?? '';
  const spawnedCmd = /\.cmd\b/i.test(spawningLine) && spawningLine.toLowerCase().includes(BARE_NAME.toLowerCase());
  const spawnedExtensionlessOnly = spawningLine !== '' && !/\.cmd\b/i.test(spawningLine) && spawningLine.includes(BARE_NAME);
  const smokePass = /\[smoke\] PASS/.test(output);
  const bannerOk = /\[smoke\] ok: banner/i.test(output);
  const exitOk = /\[smoke\] ok: exit code 0/i.test(output);
  log(`assert: spawning line: ${spawningLine.slice(0, 300)}`);
  log(`assert: spawnedCmd=${spawnedCmd} spawnedExtensionlessOnly=${spawnedExtensionlessOnly} smokePass=${smokePass} bannerOk=${bannerOk} exitOk=${exitOk} electronExit=${exit.code}`);

  const cleaned = cleanup(tmpDir);
  if (!cleaned) {
    process.exitCode = 2;
    return;
  }

  if (exit.timedOut) {
    process.exitCode = 2;
    return;
  }
  if (spawningLine === '' || !spawnedCmd || spawnedExtensionlessOnly) {
    console.error(`[runner] FAIL: Electron did not resolve/spawn the .cmd shim (expected spawning line with ${BARE_NAME}.cmd, got: ${spawningLine.slice(0, 200)}; no pass)`);
    process.exitCode = 1;
    return;
  }
  if (output.includes('BAD-SHIM-SHOULD-NOT-RUN')) {
    console.error('[runner] FAIL: extensionless shim output observed (wrong file launched; no pass)');
    process.exitCode = 1;
    return;
  }
  if (exit.code !== 0 || !smokePass || !bannerOk || !exitOk) {
    console.error(`[runner] FAIL: smoke through .cmd shim did not pass (exit=${exit.code} smokePass=${smokePass}; no pass)`);
    process.exitCode = 1;
    return;
  }
  console.log(`[runner] LAUNCH-SHIM PASS: bare ${BARE_NAME} resolved to ${cmdPath} (extensionless shim skipped), mock smoke banner/echo/resize/fast/exit passed through real ConPTY; no vendor model used`);
  process.exitCode = 0;
}

function cleanup(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`[runner] fixture cleaned: ${tmpDir}`);
    return true;
  } catch (err) {
    console.error(`[runner] fixture cleanup failed: ${tmpDir}: ${err.message} (no pass claimed on cleanup failure)`);
    return false;
  }
}

main().catch((err) => {
  console.error(`[runner] FAIL: ${err && err.message ? err.message : err} (no pass)`);
  process.exitCode = 2;
});

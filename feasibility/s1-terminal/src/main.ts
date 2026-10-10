// S1b main process (+ bounded S1 9e probe, + bounded 9f BASELINE probe,
// + bounded 9f crash+job experiment, + bounded 9f crash-survivor experiment,
// + bounded 9f crash-pty-survivor experiment).
// Main owns ONE member PTY session across BrowserWindow recreation
// (Architecture 2.3, S1 steps 9a-9d). Window close offers Keep Running
// (retain PTY, tray with Open/Quit) or Stop (graceful CLI shutdown, then
// quit). Tray Quit follows the stop-all path. A separate mock-core OS
// process covers 9b re-subscribe over a narrow stdio JSON-lines IPC with no
// duplicate spawn; no team engine is included. Step 9e is a bounded
// read-only Windows CIM probe (PID + process creation time, never kills)
// inside the lifecycle smoke. Step 9f BASELINE (--crash-baseline /
// --crash-recovery-check + runner) only observes crash/relaunch feasibility
// with a durable PID+creation registry: Windows Job Object, product recovery
// state machine, and any 9f pass are NOT implemented here.

import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, type IpcMainEvent } from 'electron';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pty from 'node-pty';
import { CHANNELS, isValidInput, isValidResize } from './shared';
import {
  captureProcessTree,
  formatIdentity,
  isProcessTreeCheckSupported,
  verifyIdentitiesGone,
  type ProcessIdentity,
} from './process-tree-9e';
import {
  CRASH_SURVIVOR_FLAG,
  CRASH_SURVIVOR_RECOVERY_FLAG,
  runCrashSurvivor,
  runCrashSurvivorRecovery,
} from './crash-survivor';
import {
  CRASH_PTY_SURVIVOR_FLAG,
  CRASH_PTY_SURVIVOR_RECOVERY_FLAG,
  CRASH_PTY_SURVIVOR_REGISTRY_ENV,
  parseCrashPtySurvivorRegistry,
  runCrashPtySurvivor,
  runCrashPtySurvivorRecovery,
} from './crash-pty-survivor';

const SMOKE_FLAG = '--smoke-test';
const WINDOW_SMOKE_FLAG = '--window-smoke';
const LIFECYCLE_SMOKE_FLAG = '--lifecycle-smoke';
const CRASH_BASELINE_FLAG = '--crash-baseline';
const CRASH_RECOVERY_FLAG = '--crash-recovery-check';
const CRASH_REGISTRY_ENV = 'TIYE_CRASH_REGISTRY_PATH';
const CRASH_REGISTRY_SCHEMA = 'tiye-crash-baseline-registry';
const CRASH_REGISTRY_VERSION = 1;
const CRASH_JOB_FLAG = '--crash-job';
const CRASH_JOB_RECOVERY_FLAG = '--crash-job-recovery-check';
const CRASH_JOB_REGISTRY_ENV = 'TIYE_CRASH_JOB_REGISTRY_PATH';
const CRASH_JOB_REGISTRY_SCHEMA = 'tiye-crash-job-registry';
const CRASH_JOB_REGISTRY_VERSION = 1;
const STARTUP_RECOVERY_ALERT_SMOKE_FLAG = '--startup-recovery-alert-smoke';
const MAX_PENDING_OUTPUT = 1_000_000;

// ---------------------------------------------------------------------------
// Bounded S1 9f prototype startup recovery gate (mock feasibility only,
// READ-ONLY). On ORDINARY startup with TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH
// set and no existing crash/smoke experiment flag, read + parse the registry
// with the existing parser (read-only) BEFORE any member spawn, then ALWAYS
// show one constant visible recovery-paused ALERT window, launch no member,
// invoke NO helper, mutate nothing. Ordinary startup NEVER calls
// runCrashPtySurvivorRecovery() or verified-identity-stop.ps1 here: the
// registry is unauthenticated against same-user tampering, so auto cleanup
// on ordinary launch is unsafe. Explicit --crash-pty-survivor-recovery-check
// stays the only cleanup path.
// ---------------------------------------------------------------------------
let startupRecoveryGateActive = false;
let startupRecoveryWindow: BrowserWindow | null = null;

const STARTUP_RECOVERY_ALERT_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
  '<title>TIYE S1 recovery paused</title>' +
  '<style>html,body{margin:0;padding:24px;font-family:sans-serif;background:#1e1e1e;color:#f5f5f5}' +
  'main{max-width:560px;margin:0 auto;border:1px solid #b3261e;border-radius:8px;padding:20px;background:#2a1f1f}' +
  'h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.5;margin:8px 0}</style>' +
  '</head><body><main id="startup-recovery-status" data-kind="alert">' +
  '<h1>TIYE S1 startup recovery - paused</h1>' +
  '<p>A prior session may still be running and must be reviewed. No new member started.</p>' +
  '<p>No cleanup was attempted or verified. This prototype remains paused. This is a mock feasibility prototype, not production-ready recovery. No member was resumed automatically.</p>' +
  '</main></body></html>';

function hasCrashExperimentFlag(argv: string[]): boolean {
  return (
    argv.includes(SMOKE_FLAG) ||
    argv.includes(WINDOW_SMOKE_FLAG) ||
    argv.includes(LIFECYCLE_SMOKE_FLAG) ||
    argv.includes(CRASH_BASELINE_FLAG) ||
    argv.includes(CRASH_RECOVERY_FLAG) ||
    argv.includes(CRASH_JOB_FLAG) ||
    argv.includes(CRASH_JOB_RECOVERY_FLAG) ||
    argv.includes(CRASH_SURVIVOR_FLAG) ||
    argv.includes(CRASH_SURVIVOR_RECOVERY_FLAG) ||
    argv.includes(CRASH_PTY_SURVIVOR_FLAG) ||
    argv.includes(CRASH_PTY_SURVIVOR_RECOVERY_FLAG)
  );
}

function shouldRunStartupRecoveryGate(): boolean {
  const raw = (process.env[CRASH_PTY_SURVIVOR_REGISTRY_ENV] ?? '').trim();
  if (raw === '') return false;
  if (hasCrashExperimentFlag(process.argv)) return false;
  return true;
}

function createStartupRecoveryStatusWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 640,
    height: 420,
    show: true,
    title: 'TIYE S1 recovery paused',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(STARTUP_RECOVERY_ALERT_HTML)).catch((err: unknown) => {
    console.error(`[startup-recovery] FAIL: status window could not load: ${(err as Error).message}`);
    dialog.showErrorBox('TIYE S1 recovery paused', 'The recovery status window could not load. No new member was started.');
  });
  w.show();
  w.focus();
  w.on('closed', () => {
    if (startupRecoveryWindow === w) startupRecoveryWindow = null;
  });
  return w;
}

async function runStartupRecoveryGate(alertSmoke: boolean): Promise<void> {
  startupRecoveryGateActive = true;
  const registryPath = (process.env[CRASH_PTY_SURVIVOR_REGISTRY_ENV] ?? '').trim();
  console.log('[startup-recovery] GATE ordinary-startup read-only (no member spawn, no helper, no registry mutation)');
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    parseCrashPtySurvivorRegistry(raw, registryPath);
    console.log('[startup-recovery] PENDING valid-looking registry (read-only, no cleanup attempted, no helper invoked)');
  } catch {
    console.log('[startup-recovery] ALERT malformed-or-missing registry (read-only, no cleanup attempted, no helper invoked)');
  }
  console.log('[startup-recovery] ALERT prior session may still be running and must be reviewed - no new member started (read-only, no cleanup attempted, no helper invoked, no registry mutation)');
  console.log(`[startup-recovery] NO-MEMBER no-pty-spawn no-duplicate-launch spawnCount=${spawnCount} (member spawn paused)`);
  console.log('[startup-recovery] NO-HELPER no-verified-stop-invoked no-recovery-call (ordinary gate never calls runCrashPtySurvivorRecovery)');
  console.log('[startup-recovery] PAUSED no-new-member prototype-paused (mock feasibility prototype, not production-ready)');
  startupRecoveryWindow = createStartupRecoveryStatusWindow();
  if (!alertSmoke) {
    console.log('[startup-recovery] STATUS-VISIBLE paused alert window shown; close the window to quit; no member will start');
    return;
  }
  const w = startupRecoveryWindow;
  if (w === null) {
    console.error('[startup-recovery-alert-smoke] FAIL: status window missing (no pass)');
    app.exit(1);
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('status window load timeout')), 15000);
      try {
        if (w.webContents.isLoading()) {
          w.webContents.once('did-finish-load', () => {
            clearTimeout(timer);
            resolve();
          });
        } else {
          setTimeout(() => {
            clearTimeout(timer);
            resolve();
          }, 500);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err as Error);
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const visible = w.isVisible();
    console.log(`[startup-recovery-alert-smoke] VISIBLE isVisible=${visible}`);
    let domText = '';
    try {
      const result: unknown = await w.webContents.executeJavaScript(
        "(document.getElementById('startup-recovery-status')?.innerText ?? document.body.innerText ?? '')",
      );
      domText = typeof result === 'string' ? result : String(result ?? '');
    } catch (err) {
      console.error(`[startup-recovery-alert-smoke] INCONCLUSIVE: DOM inspection failed: ${(err as Error).message} (no pass)`);
      app.exit(2);
      return;
    }
    console.log(`[startup-recovery-alert-smoke] DOM length=${domText.length}`);
    const hasAlertText =
      /may still be running/i.test(domText) && /must be reviewed/i.test(domText) && /no new member started/i.test(domText);
    const noCleanupClaim = !/cleanup was verified/i.test(domText) && !/could not be verified\/cleaned/i.test(domText);
    app.emit('activate');
    await new Promise((r) => setTimeout(r, 100));
    const statusWindowOnly = BrowserWindow.getAllWindows().length === 1 && startupRecoveryWindow === w;
    const noMember = term === null && spawnCount === 0 && statusWindowOnly;
    console.log(`[startup-recovery-alert-smoke] CHECK alertText=${hasAlertText} noCleanupClaim=${noCleanupClaim} noMember=${noMember} visible=${visible} spawnCount=${spawnCount} statusWindowOnly=${statusWindowOnly}`);
    if (!visible) {
      console.error('[startup-recovery-alert-smoke] INCONCLUSIVE: status window not visible on this host (no pass)');
      app.exit(2);
      return;
    }
    if (!hasAlertText || !noCleanupClaim || !noMember) {
      console.error('[startup-recovery-alert-smoke] FAIL: expected paused alert text with no-member and no cleanup claim (no pass)');
      app.exit(1);
      return;
    }
    console.log('[startup-recovery-alert-smoke] PASS paused alert window visible with no-member and no helper (read-only gate)');
    app.exit(0);
  } catch (err) {
    console.error(`[startup-recovery-alert-smoke] INCONCLUSIVE: ${(err as Error).message} (no pass)`);
    app.exit(2);
  }
}

interface LaunchSpec {
  command: string;
  args: string[];
  cwd: string;
}

/**
 * Default child command. Under plain Node, the current binary runs the mock
 * CLI directly. Under Electron, process.execPath is electron.exe (not a JS
 * runtime), so the mock CLI runs on `node` from PATH unless TIYE_S1_COMMAND
 * names an explicit binary.
 */
export function defaultCommand(): string {
  if (process.versions.electron !== undefined) return 'node';
  return process.execPath;
}

/**
 * node-pty's ConPTY backend does not search PATH, so bare command names
 * must be resolved to absolute paths before spawn. Explicit paths and
 * paths containing separators pass through untouched.
 */
export function resolveOnPath(cmd: string): string {
  if (path.isAbsolute(cmd) || cmd.includes('/') || cmd.includes('\\')) return cmd;
  if (process.platform === 'win32') {
    const out = child_process.spawnSync('where.exe', [cmd], { encoding: 'utf8' });
    if (out.error) throw out.error;
    const first = (out.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (first !== undefined) return first;
  }
  throw new Error(`Executable not found on PATH: ${cmd}`);
}

/**
 * Launch resolution. Default: scripted local mock CLI (no vendor CLI,
 * no network model). Override without editing source for manual S1 checks:
 *   TIYE_S1_COMMAND  executable (default: current node, or `node` on PATH
 *                    when hosted by Electron, running the mock CLI)
 *   TIYE_S1_ARGS_JSON  JSON string array (default: mock-cli path, or empty
 *                      when TIYE_S1_COMMAND is explicitly set)
 *   TIYE_S1_CWD      working directory (default: process cwd)
 */
export function resolveLaunch(): LaunchSpec {
  const cwd = process.env.TIYE_S1_CWD?.trim() || process.cwd();
  const explicitCommand = process.env.TIYE_S1_COMMAND?.trim() || '';
  const command = resolveOnPath(explicitCommand || defaultCommand());
  let args: string[];
  if (process.env.TIYE_S1_ARGS_JSON !== undefined) {
    const parsed: unknown = JSON.parse(process.env.TIYE_S1_ARGS_JSON);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
      throw new Error('TIYE_S1_ARGS_JSON must be a JSON array of strings');
    }
    args = parsed;
  } else if (explicitCommand) {
    args = [];
  } else {
    args = [path.resolve(__dirname, '..', 'mock-cli', 'mock-cli.js')];
  }
  return { command, args, cwd };
}

function spawnMember(): pty.IPty {
  const { command, args, cwd } = resolveLaunch();
  console.log(`[s1] spawning: ${command} ${args.join(' ')} (cwd=${cwd})`);
  return pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });
}

// ---------------------------------------------------------------------------
// Headless smoke test: Electron runtime + node-pty + mock CLI, no window,
// no vendor CLI. Exercises spawn, banner, echo, unicode echo, resize, exit.
// ---------------------------------------------------------------------------
async function runSmokeTest(): Promise<number> {
  const term = spawnMember();
  let buffer = '';
  let exited: { exitCode: number } | null = null;
  term.onData((d: string) => {
    buffer += d;
  });
  term.onExit(({ exitCode }) => {
    exited = { exitCode };
  });

  const waitFor = (re: RegExp, timeoutMs: number, label: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (re.test(buffer)) {
          clearInterval(timer);
          console.log(`[smoke] ok: ${label}`);
          resolve();
        } else if (exited !== null) {
          clearInterval(timer);
          reject(new Error(`${label}: PTY exited early (code ${(exited as { exitCode: number }).exitCode})`));
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`${label}: timeout waiting for ${re}`));
        }
      }, 50);
    });

  try {
    await waitFor(/mock-cli/i, 15000, 'banner');
    term.write('hello s1\r');
    await waitFor(/echo: hello s1/, 10000, 'ascii echo');
    // NB: the line must not start with a mock-cli command word.
    term.write('say \u0645\u0631\u062D\u0628\u0627 \u4F60\u597D \u3053\u3093\u306B\u3061\u306F \uC548\uB155\r');
    await waitFor(/echo: say/, 10000, 'unicode echo');
    term.resize(100, 30);
    console.log('[smoke] ok: resize(100,30)');
    term.write('fast 5\r');
    await waitFor(/fast 5\/5/, 10000, 'fast output');
    term.write('exit\r');
    const exitWait = new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (exited !== null) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 10000) {
          clearInterval(timer);
          reject(new Error('exit: timeout waiting for PTY exit'));
        }
      }, 50);
    });
    await exitWait;
    const code = (exited as unknown as { exitCode: number }).exitCode;
    console.log(`[smoke] ok: exit code ${code}`);
    if (code !== 0) throw new Error(`expected exit code 0, got ${code}`);
    console.log('[smoke] PASS');
    return 0;
  } catch (err) {
    console.error(`[smoke] FAIL: ${(err as Error).message}`);
    try {
      term.kill();
    } catch {
      /* already gone */
    }
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Window + lifecycle mode: ONE main-owned member session across
// BrowserWindow recreation (S1 9a-9d). The PTY is never tied to a window.
// ---------------------------------------------------------------------------
let win: BrowserWindow | null = null;
let term: pty.IPty | null = null;
let rendererReady = false;
let ptyExitCode: number | null = null;
let pendingOutput = '';
let pendingOutputTruncated = false;
let ipcRegistered = false;

// Member-session identity. spawnCount is monotonic: it must stay 1 across
// Keep Running close + reopen + core re-subscribe (no duplicate spawn).
let spawnCount = 0;
let sessionId: string | null = null;
let gracefulShutdownRequested = false;

// Window-close / tray state.
let keepRunning = false;
let isQuitting = false;
let allowClose = false;
let lifecycleTestMode = false;
let crashBaselineMode = false;
let crashJobMode = false;
let crashSurvivorMode = false;
let crashPtySurvivorMode = false;
let tray: Tray | null = null;
let stopPromise: Promise<ShutdownResult> | null = null;

// Separate mock-core OS process for S1 9b only. No team engine: the core
// merely (re-)subscribes to the main-owned PTY session over a narrow stdio
// JSON-lines IPC (SUBSCRIBE/READY out, SUBSCRIBED/SHUTDOWN in). Main keeps
// owning the single member PTY across core restarts.
let coreChild: child_process.ChildProcess | null = null;
let coreId: string | null = null;
let corePid: number | undefined = undefined;
let coreExitCode: number | null = null;

function fromWindow(event: IpcMainEvent): boolean {
  return win !== null && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
}

/** Spawn the member PTY once; later calls reuse the live session. */
function ensureMember(): pty.IPty {
  if (term !== null) return term;
  term = spawnMember();
  spawnCount += 1;
  sessionId = `s1-${Date.now().toString(36)}-${spawnCount}-pid${term.pid}`;
  ptyExitCode = null;
  gracefulShutdownRequested = false;
  console.log(`[s1] member session ${sessionId} (spawn #${spawnCount}, pid ${term.pid})`);
  term.onData((data: string) => {
    if (win !== null && rendererReady) {
      win.webContents.send(CHANNELS.DATA, data);
    } else {
      pendingOutput += data;
      if (pendingOutput.length > MAX_PENDING_OUTPUT) {
        pendingOutput = pendingOutput.slice(-MAX_PENDING_OUTPUT);
        pendingOutputTruncated = true;
      }
    }
  });
  term.onExit(({ exitCode, signal }) => {
    ptyExitCode = exitCode;
    if (win !== null) win.webContents.send(CHANNELS.EXIT, { exitCode, signal });
  });
  return term;
}

function memberIdentity(): { sessionId: string | null; pid: number | undefined; spawnCount: number } {
  return { sessionId, pid: term?.pid, spawnCount };
}

function isMemberAlive(): boolean {
  return term !== null && ptyExitCode === null;
}

/** Narrow validated IPC, registered exactly once across window recreation. */
function registerIpcOnce(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on(CHANNELS.READY, (event) => {
    if (!fromWindow(event)) return;
    rendererReady = true;
    if (win !== null && pendingOutput !== '') {
      const prefix = pendingOutputTruncated ? '\r\n[earlier output omitted while window was closed]\r\n' : '';
      win.webContents.send(CHANNELS.DATA, prefix + pendingOutput);
      pendingOutput = '';
      pendingOutputTruncated = false;
    }
  });
  ipcMain.on(CHANNELS.INPUT, (event, data: unknown) => {
    if (fromWindow(event) && term !== null && isValidInput(data)) term.write(data);
  });
  ipcMain.on(CHANNELS.RESIZE, (event, size: unknown) => {
    if (fromWindow(event) && term !== null && isValidResize(size)) term.resize(size.cols, size.rows);
  });
}

/** Legacy entry used by the window smoke path. */
function attachTerminal(): void {
  ensureMember();
  registerIpcOnce();
}

function createWindow(options?: { show?: boolean }): void {
  rendererReady = false;
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    show: options?.show ?? true,
    title: 'TIYE S1 terminal prototype',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', (event) => {
    if (isQuitting || allowClose || lifecycleTestMode) return;
    if (!isMemberAlive()) return; // PTY already exited: nothing to keep.
    event.preventDefault();
    void askCloseChoice();
  });
  win.on('closed', () => {
    // The PTY is main-owned and intentionally survives window recreation.
    win = null;
  });
}

/** Visible close choice for interactive use: Keep Running or Stop. */
async function askCloseChoice(): Promise<void> {
  if (win === null || !isMemberAlive()) return;
  const target = win;
  const res = await dialog.showMessageBox(target, {
    type: 'question',
    buttons: ['Keep Running', 'Stop'],
    defaultId: 0,
    cancelId: 0, // dismiss (Esc/X) keeps running: the safe direction.
    message: 'Member CLI is still running.',
    detail: 'Keep Running retains the PTY and adds a tray menu (Open, Quit). Stop requests graceful CLI shutdown, then quits.',
  });
  if (res.response === 0) {
    keepRunning = true;
    if (!ensureTray()) {
      keepRunning = false;
      dialog.showErrorBox('TIYE S1: tray unavailable', 'The member cannot be kept running without a tray. The window will stay open.');
      return;
    }
    allowClose = true;
    try {
      target.close();
    } finally {
      allowClose = false;
    }
  } else {
    await requestStop('window-stop');
  }
}

/** Tray with Open (reattach) and Quit (stop-all). Created on Keep Running. */
function ensureTray(): boolean {
  if (tray !== null) {
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
    return true;
  }
  try {
    // Visible 16x16 blue tile with a white T.
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR4nGOQi1vxnxLMMLgMIBYMYgPQMTYNJAXiqAGDwQA5uucFcgwAAL2AdGty3NveAAAAAElFTkSuQmCC',
    );
    if (icon.isEmpty()) throw new Error('tray icon failed to decode');
    tray = new Tray(icon);
    tray.setToolTip('TIYE S1 terminal (member running)');
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
    return true;
  } catch (err) {
    console.error(`[s1] tray unavailable: ${(err as Error).message}`);
    destroyTray();
    return false;
  }
}

function trayTemplate(): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: 'Open',
      click: () => {
        openWindowFromTray();
      },
    },
    {
      label: 'Quit',
      click: () => {
        void requestStop('tray-quit');
      },
    },
  ];
}

function destroyTray(): void {
  try {
    tray?.destroy();
  } catch {
    /* already gone */
  }
  tray = null;
}

/** Open (or focus) a window and reattach its renderer to the live PTY. */
function openWindowFromTray(): void {
  if (win !== null) {
    if (win.isMinimized()) win.restore();
    win.focus();
    return;
  }
  keepRunning = false;
  createWindow();
}

function waitForExit(timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (ptyExitCode !== null) {
        clearInterval(timer);
        resolve(ptyExitCode);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 50);
  });
}

/**
 * Request graceful CLI shutdown by sending the mock CLI's `exit` command
 * through the PTY (never by killing a PID). If the child does not exit in
 * time, fall back to term.kill(). A kill() fallback only signals the PTY
 * host; it is NOT evidence that a whole process tree died.
 */
interface ShutdownResult {
  exited: boolean;
  exitCode: number | null;
  graceful: boolean;
}

async function requestGracefulShutdown(timeoutMs: number): Promise<ShutdownResult> {
  if (term === null) return { exited: true, exitCode: ptyExitCode, graceful: gracefulShutdownRequested };
  if (ptyExitCode !== null) return { exited: true, exitCode: ptyExitCode, graceful: gracefulShutdownRequested };
  gracefulShutdownRequested = true;
  try {
    term.write('exit\r');
  } catch (err) {
    console.error(`[s1] graceful write failed: ${(err as Error).message}`);
  }
  const code = await waitForExit(timeoutMs);
  if (code !== null) return { exited: true, exitCode: code, graceful: true };
  console.error('[s1] graceful shutdown timed out; falling back to term.kill() (does not prove tree death)');
  try {
    term.kill();
  } catch {
    /* already gone */
  }
  const code2 = await waitForExit(3000);
  return { exited: code2 !== null, exitCode: code2, graceful: false };
}

/** Stop (window choice) and Quit (tray) share one graceful stop-all path. */
function requestStop(reason: 'window-stop' | 'tray-quit'): Promise<ShutdownResult> {
  if (stopPromise !== null) return stopPromise;
  isQuitting = true;
  keepRunning = false;
  stopPromise = (async () => {
    const result = await requestGracefulShutdown(10000);
    console.log(`[s1] stop (${reason}): graceful=${result.graceful} exited=${result.exited} code=${result.exitCode}`);
    if (!result.exited) {
      isQuitting = false;
      stopPromise = null;
      if (!lifecycleTestMode) {
        dialog.showErrorBox('TIYE S1: member still running', 'The member did not exit. Keep the app open and try stopping it again.');
      }
      return result;
    }
    // Stop-all also asks the mock-core process to exit itself. A core
    // that ignores SHUTDOWN + stdin close is a failure, not a stop: stay
    // open (same as the PTY path above) rather than orphan it silently.
    // There is deliberately no kill fallback for the core.
    const coreResult = await stopMockCore(5000);
    console.log(`[s1] stop (${reason}): mock-core exited=${coreResult.exited} code=${coreResult.exitCode}`);
    if (!coreResult.exited) {
      isQuitting = false;
      stopPromise = null;
      if (!lifecycleTestMode) {
        dialog.showErrorBox('TIYE S1: mock core still running', 'The mock core did not exit after SHUTDOWN. The app stays open so the live core process is not orphaned; try stopping again.');
      }
      return result;
    }
    destroyTray();
    if (!lifecycleTestMode) app.quit();
    return result;
  })();
  return stopPromise;
}

/** Drop the exited member so a fresh session can start (smoke only). */
function resetMemberAfterExit(): void {
  if (ptyExitCode === null) throw new Error('resetMemberAfterExit: member still alive');
  if (coreChild !== null) throw new Error('resetMemberAfterExit: mock-core still running (stop it first)');
  term = null;
  sessionId = null;
  pendingOutput = '';
  pendingOutputTruncated = false;
  isQuitting = false;
  stopPromise = null;
}

// --- Separate mock-core OS process (S1 9b) ----------------------------------
// Narrow stdio JSON-lines IPC. Main owns the member PTY; the core process
// only subscribes. No network, no team engine, and no force-kill fallback
// for the core: shutdown is requested with a SHUTDOWN line plus stdin
// close (the core exits itself), the actual exit event is observed, and a
// core that does not exit is reported as a failure with its handle
// retained — never silently treated as stopped.
const CORE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CORE_LINE_LIMIT = 65536;

export interface CoreSubscribeInfo {
  coreId: string;
  corePid: number | undefined;
  sessionId: string | null;
  pid: number | undefined;
  spawnCount: number;
  reused: boolean;
}

function isValidCoreId(id: unknown): id is string {
  return typeof id === 'string' && CORE_ID_RE.test(id);
}

function coreScriptPath(): string {
  return path.resolve(__dirname, '..', 'mock-core', 'mock-core.js');
}

function resolveCoreNode(): string {
  if (process.versions.electron !== undefined) return resolveOnPath('node');
  return process.execPath;
}

function isCoreAlive(): boolean {
  return coreChild !== null && coreExitCode === null;
}

function waitForCoreExit(child: child_process.ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        resolve(child.exitCode);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 50);
  });
}

/**
 * Start a real separate mock-core OS process and subscribe it to the
 * current main-owned member session. Resolves after the SUBSCRIBE /
 * SUBSCRIBED / READY round-trip; rejects without spawning a duplicate
 * member PTY on any failure.
 */
function startMockCore(id: string): Promise<CoreSubscribeInfo> {
  if (coreChild !== null) throw new Error('startMockCore: a mock-core process is already running (stop it first)');
  if (!isValidCoreId(id)) throw new Error(`startMockCore: invalid coreId ${JSON.stringify(id)}`);
  const before = spawnCount;
  ensureMember();
  registerIpcOnce();
  const script = coreScriptPath();
  if (!fs.existsSync(script)) throw new Error(`mock-core script missing: ${script}`);
  const nodeBin = resolveCoreNode();
  console.log(`[s1] starting mock-core ${id}: ${nodeBin} ${script}`);
  const child = child_process.spawn(nodeBin, [script, id], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  coreChild = child;
  coreExitCode = null;
  coreId = null;
  corePid = undefined;
  child.stderr?.on('data', (d: Buffer) => {
    process.stderr.write(d);
  });
  child.on('exit', (code) => {
    coreExitCode = code;
    if (child === coreChild && coreExitCode !== null) {
      console.log(`[s1] mock-core exited (code ${coreExitCode})`);
    }
  });
  child.on('error', (err) => {
    console.error(`[s1] mock-core spawn error: ${(err as Error).message}`);
  });

  return new Promise<CoreSubscribeInfo>((resolve, reject) => {
    let settled = false;
    let outBuf = '';
    const subscribeTimer = setTimeout(
      () => failHandshake(`mock-core ${id}: timeout waiting for SUBSCRIBE/READY`),
      15000,
    );
    const cleanupLineListener = (): void => {
      child.stdout?.removeAllListeners('data');
    };
    // Handshake failure: no force-kill (ChildProcess.kill() would target
    // the child's PID without identity-verified tree cleanup). Close the
    // stdin pipe so the core exits itself, keep the child handle so later
    // checks observe the real exit event instead of a pretended stop.
    const failHandshake = (msg: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(subscribeTimer);
      cleanupLineListener();
      try {
        child.stdin?.end();
      } catch {
        /* pipe already gone */
      }
      try {
        child.stdin?.destroy();
      } catch {
        /* ignore */
      }
      // coreChild/coreExitCode intentionally retained: isCoreAlive() keeps
      // reporting the true state until the actual 'exit' event arrives.
      reject(new Error(msg));
    };
    const succeed = (info: CoreSubscribeInfo): void => {
      if (settled) return;
      settled = true;
      coreId = id;
      corePid = child.pid;
      resolve(info);
    };
    const clearTimer = (): void => {
      clearTimeout(subscribeTimer);
    };
    const onLine = (raw: string): void => {
      if (settled) return;
      if (raw.length > CORE_LINE_LIMIT) {
        console.error(`[s1] mock-core: oversized line dropped (${raw.length} chars)`);
        return;
      }
      if (raw.trim() === '') return;
      let msg: unknown;
      try {
        msg = JSON.parse(raw);
      } catch {
        console.error(`[s1] mock-core: invalid JSON dropped: ${raw.slice(0, 120)}`);
        return;
      }
      if (typeof msg !== 'object' || msg === null || (msg as { type?: unknown }).type === undefined) return;
      const type = (msg as { type: unknown }).type;
      if (type === 'SUBSCRIBE') {
        const body = msg as { coreId?: unknown; corePid?: unknown };
        if (body.coreId !== id) {
          failHandshake(`mock-core SUBSCRIBE coreId mismatch (got ${JSON.stringify(body.coreId)}, want ${id})`);
          return;
        }
        const payload = JSON.stringify({
          type: 'SUBSCRIBED',
          coreId: id,
          sessionId,
          memberPid: term?.pid ?? null,
          spawnCount,
          reused: spawnCount === before,
        });
        try {
          child.stdin?.write(payload + '\n');
        } catch (err) {
          failHandshake(`mock-core SUBSCRIBED write failed: ${(err as Error).message}`);
        }
        return;
      }
      if (type === 'READY') {
        const body = msg as { coreId?: unknown };
        if (body.coreId !== id) {
          failHandshake(`mock-core READY coreId mismatch (got ${JSON.stringify(body.coreId)}, want ${id})`);
          return;
        }
        clearTimer();
        cleanupLineListener();
        // Keep stderr forwarding; drop further stdout protocol lines (BYE).
        child.stdout?.on('data', (d: Buffer) => {
          const text = d.toString('utf8');
          for (const line of text.split('\n')) {
            if (line.trim() !== '') console.log(`[s1] mock-core stdout: ${line.slice(0, 200)}`);
          }
        });
        succeed({
          coreId: id,
          corePid: child.pid,
          sessionId,
          pid: term?.pid,
          spawnCount,
          reused: spawnCount === before,
        });
        return;
      }
      if (type === 'BYE') {
        console.log(`[s1] mock-core BYE: ${raw.slice(0, 200)}`);
        return;
      }
      console.error(`[s1] mock-core: unknown type dropped: ${String(type).slice(0, 40)}`);
    };
    child.stdout?.on('data', (d: Buffer) => {
      outBuf += d.toString('utf8');
      let idx: number;
      while ((idx = outBuf.indexOf('\n')) >= 0) {
        const line = outBuf.slice(0, idx).replace(/\r$/, '');
        outBuf = outBuf.slice(idx + 1);
        onLine(line);
        if (settled) break;
      }
    });
    child.on('exit', (code) => {
      clearTimer();
      if (!settled) failHandshake(`mock-core ${id} exited before READY (code ${code})`);
    });
  });
}

/**
 * Ask the mock-core process to exit itself: SHUTDOWN line, then stdin
 * close (the core exits 0 on either). The actual exit event is observed.
 * No force-kill fallback: ChildProcess.kill() would target the child's PID
 * without identity-verified tree cleanup, so on timeout this reports
 * { exited: false } and retains the child handle — callers must treat the
 * core as still alive rather than as stopped.
 */
async function stopMockCore(timeoutMs = 5000): Promise<{ exited: boolean; exitCode: number | null }> {
  const child = coreChild;
  if (child === null) return { exited: true, exitCode: coreExitCode };
  try {
    child.stdin?.write(JSON.stringify({ type: 'SHUTDOWN' }) + '\n');
  } catch (err) {
    console.error(`[s1] mock-core SHUTDOWN write failed: ${(err as Error).message}`);
  }
  try {
    child.stdin?.end();
  } catch {
    /* pipe already gone; the exit event below still decides */
  }
  const code = await waitForCoreExit(child, timeoutMs);
  if (code === null) {
    // No kill fallback by design (see above). Keep coreChild/coreId so
    // isCoreAlive() stays true and resetMemberAfterExit() refuses to
    // pretend the session is clean.
    console.error('[s1] mock-core did not exit after SHUTDOWN + stdin close; reporting failure, core handle retained (no force-kill)');
    return { exited: false, exitCode: null };
  }
  if (child === coreChild) {
    coreChild = null;
    coreId = null;
    corePid = undefined;
    coreExitCode = code;
  }
  try {
    child.stdin?.destroy();
  } catch {
    /* ignore */
  }
  return { exited: true, exitCode: code };
}

// ---------------------------------------------------------------------------
// Lifecycle smoke (S1 9a-9e, plus 9b re-subscribe): all steps run inside the
// main process via internal hooks — no dialog clicks, no tray clicks.
// Proves with the local mock CLI that Keep Running preserves the same PTY
// PID/session identity through close+reopen (spawn # stays 1), that a
// separate mock-core OS process restart re-subscribes without a duplicate
// spawn (core PID changes, member session/PID/spawn # unchanged), and that
// Stop and Quit each request graceful shutdown (child exits 0 after `exit`).
// Step 9e (Windows only): the member tree rooted at the PTY PID is captured
// before each Stop/Quit as PID + Windows creation-time identities, then
// re-enumerated read-only after the stop; any surviving identity fails the
// smoke. No process is terminated as part of 9e. On non-Windows 9e is
// skipped without claiming a pass. PTY exit code 0 alone is NOT cited as
// tree-death proof; only the 9e re-enumeration is.
// ---------------------------------------------------------------------------
async function runLifecycleSmoke(): Promise<number> {
  lifecycleTestMode = true;
  const tap: { text: string } = { text: '' };
  const fail = (msg: string): number => {
    console.error(`[lifecycle-smoke] FAIL: ${msg}`);
    return 1;
  };
  const waitForTap = (re: RegExp, timeoutMs: number, label: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (re.test(tap.text)) {
          clearInterval(timer);
          console.log(`[lifecycle-smoke] ok: ${label}`);
          resolve();
        } else if (ptyExitCode !== null && !re.test(tap.text) && Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`${label}: PTY exited (code ${ptyExitCode}) before match`));
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`${label}: timeout waiting for ${re}`));
        }
      }, 50);
    });
  const waitForReady = (timeoutMs: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (rendererReady) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('renderer READY not received'));
        }
      }, 100);
    });
  const waitForWindowClosed = (timeoutMs: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (win === null) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('window did not close'));
        }
      }, 50);
    });

  try {
    // 9b setup: start a real separate mock-core OS process; it subscribes
    // to the current main-owned member session over stdio JSON-lines IPC.
    const sub1 = await startMockCore('mock-core-1');
    if (term === null) return fail('member PTY not spawned');
    term.onData((d: string) => {
      tap.text += d;
    });
    const pidA = sub1.pid;
    const sessionA = sub1.sessionId;
    const corePid1 = sub1.corePid;
    if (corePid1 === undefined) return fail('mock-core-1 has no OS PID');
    console.log(`[lifecycle-smoke] ok: core subscribed (core=${sub1.coreId} corePid=${corePid1} session=${sessionA} pid=${pidA} spawn#${sub1.spawnCount})`);
    if (sub1.spawnCount !== 1) return fail(`expected spawn #1, got ${sub1.spawnCount}`);
    if (!isCoreAlive()) return fail('mock-core-1 not alive after subscribe');

    // Open the first hidden window and prove renderer attach.
    createWindow({ show: false });
    await waitForReady(20000);
    console.log('[lifecycle-smoke] ok: window 1 renderer READY (reattach target)');
    await waitForTap(/mock-cli/i, 15000, 'banner on window 1');

    // 9a Keep Running: close the window, keep the PTY.
    keepRunning = true;
    if (!ensureTray() || tray === null) return fail('tray creation failed');
    const labels = trayTemplate().map((item) => item.label);
    if (!labels.includes('Open') || !labels.includes('Quit')) return fail('tray menu missing Open/Quit');
    console.log(`[lifecycle-smoke] ok: tray created with ${labels.join('+')} menu`);
    if (win === null) return fail('window 1 missing before close');
    win.close();
    await waitForWindowClosed(10000);
    const afterClose = memberIdentity();
    if (afterClose.pid !== pidA || afterClose.sessionId !== sessionA) {
      return fail(`session identity changed across Keep Running close (before pid=${pidA} session=${sessionA}; after pid=${afterClose.pid} session=${afterClose.sessionId})`);
    }
    if (afterClose.spawnCount !== 1) return fail(`duplicate spawn across close (spawn #${afterClose.spawnCount})`);
    if (!isMemberAlive()) return fail('PTY died on Keep Running close');
    console.log(`[lifecycle-smoke] ok: 9a Keep Running preserved session=${afterClose.sessionId} pid=${afterClose.pid} spawn#${afterClose.spawnCount}`);

    // Reopen: new window reattaches to the SAME PTY, no new spawn.
    tap.text = '';
    openWindowFromTray();
    if (term?.pid !== pidA) return fail('PTY replaced on reopen');
    await waitForReady(20000);
    // Drive input through the NEW renderer's preload bridge (main-validated).
    await win!.webContents.executeJavaScript(`window.tiyeTerminal.sendInput('hello reopen\\r')`);
    await waitForTap(/echo: hello reopen/, 10000, 'new renderer input reached the same PTY');
    const afterReopen = memberIdentity();
    if (afterReopen.pid !== pidA || afterReopen.sessionId !== sessionA || afterReopen.spawnCount !== 1) {
      return fail(`reopen changed session (pid=${afterReopen.pid} session=${afterReopen.sessionId} spawn#${afterReopen.spawnCount})`);
    }
    console.log('[lifecycle-smoke] ok: Open reattached to same PTY, no duplicate spawn');

    // 9b: stop the mock-core OS process and restart it as a NEW process
    // while main retains the PTY; the new core re-subscribes to the same
    // live member session (core PID changes, member identity unchanged).
    const stopped1 = await stopMockCore(5000);
    if (!stopped1.exited) return fail('mock-core-1 did not exit on SHUTDOWN');
    if (isCoreAlive()) return fail('mock-core-1 still alive after stop');
    console.log(`[lifecycle-smoke] ok: mock-core-1 stopped (exit ${stopped1.exitCode})`);
    const sub2 = await startMockCore('mock-core-2');
    if (sub2.corePid === undefined) return fail('mock-core-2 has no OS PID');
    if (sub2.corePid === corePid1) {
      return fail(`core process identity did not change across restart (still corePid=${sub2.corePid})`);
    }
    if (sub2.coreId === 'mock-core-1') return fail('core id did not change across restart');
    if (sub2.pid !== pidA || sub2.sessionId !== sessionA) {
      return fail(`core re-subscribe landed on a different session (pid=${sub2.pid} session=${sub2.sessionId})`);
    }
    if (sub2.spawnCount !== 1 || !sub2.reused) {
      return fail(`core restart spawned a duplicate (spawn #${sub2.spawnCount})`);
    }
    tap.text = '';
    if (term === null) return fail('PTY gone after core restart');
    term.write('hello core2\r');
    await waitForTap(/echo: hello core2/, 10000, 'pty alive after core restart');
    console.log(`[lifecycle-smoke] ok: 9b core restart re-subscribed as new OS process (corePid ${corePid1} -> ${sub2.corePid}), same session=${sub2.sessionId} pid=${sub2.pid} spawn#${sub2.spawnCount}, no second CLI process`);

    // 9c Stop: graceful shutdown requested through the PTY, then session ends.
    // 9e (Windows only): capture the member tree as PID+creation identities
    // before Stop, re-enumerate read-only after Stop. Any survivor fails.
    if (win === null) return fail('window missing before Stop');
    win.close();
    await waitForWindowClosed(10000);
    let tree9c: ProcessIdentity[] | null = null;
    if (isProcessTreeCheckSupported()) {
      const rootPid = term?.pid;
      if (rootPid === undefined) return fail('9e capture before 9c: member PID missing');
      try {
        tree9c = await captureProcessTree(rootPid);
        console.log(`[lifecycle-smoke] ok: 9e captured ${tree9c.length} identit(ies) before 9c Stop (root pid=${rootPid}): ${tree9c.map(formatIdentity).join('; ')}`);
      } catch (err) {
        return fail(`9e capture before 9c Stop failed: ${(err as Error).message}`);
      }
    } else {
      console.log(`[lifecycle-smoke] skip: 9e process-tree check unsupported on ${process.platform} (no pass claimed for 9e)`);
    }
    const stop = await requestStop('window-stop');
    if (!gracefulShutdownRequested) return fail('Stop did not flag a graceful shutdown request');
    if (!stop.exited || stop.exitCode !== 0 || !stop.graceful) {
      return fail(`Stop did not end gracefully (exited=${stop.exited} code=${stop.exitCode} graceful=${stop.graceful})`);
    }
    console.log(`[lifecycle-smoke] ok: 9c Stop requested graceful shutdown, pty exit ${stop.exitCode}`);
    if (tree9c !== null) {
      try {
        const check9c = await verifyIdentitiesGone(tree9c);
        if (check9c.survivors.length > 0) {
          return fail(`9e after 9c Stop: ${check9c.survivors.length} survivor(s): ${check9c.survivors.map(formatIdentity).join('; ')}`);
        }
        console.log(`[lifecycle-smoke] ok: 9e after 9c Stop all ${tree9c.length} captured identities gone (attempts=${check9c.attempts}, read-only, nothing terminated)`);
      } catch (err) {
        return fail(`9e verification after 9c Stop failed: ${(err as Error).message}`);
      }
    }
    if (isCoreAlive()) return fail('mock-core-2 still alive after Stop (stop-all must end the core)');
    resetMemberAfterExit();

    // 9d Quit (stop-all path): fresh member, then tray-quit graceful path.
    tap.text = '';
    const sub3 = await startMockCore('mock-core-3');
    if (term === null) return fail('fresh member PTY not spawned');
    term.onData((d: string) => {
      tap.text += d;
    });
    const pidB = sub3.pid;
    if (sub3.corePid === undefined) return fail('mock-core-3 has no OS PID');
    console.log(`[lifecycle-smoke] ok: fresh member for Quit path (core=${sub3.coreId} corePid=${sub3.corePid} session=${sub3.sessionId} pid=${pidB} spawn#${sub3.spawnCount})`);
    createWindow({ show: false });
    await waitForReady(20000);
    await waitForTap(/mock-cli/i, 15000, 'banner on fresh member');
    let tree9d: ProcessIdentity[] | null = null;
    if (isProcessTreeCheckSupported()) {
      const rootPid = term?.pid;
      if (rootPid === undefined) return fail('9e capture before 9d: member PID missing');
      try {
        tree9d = await captureProcessTree(rootPid);
        console.log(`[lifecycle-smoke] ok: 9e captured ${tree9d.length} identit(ies) before 9d Quit (root pid=${rootPid}): ${tree9d.map(formatIdentity).join('; ')}`);
      } catch (err) {
        return fail(`9e capture before 9d Quit failed: ${(err as Error).message}`);
      }
    } else {
      console.log(`[lifecycle-smoke] skip: 9e process-tree check unsupported on ${process.platform} (no pass claimed for 9e)`);
    }
    const quit = await requestStop('tray-quit');
    if (!quit.exited || quit.exitCode !== 0 || !quit.graceful) {
      return fail(`Quit path did not end gracefully (exited=${quit.exited} code=${quit.exitCode} graceful=${quit.graceful})`);
    }
    if (isCoreAlive()) return fail('mock-core-3 still alive after tray-Quit (stop-all must end the core)');
    console.log(`[lifecycle-smoke] ok: 9d tray-Quit stop-all requested graceful shutdown, pty exit ${quit.exitCode}`);
    if (tree9d !== null) {
      try {
        const check9d = await verifyIdentitiesGone(tree9d);
        if (check9d.survivors.length > 0) {
          return fail(`9e after 9d Quit: ${check9d.survivors.length} survivor(s): ${check9d.survivors.map(formatIdentity).join('; ')}`);
        }
        console.log(`[lifecycle-smoke] ok: 9e after 9d Quit all ${tree9d.length} captured identities gone (attempts=${check9d.attempts}, read-only, nothing terminated)`);
      } catch (err) {
        return fail(`9e verification after 9d Quit failed: ${(err as Error).message}`);
      }
    }
    console.log('[lifecycle-smoke] PASS');
    return 0;
  } catch (err) {
    try {
      await stopMockCore(3000);
    } catch {
      /* best-effort core cleanup on failure */
    }
    return fail((err as Error).message);
  }
}

/**
 * Headless window check: hidden BrowserWindow loads the real renderer
 * (sandboxed, preload bridge, xterm.js). Waits for the renderer's READY +
 * initial RESIZE (proving renderer→main IPC), lets output render, then
 * captures a screenshot (proving main→renderer data + xterm painting).
 */
async function runWindowSmoke(): Promise<number> {
  attachTerminal();
  createWindow({ show: false });
  if (win === null) throw new Error('window not created');

  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (rendererReady) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > 20000) {
        clearInterval(timer);
        reject(new Error('renderer READY not received'));
      }
    }, 100);
  });
  console.log('[window-smoke] ok: renderer READY + preload bridge alive');

  // Let the banner render, then end the child gracefully. A graceful exit
  // avoids node-pty's Windows console-list teardown race (AttachConsole
  // failure observed after term.kill() or app.exit with a live PTY).
  // xterm.js keeps the transcript, so the screenshot still proves rendering.
  await new Promise((r) => setTimeout(r, 2500));
  if (term === null) throw new Error('pty gone before graceful exit');
  // Drive the exit through the renderer's preload bridge (not term.write),
  // so the full loop renderer IPC -> main validation -> PTY is exercised.
  await win!.webContents.executeJavaScript(`window.tiyeTerminal.sendInput('exit\\r')`);
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (ptyExitCode !== null) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > 10000) {
        clearInterval(timer);
        reject(new Error('pty did not exit after graceful request'));
      }
    }, 100);
  });
  console.log(`[window-smoke] ok: pty exited gracefully (code ${ptyExitCode})`);

  await new Promise((r) => setTimeout(r, 1000));
  const image = await win!.webContents.capturePage();
  const shotPath = path.resolve(__dirname, '..', 'dist', 'smoke-shot.png');
  fs.writeFileSync(shotPath, image.toPNG());
  console.log(`[window-smoke] ok: screenshot ${shotPath} (${image.getSize().width}x${image.getSize().height})`);
  if (image.isEmpty()) throw new Error('screenshot is empty');
  console.log('[window-smoke] PASS');
  return 0;
}

// ---------------------------------------------------------------------------
// Crash-baseline probe (S1 step 9f BASELINE, feasibility only).
// No Job Object, no recovery state machine, no 9f pass claimed here.
// --crash-baseline: start the local mock CLI in a main-owned PTY, send its
// `tree` command, confirm a live root+descendant tree (>=2 distinct
// PID+CreationDate identities via the existing 9e helper), atomically write
// a small durable registry to TIYE_CRASH_REGISTRY_PATH, emit a structured
// READY line, then stay alive until the runner kills this Electron process.
// --crash-recovery-check: read that registry, re-enumerate by PID+creation
// identity, report survivors and pause (no duplicate launch, no PID kill).
// Exit codes for the recovery check: 0 = no survivors (OS already reaped
// the tree — record honestly, do NOT infer Job behavior), 1 = survivors
// present (expected without a job), 2 = harness failure (registry missing,
// malformed, or identity lookup failed — never a pass).
// The only forced termination in this slice is the runner killing its own
// runner-owned Electron ChildProcess via the handle (never taskkill /
// Stop-Process / PID-only kill, never a captured member PID).
// ---------------------------------------------------------------------------
interface CrashBaselineRegistry {
  schema: string;
  version: number;
  sessionId: string;
  memberId: string;
  rootPid: number;
  rootCreationTime: string;
  rootName: string;
  tree: ProcessIdentity[];
  lastIntent: string;
  createdAt: string;
  mainPid: number;
}

// Bounded S1 9f crash+job experiment (Windows mock-tree only, not the
// product guarantee). Same durable shape as the baseline plus explicit
// jobMode/controller identity fields and the recorded job-membership
// evidence (root + mock child must be VERIFIED inJob=true before READY).
// conhost.exe is best-effort: if it cannot be verified or sits outside the
// job, the run records a jobConhostNote and still proceeds, because ConPTY
// hosts have been observed outside the assigned job on some hosts.
interface CrashJobRegistry {
  schema: string;
  version: number;
  sessionId: string;
  memberId: string;
  rootPid: number;
  rootCreationTime: string;
  rootName: string;
  tree: ProcessIdentity[];
  lastIntent: string;
  createdAt: string;
  mainPid: number;
  jobMode: string;
  controllerPid: number;
  controllerCreationTime: string;
  jobFlags: string;
  jobVerified: ProcessIdentity[];
  jobConhostNote: string;
}

function getCrashRegistryPath(): string {
  const raw = (process.env[CRASH_REGISTRY_ENV] ?? '').trim();
  if (raw === '') throw new Error(`crash probe: ${CRASH_REGISTRY_ENV} is not set (runner must supply a test-specific registry path)`);
  return raw;
}

function writeRegistryAtomic(finalPath: string, data: CrashBaselineRegistry | CrashJobRegistry): void {
  const dir = path.dirname(finalPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, finalPath);
}

function parseCrashRegistry(rawText: string, source: string): CrashBaselineRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`crash recovery: registry at ${source} is not valid JSON (no pass)`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`crash recovery: registry at ${source} is malformed (expected object, no pass)`);
  const r = parsed as Record<string, unknown>;
  if (r['schema'] !== CRASH_REGISTRY_SCHEMA) throw new Error(`crash recovery: registry schema mismatch (want ${CRASH_REGISTRY_SCHEMA}, no pass)`);
  if (r['version'] !== CRASH_REGISTRY_VERSION) throw new Error(`crash recovery: registry version mismatch (want ${CRASH_REGISTRY_VERSION}, no pass)`);
  if (typeof r['sessionId'] !== 'string' || r['sessionId'] === '') throw new Error('crash recovery: registry sessionId missing/malformed (no pass)');
  if (typeof r['memberId'] !== 'string' || r['memberId'] === '') throw new Error('crash recovery: registry memberId missing/malformed (no pass)');
  if (!Number.isInteger(r['rootPid']) || (r['rootPid'] as number) <= 0) throw new Error('crash recovery: registry rootPid missing/malformed (no pass)');
  if (typeof r['rootCreationTime'] !== 'string' || r['rootCreationTime'] === '') throw new Error('crash recovery: registry rootCreationTime missing/malformed (no pass)');
  if (r['lastIntent'] !== 'run') throw new Error('crash recovery: registry lastIntent missing/invalid (no pass)');
  if (!Array.isArray(r['tree']) || r['tree'].length < 2) throw new Error(`crash recovery: registry tree must hold >=2 identities (got ${Array.isArray(r['tree']) ? (r['tree'] as unknown[]).length : 'non-array'}, no pass)`);
  const tree: ProcessIdentity[] = [];
  const seen = new Set<string>();
  for (const entry of r['tree'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error('crash recovery: registry tree entry malformed (no pass)');
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e['pid']) || (e['pid'] as number) <= 0) throw new Error('crash recovery: registry tree pid malformed (no pass)');
    if (!Number.isInteger(e['parentPid']) || (e['parentPid'] as number) < 0) throw new Error('crash recovery: registry tree parentPid malformed (no pass)');
    if (typeof e['creationTime'] !== 'string' || e['creationTime'] === '') throw new Error('crash recovery: registry tree creationTime malformed (no pass)');
    if (typeof e['name'] !== 'string' || e['name'] === '') throw new Error('crash recovery: registry tree name malformed (no pass)');
    const key = `${e['pid'] as number}|${e['creationTime'] as string}`;
    if (seen.has(key)) throw new Error('crash recovery: registry tree holds duplicate PID+creation identities (no pass)');
    seen.add(key);
    tree.push({ pid: e['pid'] as number, parentPid: e['parentPid'] as number, creationTime: e['creationTime'] as string, name: e['name'] as string });
  }
  const root = tree.find((id) => id.pid === r['rootPid'] && id.creationTime === r['rootCreationTime']);
  if (root === undefined) throw new Error('crash recovery: registry root identity is absent from captured tree (no pass)');
  if (typeof r['rootName'] !== 'string' || r['rootName'] !== root.name) throw new Error('crash recovery: registry root name mismatch (no pass)');
  if (typeof r['createdAt'] !== 'string' || !Number.isFinite(Date.parse(r['createdAt']))) throw new Error('crash recovery: registry createdAt missing/malformed (no pass)');
  if (!Number.isInteger(r['mainPid']) || (r['mainPid'] as number) <= 0) throw new Error('crash recovery: registry mainPid missing/malformed (no pass)');
  return {
    schema: CRASH_REGISTRY_SCHEMA,
    version: CRASH_REGISTRY_VERSION,
    sessionId: r['sessionId'] as string,
    memberId: r['memberId'] as string,
    rootPid: r['rootPid'] as number,
    rootCreationTime: r['rootCreationTime'] as string,
    rootName: r['rootName'] as string,
    tree,
    lastIntent: r['lastIntent'] as string,
    createdAt: r['createdAt'] as string,
    mainPid: r['mainPid'] as number,
  };
}

function getCrashJobRegistryPath(): string {
  const raw = (process.env[CRASH_JOB_REGISTRY_ENV] ?? '').trim();
  if (raw !== '') return raw;
  const fallback = (process.env[CRASH_REGISTRY_ENV] ?? '').trim();
  if (fallback !== '') return fallback;
  throw new Error(`crash-job probe: ${CRASH_JOB_REGISTRY_ENV} is not set (runner must supply a test-specific registry path)`);
}

function parseCrashJobRegistry(rawText: string, source: string): CrashJobRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`crash-job recovery: registry at ${source} is not valid JSON (no pass)`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`crash-job recovery: registry at ${source} is malformed (expected object, no pass)`);
  const r = parsed as Record<string, unknown>;
  if (r['schema'] !== CRASH_JOB_REGISTRY_SCHEMA) throw new Error(`crash-job recovery: registry schema mismatch (want ${CRASH_JOB_REGISTRY_SCHEMA}, no pass)`);
  if (r['version'] !== CRASH_JOB_REGISTRY_VERSION) throw new Error(`crash-job recovery: registry version mismatch (want ${CRASH_JOB_REGISTRY_VERSION}, no pass)`);
  if (typeof r['sessionId'] !== 'string' || r['sessionId'] === '') throw new Error('crash-job recovery: registry sessionId missing/malformed (no pass)');
  if (typeof r['memberId'] !== 'string' || r['memberId'] === '') throw new Error('crash-job recovery: registry memberId missing/malformed (no pass)');
  if (!Number.isInteger(r['rootPid']) || (r['rootPid'] as number) <= 0) throw new Error('crash-job recovery: registry rootPid missing/malformed (no pass)');
  if (typeof r['rootCreationTime'] !== 'string' || r['rootCreationTime'] === '') throw new Error('crash-job recovery: registry rootCreationTime missing/malformed (no pass)');
  if (r['lastIntent'] !== 'run') throw new Error('crash-job recovery: registry lastIntent missing/invalid (no pass)');
  if (!Array.isArray(r['tree']) || r['tree'].length < 2) throw new Error(`crash-job recovery: registry tree must hold >=2 identities (got ${Array.isArray(r['tree']) ? (r['tree'] as unknown[]).length : 'non-array'}, no pass)`);
  const tree: ProcessIdentity[] = [];
  const seen = new Set<string>();
  for (const entry of r['tree'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error('crash-job recovery: registry tree entry malformed (no pass)');
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e['pid']) || (e['pid'] as number) <= 0) throw new Error('crash-job recovery: registry tree pid malformed (no pass)');
    if (!Number.isInteger(e['parentPid']) || (e['parentPid'] as number) < 0) throw new Error('crash-job recovery: registry tree parentPid malformed (no pass)');
    if (typeof e['creationTime'] !== 'string' || e['creationTime'] === '') throw new Error('crash-job recovery: registry tree creationTime malformed (no pass)');
    if (typeof e['name'] !== 'string' || e['name'] === '') throw new Error('crash-job recovery: registry tree name malformed (no pass)');
    const key = `${e['pid'] as number}|${e['creationTime'] as string}`;
    if (seen.has(key)) throw new Error('crash-job recovery: registry tree holds duplicate PID+creation identities (no pass)');
    seen.add(key);
    tree.push({ pid: e['pid'] as number, parentPid: e['parentPid'] as number, creationTime: e['creationTime'] as string, name: e['name'] as string });
  }
  const root = tree.find((id) => id.pid === r['rootPid'] && id.creationTime === r['rootCreationTime']);
  if (root === undefined) throw new Error('crash-job recovery: registry root identity is absent from captured tree (no pass)');
  if (typeof r['rootName'] !== 'string' || r['rootName'] !== root.name) throw new Error('crash-job recovery: registry root name mismatch (no pass)');
  if (typeof r['createdAt'] !== 'string' || !Number.isFinite(Date.parse(r['createdAt']))) throw new Error('crash-job recovery: registry createdAt missing/malformed (no pass)');
  if (!Number.isInteger(r['mainPid']) || (r['mainPid'] as number) <= 0) throw new Error('crash-job recovery: registry mainPid missing/malformed (no pass)');
  if (r['jobMode'] !== 'job') throw new Error('crash-job recovery: registry jobMode missing/invalid (want "job", no pass)');
  if (!Number.isInteger(r['controllerPid']) || (r['controllerPid'] as number) <= 0) throw new Error('crash-job recovery: registry controllerPid missing/malformed (no pass)');
  if (typeof r['controllerCreationTime'] !== 'string' || !Number.isFinite(Date.parse(r['controllerCreationTime']))) throw new Error('crash-job recovery: registry controllerCreationTime missing/malformed (no pass)');
  if (r['jobFlags'] !== '0x2000') throw new Error('crash-job recovery: registry jobFlags must be 0x2000 (no pass)');
  if (!Array.isArray(r['jobVerified']) || (r['jobVerified'] as unknown[]).length < 2) throw new Error('crash-job recovery: registry jobVerified must hold >=2 verified job members (root+child, no pass)');
  const jobVerified: ProcessIdentity[] = [];
  const vseen = new Set<string>();
  for (const entry of r['jobVerified'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error('crash-job recovery: registry jobVerified entry malformed (no pass)');
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e['pid']) || (e['pid'] as number) <= 0) throw new Error('crash-job recovery: registry jobVerified pid malformed (no pass)');
    if (!Number.isInteger(e['parentPid']) || (e['parentPid'] as number) < 0) throw new Error('crash-job recovery: registry jobVerified parentPid malformed (no pass)');
    if (typeof e['creationTime'] !== 'string' || e['creationTime'] === '') throw new Error('crash-job recovery: registry jobVerified creationTime malformed (no pass)');
    if (typeof e['name'] !== 'string' || e['name'] === '') throw new Error('crash-job recovery: registry jobVerified name malformed (no pass)');
    const key = `${e['pid'] as number}|${e['creationTime'] as string}`;
    if (vseen.has(key)) throw new Error('crash-job recovery: registry jobVerified holds duplicate identities (no pass)');
    if (!seen.has(key)) throw new Error('crash-job recovery: verified job member absent from captured tree (no pass)');
    vseen.add(key);
    jobVerified.push({ pid: e['pid'] as number, parentPid: e['parentPid'] as number, creationTime: e['creationTime'] as string, name: e['name'] as string });
  }
  const vroot = jobVerified.find((id) => id.pid === r['rootPid'] && id.creationTime === r['rootCreationTime']);
  if (vroot === undefined) throw new Error('crash-job recovery: registry jobVerified lacks the verified root identity (no pass)');
  if (!jobVerified.some((id) => id.pid !== r['rootPid'] && id.name.toLowerCase() === 'node.exe')) throw new Error('crash-job recovery: registry jobVerified lacks a mock child identity (no pass)');
  if (typeof r['jobConhostNote'] !== 'string') throw new Error('crash-job recovery: registry jobConhostNote missing/malformed (no pass)');
  return {
    schema: CRASH_JOB_REGISTRY_SCHEMA,
    version: CRASH_JOB_REGISTRY_VERSION,
    sessionId: r['sessionId'] as string,
    memberId: r['memberId'] as string,
    rootPid: r['rootPid'] as number,
    rootCreationTime: r['rootCreationTime'] as string,
    rootName: r['rootName'] as string,
    tree,
    lastIntent: r['lastIntent'] as string,
    createdAt: r['createdAt'] as string,
    mainPid: r['mainPid'] as number,
    jobMode: 'job',
    controllerPid: r['controllerPid'] as number,
    controllerCreationTime: r['controllerCreationTime'] as string,
    jobFlags: r['jobFlags'] as string,
    jobVerified,
    jobConhostNote: r['jobConhostNote'] as string,
  };
}

function crashJobPowershellBin(): string {
  const system = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  try {
    if (fs.existsSync(system)) return system;
  } catch {
    /* fall through */
  }
  return 'powershell.exe';
}

function crashJobControllerPath(): string {
  return path.resolve(__dirname, '..', 'scripts', 'job-probe-controller.ps1');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCrashBaseline(): Promise<number> {
  crashBaselineMode = true;
  const fail = (msg: string): number => {
    console.error(`[crash-baseline] FAIL: ${msg}`);
    return 2;
  };
  let registryPath: string;
  try {
    registryPath = getCrashRegistryPath();
  } catch (err) {
    return fail((err as Error).message);
  }
  if (!isProcessTreeCheckSupported()) {
    return fail(`crash baseline is Windows-only (platform=${process.platform}, no pass claimed)`);
  }
  try {
    ensureMember();
    if (term === null || sessionId === null) return fail('member PTY not spawned');
    const tap: { text: string } = { text: '' };
    term.onData((d: string) => {
      tap.text += d;
    });
    const waitForTap = (re: RegExp, timeoutMs: number, label: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (re.test(tap.text)) {
            clearInterval(timer);
            console.log(`[crash-baseline] ok: ${label}`);
            resolve();
          } else if (ptyExitCode !== null) {
            clearInterval(timer);
            reject(new Error(`${label}: PTY exited early (code ${ptyExitCode})`));
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`${label}: timeout waiting for ${re}`));
          }
        }, 50);
      });
    const mySession = sessionId;
    const myMember = 'crash-baseline-member';
    console.log(`[crash-baseline] member session ${mySession} pid=${term.pid} (crash fixture mode, no job, no recovery state machine)`);
    await waitForTap(/mock-cli/i, 15000, 'banner');
    // Prove the crash fixture is armed: in TIYE_MOCK_CRASH_MODE=1 the mock
    // root ignores stdin close and self-expires within 60s, so a 0-survivor
    // recovery cannot be explained as the fixture exiting on its own.
    await waitForTap(/crash-mode armed/i, 5000, 'crash fixture armed (stdin-close ignored, 55s self-expire)');
    term.write('tree\r');
    await waitForTap(/tree ready pid=/i, 10000, 'tree descendant ready');
    const rootPid = term.pid;
    if (rootPid === undefined) return fail('member PID missing after tree command');
    // The child needs a moment to appear in CIM; retry briefly. Require a
    // live root+descendant tree (>=2 distinct PID+creation identities).
    let tree: ProcessIdentity[] | null = null;
    const deadline = Date.now() + 10000;
    // biome-ignore lint: bounded capture retry
    while (true) {
      const attempt = await captureProcessTree(rootPid);
      const distinct = new Set(attempt.map((id) => `${id.pid}|${id.creationTime}`));
      if (attempt.length >= 2 && distinct.size >= 2) {
        tree = attempt;
        break;
      }
      if (Date.now() >= deadline) {
        return fail(`live tree too small (got ${attempt.length} identit(ies), want >=2 distinct PID+creation): ${attempt.map(formatIdentity).join('; ')}`);
      }
      await sleepMs(500);
    }
    const captured = tree as ProcessIdentity[];
    console.log(`[crash-baseline] ok: live tree ${captured.length} identit(ies): ${captured.map(formatIdentity).join('; ')}`);
    const root = captured.find((id) => id.pid === rootPid);
    if (!root) return fail(`root pid=${rootPid} absent from its own captured tree`);
    const registry: CrashBaselineRegistry = {
      schema: CRASH_REGISTRY_SCHEMA,
      version: CRASH_REGISTRY_VERSION,
      sessionId: mySession,
      memberId: myMember,
      rootPid,
      rootCreationTime: root.creationTime,
      rootName: root.name,
      tree: captured,
      lastIntent: 'run',
      createdAt: new Date().toISOString(),
      mainPid: process.pid,
    };
    // Atomic durable write BEFORE the structured READY line.
    writeRegistryAtomic(registryPath, registry);
    const roundTrip = fs.readFileSync(registryPath, 'utf8');
    parseCrashRegistry(roundTrip, registryPath);
    console.log(`[crash-baseline] ok: durable registry written atomically to ${registryPath} (session=${mySession} member=${myMember} rootPid=${rootPid} treeSize=${captured.length} lastIntent=run schema=${CRASH_REGISTRY_SCHEMA} v${CRASH_REGISTRY_VERSION})`);
    console.log(`[crash-baseline] READY registry=${registryPath} session=${mySession} member=${myMember} rootPid=${rootPid} treeSize=${captured.length}`);
    console.log('[crash-baseline] alive until runner kills this Electron process (no graceful exit here; fixture self-expires within 60s)');
    // Stay alive until the runner terminates this runner-owned Electron
    // ChildProcess via the handle. Never resolve on success.
    await new Promise<void>(() => {});
    return 0;
  } catch (err) {
    // Failure path: never PID-kill a captured member. Attempt a graceful
    // `exit` at most (best-effort so a FAILED run does not linger past the
    // 60s fixture bound), then report harness failure (exit 2).
    try {
      if (isMemberAlive()) term?.write('exit\r');
    } catch {
      /* already gone */
    }
    return fail((err as Error).message);
  }
}

async function runCrashRecoveryCheck(): Promise<number> {
  // Recovery check: read-only. No window, no PTY spawn (no duplicate), no
  // kill of any PID (verified or not). Pause = do not relaunch the member;
  // the runner records the outcome and waits for the 60s fixture bound.
  let registryPath: string;
  try {
    registryPath = getCrashRegistryPath();
  } catch (err) {
    console.error(`[crash-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  if (!isProcessTreeCheckSupported()) {
    console.error(`[crash-recovery] FAIL: crash recovery check is Windows-only (platform=${process.platform}, no pass claimed)`);
    return 2;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    console.error(`[crash-recovery] FAIL: durable registry missing at ${registryPath} (no pass)`);
    return 2;
  }
  let registry: CrashBaselineRegistry;
  try {
    registry = parseCrashRegistry(raw, registryPath);
  } catch (err) {
    console.error(`[crash-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  console.log(`[crash-recovery] REGISTRY path=${registryPath} session=${registry.sessionId} member=${registry.memberId} rootPid=${registry.rootPid} treeSize=${registry.tree.length} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version}`);
  for (const id of registry.tree) {
    console.log(`[crash-recovery] IDENTITY ${formatIdentity(id)} parentPid=${id.parentPid}`);
  }
  // Immediate re-enumeration by PID+creation identity. Short bounded poll
  // tolerates CIM lag; the 60s fixture bound means survivors are still
  // present if no OS job reaped them. Never terminates anything.
  let check: { gone: ProcessIdentity[]; survivors: ProcessIdentity[]; attempts: number };
  try {
    check = await verifyIdentitiesGone(registry.tree, 3000, 500);
  } catch (err) {
    console.error(`[crash-recovery] FAIL: identity lookup failed: ${(err as Error).message} (no pass)`);
    return 2;
  }
  console.log(`[crash-recovery] GONE count=${check.gone.length}${check.gone.length > 0 ? `: ${check.gone.map(formatIdentity).join('; ')}` : ''}`);
  console.log(`[crash-recovery] SURVIVORS count=${check.survivors.length}${check.survivors.length > 0 ? `: ${check.survivors.map(formatIdentity).join('; ')}` : ''} (attempts=${check.attempts}, read-only, nothing terminated)`);
  if (check.survivors.length > 0) {
    console.log(`[crash-recovery] RESULT survivors=${check.survivors.length} (expected without a Windows Job Object; 9f stays partial, no job inferred)`);
    console.log(`[crash-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pid-kill (recovery paused, awaiting user; runner now waits for the 60s fixture bound without PID kill)`);
    return 1;
  }
  console.log('[crash-recovery] RESULT survivors=0 (Windows already reaped the tree; record honestly — no Job Object exists here, so no job behavior is inferred; 9f stays partial)');
  console.log(`[crash-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pid-kill (nothing to clean; 9f stays partial)`);
  return 0;
}

async function crashJobLookupSingle(pid: number): Promise<ProcessIdentity> {
  const script =
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.ParentProcessId.ToString() + "|" + $_.CreationDate.ToString("o") + "|" + $_.Name }`;
  const out = await new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(crashJobPowershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err as Error);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* helper-owned enumeration only */
      }
      reject(new Error('crash-job single CIM lookup timed out'));
    }, 20000);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`crash-job single CIM lookup failed (exit ${code}): ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(stdout);
    });
  });
  const line = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] ?? '';
  if (line === '') throw new Error(`crash-job: PID ${pid} not present in CIM (member not alive?)`);
  const first = line.indexOf('|');
  const second = line.indexOf('|', first + 1);
  const third = line.indexOf('|', second + 1);
  if (first < 0 || second < 0 || third < 0) throw new Error('crash-job: malformed single CIM row');
  const gotPid = Number(line.slice(0, first));
  const parentPid = Number(line.slice(first + 1, second));
  const creationTime = line.slice(second + 1, third);
  const name = line.slice(third + 1);
  if (gotPid !== pid || !Number.isInteger(parentPid) || creationTime === '' || name === '') {
    throw new Error(`crash-job: invalid single identity for PID ${pid}`);
  }
  return { pid: gotPid, parentPid, creationTime, name };
}

// ---------------------------------------------------------------------------
// Crash+job probe (S1 step 9f job experiment, feasibility only, Windows
// mock-tree only). No recovery state machine, no 9f pass claimed here.
// --crash-job: main-owned PTY mock CLI + proven Job Object controller with
// the NEW opt-in -HoldUntilStdinClose hold (piped stdin from main). Order:
// spawn PTY, prove fixture armed, capture root PID+creation identity, launch
// the controller, wait for controller READY (queried KILL_ON_JOB_CLOSE
// 0x2000 + same-handle creation check + assignment + IsProcessInJob=true)
// BEFORE sending `tree`; then capture the root+descendant tree, VERIFY root
// and at least the mock child as job members over the controller pipe,
// atomically write the durable registry (schema tiye-crash-job-registry v1
// with explicit jobMode/controller identity + jobVerified evidence) BEFORE
// the structured READY line, and stay alive until the runner kills this
// Electron process. When main dies, its stdin pipe to the controller closes
// (EOF); the controller exits and closes the last job handle.
// --crash-job-recovery-check: read-only registry + PID+creation
// re-enumeration, no duplicate launch, no PID kill. Exit 0 = no survivors
  // with verified membership recorded (bounded observation, not a product
  // guarantee); 1 = survivors present (captured tree not fully gone — FAIL for
// this experiment); 2 = harness failure (never a pass).
// The no-job baseline (--crash-baseline) never uses this controller.
// ---------------------------------------------------------------------------
async function runCrashJobBaseline(): Promise<number> {
  crashJobMode = true;
  const fail = (msg: string): number => {
    console.error(`[crash-job] FAIL: ${msg}`);
    return 2;
  };
  let registryPath: string;
  try {
    registryPath = getCrashJobRegistryPath();
  } catch (err) {
    return fail((err as Error).message);
  }
  if (!isProcessTreeCheckSupported()) {
    return fail(`crash-job is Windows-only (platform=${process.platform}, no pass claimed)`);
  }
  let controller: child_process.ChildProcess | null = null;
  let controllerOutput = '';
  let controllerExited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  const getControllerExit = (): typeof controllerExited => controllerExited;
  const cleanupController = (): void => {
    if (controller !== null) {
      try {
        controller.stdin?.end();
      } catch {
        /* pipe already gone */
      }
      try {
        controller.stdin?.destroy();
      } catch {
        /* ignore */
      }
      // Electron-owned handle only (never a captured member PID). Best-effort
      // so a FAILED run does not linger; the success path never reaches here
      // because it stays alive until the runner kills Electron itself.
      try {
        if (controller.exitCode === null) controller.kill();
      } catch {
        /* already gone */
      }
    }
  };
  try {
    ensureMember();
    if (term === null || sessionId === null) return fail('member PTY not spawned');
    const tap: { text: string } = { text: '' };
    term.onData((d: string) => {
      tap.text += d;
    });
    const waitForTap = (re: RegExp, timeoutMs: number, label: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (re.test(tap.text)) {
            clearInterval(timer);
            console.log(`[crash-job] ok: ${label}`);
            resolve();
          } else if (ptyExitCode !== null) {
            clearInterval(timer);
            reject(new Error(`${label}: PTY exited early (code ${ptyExitCode})`));
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`${label}: timeout waiting for ${re}`));
          }
        }, 50);
      });
    const mySession = sessionId;
    const myMember = 'crash-job-member';
    console.log(`[crash-job] member session ${mySession} pid=${term.pid} (crash fixture mode + job controller, no recovery state machine)`);
    await waitForTap(/mock-cli/i, 15000, 'banner');
    await waitForTap(/crash-mode armed/i, 5000, 'crash fixture armed (stdin-close ignored, 55s self-expire)');
    const rootPid = term.pid;
    if (rootPid === undefined) return fail('member PID missing before job assignment');
    // Capture the root PID+creation identity BEFORE assigning the job.
    let rootIdentity: ProcessIdentity;
    try {
      const preTree = await captureProcessTree(rootPid);
      const preRoot = preTree.find((id) => id.pid === rootPid);
      if (!preRoot) return fail(`root pid=${rootPid} absent from its own pre-job capture`);
      rootIdentity = preRoot;
      console.log(`[crash-job] ok: pre-job root identity ${formatIdentity(rootIdentity)} parentPid=${rootIdentity.parentPid}`);
    } catch (err) {
      cleanupController();
      return fail(`pre-job root capture failed: ${(err as Error).message}`);
    }
    const controllerPs1 = crashJobControllerPath();
    if (!fs.existsSync(controllerPs1)) {
      return fail(`job controller missing: ${controllerPs1}`);
    }
    console.log(`[crash-job] starting job controller for root pid=${rootIdentity.pid} (HoldUntilStdinClose, piped stdin)`);
    try {
      controller = child_process.spawn(
        crashJobPowershellBin(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', controllerPs1, '-ChildPid', String(rootIdentity.pid), '-ChildCreationTime', rootIdentity.creationTime, '-HoldUntilStdinClose'],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch (err) {
      return fail(`job controller launch failed: ${(err as Error).message}`);
    }
    const ctrl: child_process.ChildProcess = controller;
    ctrl.stdout?.on('data', (d: Buffer) => {
      controllerOutput += d.toString('utf8');
    });
    ctrl.stderr?.on('data', (d: Buffer) => {
      controllerOutput += d.toString('utf8');
    });
    ctrl.on('error', (err) => {
      controllerOutput += `\n[job-controller] spawn error: ${(err as Error).message}\n`;
    });
    ctrl.on('exit', (code, signal) => {
      controllerExited = { code, signal };
    });
    const waitForControllerReady = async (): Promise<void> => {
      const start = Date.now();
      const timeoutMs = 20000;
      while (Date.now() - start < timeoutMs) {
        if (/\[job-controller\] FAIL:/.test(controllerOutput)) {
          const m = controllerOutput.match(/\[job-controller\] FAIL:(.*)/);
          throw new Error(`controller reported FAIL:${m ? m[1].trim() : 'unknown'} (job setup failed, no pass)`);
        }
        const ready = controllerOutput.match(/\[job-controller\] READY childPid=(\d+)/);
        if (ready) {
          const readyPid = Number(ready[1]);
          if (readyPid !== rootIdentity.pid) throw new Error(`controller READY pid=${readyPid} does not match root pid=${rootIdentity.pid} (no pass)`);
          if (!/confirmed JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE read-back flags=0x2000/.test(controllerOutput)) {
            throw new Error('controller READY without queried KILL_ON_JOB_CLOSE=0x2000 read-back (no pass)');
          }
          if (!new RegExp(`confirmed IsProcessInJob\\(pid=${rootIdentity.pid}\\)=true`).test(controllerOutput)) {
            throw new Error(`controller READY without IsProcessInJob(pid=${rootIdentity.pid})=true (no pass)`);
          }
          return;
        }
        const exit = getControllerExit();
        if (exit !== null) {
          const f = controllerOutput.match(/\[job-controller\] FAIL:(.*)/);
          throw new Error(`controller exited before READY (code=${exit.code} signal=${exit.signal}${f ? ` FAIL:${f[1].trim()}` : ''}; no pass)`);
        }
        await sleepMs(100);
      }
      throw new Error(`controller READY timeout after ${timeoutMs}ms (job setup failed, no pass; output tail: ${controllerOutput.slice(-400)})`);
    };
    try {
      await waitForControllerReady();
    } catch (err) {
      cleanupController();
      return fail((err as Error).message);
    }
    const preTreeExit = getControllerExit();
    if (preTreeExit !== null) {
      cleanupController();
      return fail(`controller exited before tree fixture (code=${preTreeExit.code}, no pass)`);
    }
    const controllerPid = ctrl.pid;
    if (controllerPid === undefined) {
      cleanupController();
      return fail('job controller has no OS PID (no pass)');
    }
    console.log(`[crash-job] ok: controller READY for root pid=${rootIdentity.pid} (KILL_ON_JOB_CLOSE=0x2000, IsProcessInJob=true) controllerPid=${controllerPid}`);
    let controllerIdentity: ProcessIdentity;
    try {
      controllerIdentity = await crashJobLookupSingle(controllerPid);
      console.log(`[crash-job] ok: controller identity ${formatIdentity(controllerIdentity)} parentPid=${controllerIdentity.parentPid}`);
    } catch (err) {
      cleanupController();
      return fail(`controller identity lookup failed: ${(err as Error).message} (no pass)`);
    }
    // Controller holds the job. Now arm the descendant fixture.
    term.write('tree\r');
    await waitForTap(/tree ready pid=/i, 10000, 'tree descendant ready');
    const liveRootPid = term.pid;
    if (liveRootPid === undefined || liveRootPid !== rootPid) return fail('member PID changed across tree command');
    let tree: ProcessIdentity[] | null = null;
    const deadline = Date.now() + 10000;
    while (true) {
      const attempt = await captureProcessTree(liveRootPid);
      const distinct = new Set(attempt.map((id) => `${id.pid}|${id.creationTime}`));
      if (attempt.length >= 2 && distinct.size >= 2) {
        tree = attempt;
        break;
      }
      if (Date.now() >= deadline) {
        cleanupController();
        return fail(`live tree too small (got ${attempt.length} identit(ies), want >=2 distinct PID+creation): ${attempt.map(formatIdentity).join('; ')}`);
      }
      await sleepMs(500);
    }
    const captured = tree as ProcessIdentity[];
    console.log(`[crash-job] ok: live tree ${captured.length} identit(ies): ${captured.map(formatIdentity).join('; ')}`);
    const verifyInJob = async (id: ProcessIdentity): Promise<{ inJob: boolean; raw: string }> => {
      const marker = controllerOutput.length;
      try {
        ctrl.stdin?.write(`VERIFY ${id.pid} ${id.creationTime}\n`);
      } catch (err) {
        throw new Error(`VERIFY write failed for pid=${id.pid}: ${(err as Error).message}`);
      }
      const start = Date.now();
      const timeoutMs = 10000;
      while (Date.now() - start < timeoutMs) {
        const slice = controllerOutput.slice(marker);
        const ok = slice.match(/\[job-controller\] VERIFIED pid=(\d+) inJob=(True|False)/i);
        if (ok && Number(ok[1]) === id.pid) {
          return { inJob: /^true$/i.test(ok[2]), raw: ok[0] };
        }
        const bad = slice.match(/\[job-controller\] VERIFY-FAIL pid=(\d+)(.*)/);
        if (bad && Number(bad[1]) === id.pid) {
          throw new Error(`controller VERIFY-FAIL for pid=${id.pid}${bad[2] ?? ''} (no pass)`);
        }
        const exit = getControllerExit();
        if (exit !== null) throw new Error(`controller exited during VERIFY pid=${id.pid} (code=${exit.code}, no pass)`);
        await sleepMs(100);
      }
      throw new Error(`VERIFY timeout for pid=${id.pid} (no pass; output tail: ${controllerOutput.slice(-400)})`);
    };
    // Require root + at least the mock child (node.exe non-root) verified.
    const mockChildren = captured.filter((id) => id.pid !== rootPid && id.name.toLowerCase() === 'node.exe');
    if (mockChildren.length < 1) {
      cleanupController();
      return fail(`no mock child (node.exe non-root) in captured tree: ${captured.map(formatIdentity).join('; ')} (no pass)`);
    }
    const jobVerified: ProcessIdentity[] = [];
    try {
      const rootCheck = await verifyInJob(rootIdentity);
      console.log(`[crash-job] ok: VERIFY root pid=${rootIdentity.pid} inJob=${rootCheck.inJob}`);
      if (!rootCheck.inJob) {
        cleanupController();
        return fail(`root pid=${rootIdentity.pid} not in job (inJob=False, no pass)`);
      }
      jobVerified.push(rootIdentity);
      for (const child of mockChildren) {
        const childCheck = await verifyInJob(child);
        console.log(`[crash-job] ok: VERIFY mock child pid=${child.pid} inJob=${childCheck.inJob}`);
        if (!childCheck.inJob) {
          cleanupController();
          return fail(`mock child pid=${child.pid} not in job (inJob=False, no pass)`);
        }
        jobVerified.push(child);
      }
    } catch (err) {
      cleanupController();
      return fail((err as Error).message);
    }
    // conhost.exe is best-effort: record, do not fail. ConPTY hosts have been
    // observed outside the assigned job on some hosts; that layout is
    // documented here rather than treated as job failure.
    let jobConhostNote = 'no conhost in captured tree';
    const conhosts = captured.filter((id) => id.name.toLowerCase() === 'conhost.exe');
    if (conhosts.length > 0) {
      const notes: string[] = [];
      for (const ch of conhosts) {
        try {
          const res = await verifyInJob(ch);
          notes.push(`conhost pid=${ch.pid} inJob=${res.inJob}`);
          console.log(`[crash-job] note: VERIFY ${notes[notes.length - 1]} (best-effort; outside-job conhost is documented, not a failure)`);
        } catch (err) {
          notes.push(`conhost pid=${ch.pid} unverifiable (${(err as Error).message.slice(0, 160)})`);
          console.log(`[crash-job] note: ${notes[notes.length - 1]} (best-effort; documented, not a failure)`);
        }
      }
      jobConhostNote = notes.join('; ');
    } else {
      console.log('[crash-job] note: no conhost in captured tree (jobConhostNote records absence)');
    }
    const liveRoot = captured.find((id) => id.pid === rootPid);
    if (!liveRoot) {
      cleanupController();
      return fail(`root pid=${rootPid} absent from post-tree capture`);
    }
    const registry: CrashJobRegistry = {
      schema: CRASH_JOB_REGISTRY_SCHEMA,
      version: CRASH_JOB_REGISTRY_VERSION,
      sessionId: mySession,
      memberId: myMember,
      rootPid,
      rootCreationTime: liveRoot.creationTime,
      rootName: liveRoot.name,
      tree: captured,
      lastIntent: 'run',
      createdAt: new Date().toISOString(),
      mainPid: process.pid,
      jobMode: 'job',
      controllerPid,
      controllerCreationTime: controllerIdentity.creationTime,
      jobFlags: '0x2000',
      jobVerified,
      jobConhostNote,
    };
    writeRegistryAtomic(registryPath, registry);
    const roundTrip = fs.readFileSync(registryPath, 'utf8');
    parseCrashJobRegistry(roundTrip, registryPath);
    console.log(`[crash-job] ok: durable registry written atomically to ${registryPath} (session=${mySession} member=${myMember} rootPid=${rootPid} treeSize=${captured.length} jobMode=job controllerPid=${controllerPid} jobVerified=${jobVerified.length} flags=0x2000 schema=${CRASH_JOB_REGISTRY_SCHEMA} v${CRASH_JOB_REGISTRY_VERSION})`);
    for (const v of jobVerified) {
      console.log(`[crash-job] JOB-MEMBER ${formatIdentity(v)} parentPid=${v.parentPid} inJob=true`);
    }
    console.log(`[crash-job] note: ${jobConhostNote}`);
    console.log(`[crash-job] READY registry=${registryPath} session=${mySession} member=${myMember} rootPid=${rootPid} treeSize=${captured.length} jobControllerPid=${controllerPid} jobVerified=${jobVerified.length}`);
    console.log('[crash-job] alive until runner kills this Electron process (controller stdin held open; EOF on main death closes the last job handle; fixture self-expires within 60s)');
    // Fail closed if the controller dies first: the job handle would close
    // early and the experiment could not attribute any later disappearance.
    ctrl.on('exit', (code, signal) => {
      console.error(`[crash-job] FAIL: controller exited before main kill (code=${code} signal=${signal}, no pass)`);
      try {
        app.exit(2);
      } catch {
        /* already exiting */
      }
    });
    await new Promise<void>(() => {});
    return 0;
  } catch (err) {
    cleanupController();
    try {
      if (isMemberAlive()) term?.write('exit\r');
    } catch {
      /* already gone */
    }
    return fail((err as Error).message);
  }
}

async function runCrashJobRecoveryCheck(): Promise<number> {
  let registryPath: string;
  try {
    registryPath = getCrashJobRegistryPath();
  } catch (err) {
    console.error(`[crash-job-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  if (!isProcessTreeCheckSupported()) {
    console.error(`[crash-job-recovery] FAIL: crash-job recovery check is Windows-only (platform=${process.platform}, no pass claimed)`);
    return 2;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    console.error(`[crash-job-recovery] FAIL: durable registry missing at ${registryPath} (no pass)`);
    return 2;
  }
  let registry: CrashJobRegistry;
  try {
    registry = parseCrashJobRegistry(raw, registryPath);
  } catch (err) {
    console.error(`[crash-job-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  console.log(`[crash-job-recovery] REGISTRY path=${registryPath} session=${registry.sessionId} member=${registry.memberId} rootPid=${registry.rootPid} treeSize=${registry.tree.length} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version} jobMode=${registry.jobMode} controllerPid=${registry.controllerPid} jobFlags=${registry.jobFlags}`);
  for (const id of registry.tree) {
    console.log(`[crash-job-recovery] IDENTITY ${formatIdentity(id)} parentPid=${id.parentPid}`);
  }
  for (const v of registry.jobVerified) {
    console.log(`[crash-job-recovery] JOB-MEMBER ${formatIdentity(v)} parentPid=${v.parentPid} inJob=true(at-capture)`);
  }
  console.log(`[crash-job-recovery] CONHOST-NOTE ${registry.jobConhostNote}`);
  let check: { gone: ProcessIdentity[]; survivors: ProcessIdentity[]; attempts: number };
  try {
    check = await verifyIdentitiesGone(registry.tree, 3000, 500);
  } catch (err) {
    console.error(`[crash-job-recovery] FAIL: identity lookup failed: ${(err as Error).message} (no pass)`);
    return 2;
  }
  console.log(`[crash-job-recovery] GONE count=${check.gone.length}${check.gone.length > 0 ? `: ${check.gone.map(formatIdentity).join('; ')}` : ''}`);
  console.log(`[crash-job-recovery] SURVIVORS count=${check.survivors.length}${check.survivors.length > 0 ? `: ${check.survivors.map(formatIdentity).join('; ')}` : ''} (attempts=${check.attempts}, read-only, nothing terminated)`);
  if (check.survivors.length > 0) {
    console.log(`[crash-job-recovery] RESULT survivors=${check.survivors.length} (FAIL for this job experiment: captured tree not fully gone; job coverage may be incomplete; 9f stays partial)`);
    console.log(`[crash-job-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pid-kill (recovery paused; fixture self-expire bounds orphans, never a PID kill)`);
    return 1;
  }
  console.log('[crash-job-recovery] RESULT survivors=0 (bounded observation with verified job membership at capture; 9f stays partial — zero survivors alone do not prove job cause, the recorded VERIFIED membership is the added evidence; fixture bound respected)');
  console.log(`[crash-job-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pid-kill (nothing to clean; 9f stays partial)`);
  return 0;
}

async function main(): Promise<void> {
  await app.whenReady();
  // Registered before any branch: without this, the last window closing
  // ends the process (observed: silent exit 0 right after win.close()),
  // which would make Keep Running impossible in every mode.
  app.on('window-all-closed', () => {
    if (lifecycleTestMode) return;
    if (crashBaselineMode) return; // crash-baseline has no window; it lives until the runner kills it.
    if (crashJobMode) return; // crash-job has no window; it lives until the runner kills it.
    if (crashSurvivorMode) return; // crash-survivor has no window/PTY; it lives until the runner kills it.
    if (crashPtySurvivorMode) return; // crash-pty-survivor has no window; it lives until the runner kills it.
    if (keepRunning && !isQuitting) return; // retained PTY lives in the tray.
    app.quit();
  });
  app.on('activate', () => {
    if (startupRecoveryGateActive) {
      if (startupRecoveryWindow !== null) {
        if (startupRecoveryWindow.isMinimized()) startupRecoveryWindow.restore();
        startupRecoveryWindow.focus();
      }
      return;
    }
    if (win === null && !isQuitting && !process.argv.includes(SMOKE_FLAG)) createWindow();
  });
  const startupRecoveryRequested = shouldRunStartupRecoveryGate();
  if (process.argv.includes(STARTUP_RECOVERY_ALERT_SMOKE_FLAG) && !startupRecoveryRequested) {
    console.error('[startup-recovery-alert-smoke] FAIL: registry env missing or incompatible experiment flag (no pass)');
    app.exit(2);
    return;
  }
  if (startupRecoveryRequested) {
    const alertSmoke = process.argv.includes(STARTUP_RECOVERY_ALERT_SMOKE_FLAG);
    try {
      await runStartupRecoveryGate(alertSmoke);
    } catch (err) {
      console.error(`[startup-recovery] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(SMOKE_FLAG)) {
    try {
      const code = await runSmokeTest();
      app.exit(code);
    } catch (err) {
      // Spawn failures (e.g. unresolvable command) must fail loudly and
      // exit; never hang with an unhandled rejection.
      console.error(`[smoke] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(WINDOW_SMOKE_FLAG)) {
    try {
      const code = await runWindowSmoke();
      app.exit(code);
    } catch (err) {
      console.error(`[window-smoke] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(LIFECYCLE_SMOKE_FLAG)) {
    try {
      const code = await runLifecycleSmoke();
      if (code !== 0 && isMemberAlive()) {
        // Best-effort graceful end so a FAILED run does not leave the mock
        // CLI alive behind app.exit (graceful first; never PID-kill here).
        try {
          term?.write('exit\r');
        } catch {
          /* already gone */
        }
        await waitForExit(3000);
      }
      if (code !== 0 && isCoreAlive()) {
        // Best-effort core end so a FAILED run does not leave the separate
        // mock-core process behind: SHUTDOWN line + stdin close, then
        // observe. No kill fallback; a core that stays alive is reported
        // by stopMockCore and the run still fails.
        try {
          await stopMockCore(3000);
        } catch {
          /* already gone */
        }
      }
      app.exit(code);
    } catch (err) {
      console.error(`[lifecycle-smoke] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_BASELINE_FLAG)) {
    try {
      const code = await runCrashBaseline();
      // Success never returns (stays alive until runner kill); a return is
      // always a harness failure.
      app.exit(code);
    } catch (err) {
      console.error(`[crash-baseline] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_RECOVERY_FLAG)) {
    try {
      const code = await runCrashRecoveryCheck();
      app.exit(code);
    } catch (err) {
      console.error(`[crash-recovery] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_JOB_FLAG)) {
    try {
      const code = await runCrashJobBaseline();
      // Success never returns (stays alive until runner kill); a return is
      // always a harness failure.
      app.exit(code);
    } catch (err) {
      console.error(`[crash-job] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_JOB_RECOVERY_FLAG)) {
    try {
      const code = await runCrashJobRecoveryCheck();
      app.exit(code);
    } catch (err) {
      console.error(`[crash-job-recovery] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_SURVIVOR_FLAG)) {
    crashSurvivorMode = true;
    try {
      const code = await runCrashSurvivor();
      // Success never returns (stays alive until runner kill); a return is
      // always a harness failure.
      app.exit(code);
    } catch (err) {
      console.error(`[crash-survivor] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_SURVIVOR_RECOVERY_FLAG)) {
    crashSurvivorMode = true;
    try {
      const code = await runCrashSurvivorRecovery();
      app.exit(code);
    } catch (err) {
      console.error(`[crash-survivor-recovery] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_PTY_SURVIVOR_FLAG)) {
    crashPtySurvivorMode = true;
    try {
      const code = await runCrashPtySurvivor();
      // Success never returns (stays alive until runner kill); a return is
      // always a harness failure.
      app.exit(code);
    } catch (err) {
      console.error(`[crash-pty-survivor] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  if (process.argv.includes(CRASH_PTY_SURVIVOR_RECOVERY_FLAG)) {
    crashPtySurvivorMode = true;
    try {
      const code = await runCrashPtySurvivorRecovery();
      app.exit(code);
    } catch (err) {
      console.error(`[crash-pty-survivor-recovery] FAIL: ${(err as Error).message}`);
      app.exit(2);
    }
    return;
  }
  try {
    attachTerminal();
  } catch (err) {
    dialog.showErrorBox('TIYE S1: PTY spawn failed', (err as Error).message);
    app.exit(2);
    return;
  }
  createWindow();
}

void main().catch((error: unknown) => {
  console.error('[s1] startup failed:', error);
  app.exit(1);
});

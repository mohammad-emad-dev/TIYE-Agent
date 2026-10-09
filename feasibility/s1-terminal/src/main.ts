// S1b main process. Main owns ONE member PTY session across BrowserWindow
// recreation (Architecture 2.3, S1 steps 9a-9d). Window close offers
// Keep Running (retain PTY, tray with Open/Quit) or Stop (graceful CLI
// shutdown, then quit). Tray Quit follows the stop-all path. A tiny
// mock-core subscribe/unsubscribe token covers 9b re-subscribe with no
// duplicate spawn; no team engine is included.
// Lifecycle/process-tree guarantees beyond this (Windows Job Object,
// crash recovery 9f, orphan enumeration 9e) are NOT implemented here.

import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, type IpcMainEvent } from 'electron';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import * as pty from 'node-pty';
import { CHANNELS, isValidInput, isValidResize } from './shared';

const SMOKE_FLAG = '--smoke-test';
const WINDOW_SMOKE_FLAG = '--window-smoke';
const LIFECYCLE_SMOKE_FLAG = '--lifecycle-smoke';
const MAX_PENDING_OUTPUT = 1_000_000;

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
let tray: Tray | null = null;
let stopPromise: Promise<ShutdownResult> | null = null;

// Tiny mock-core subscription token for S1 9b only. No team engine: the
// core merely (re-)subscribes to the main-owned PTY session.
let coreId: string | null = null;

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
    destroyTray();
    if (!lifecycleTestMode) app.quit();
    return result;
  })();
  return stopPromise;
}

/** Drop the exited member so a fresh session can start (smoke only). */
function resetMemberAfterExit(): void {
  if (ptyExitCode === null) throw new Error('resetMemberAfterExit: member still alive');
  term = null;
  sessionId = null;
  pendingOutput = '';
  pendingOutputTruncated = false;
  isQuitting = false;
  stopPromise = null;
}

// --- Tiny mock-core subscription (S1 9b) -----------------------------------
function coreSubscribe(id: string): { coreId: string; sessionId: string | null; pid: number | undefined; spawnCount: number; reused: boolean } {
  const before = spawnCount;
  ensureMember();
  registerIpcOnce();
  coreId = id;
  return { coreId: id, sessionId, pid: term?.pid, spawnCount, reused: spawnCount === before };
}

function coreUnsubscribe(): void {
  coreId = null;
}

function coreRestart(newId: string): { coreId: string; sessionId: string | null; pid: number | undefined; spawnCount: number; reused: boolean } {
  coreUnsubscribe();
  return coreSubscribe(newId);
}

// ---------------------------------------------------------------------------
// Lifecycle smoke (S1 9a-9d, plus 9b re-subscribe): all steps run inside the
// main process via internal hooks — no dialog clicks, no tray clicks.
// Proves with the local mock CLI that Keep Running preserves the same PTY
// PID/session identity through close+reopen (spawn # stays 1), that a mock
// core restart re-subscribes without a duplicate spawn, and that Stop and
// Quit each request graceful shutdown (child exits 0 after `exit`).
// Limitation: PTY exit code 0 is NOT proof that a whole process tree died.
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
    // 9b setup: mock core subscribes; main spawns the single member session.
    const sub1 = coreSubscribe('mock-core-1');
    if (term === null) return fail('member PTY not spawned');
    term.onData((d: string) => {
      tap.text += d;
    });
    const pidA = sub1.pid;
    const sessionA = sub1.sessionId;
    console.log(`[lifecycle-smoke] ok: core subscribed (session=${sessionA} pid=${pidA} spawn#${sub1.spawnCount})`);
    if (sub1.spawnCount !== 1) return fail(`expected spawn #1, got ${sub1.spawnCount}`);

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

    // 9b: restart the mock core while main retains the PTY; re-subscribe.
    const sub2 = coreRestart('mock-core-2');
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
    console.log('[lifecycle-smoke] ok: 9b core restart re-subscribed, no second CLI process');

    // 9c Stop: graceful shutdown requested through the PTY, then session ends.
    if (win === null) return fail('window missing before Stop');
    win.close();
    await waitForWindowClosed(10000);
    const stop = await requestStop('window-stop');
    if (!gracefulShutdownRequested) return fail('Stop did not flag a graceful shutdown request');
    if (!stop.exited || stop.exitCode !== 0 || !stop.graceful) {
      return fail(`Stop did not end gracefully (exited=${stop.exited} code=${stop.exitCode} graceful=${stop.graceful})`);
    }
    console.log(`[lifecycle-smoke] ok: 9c Stop requested graceful shutdown, pty exit ${stop.exitCode}`);
    console.log('[lifecycle-smoke] note: exit code 0 shows the CLI exited on request; it does not prove a whole process tree died (no Job Object in this task)');
    resetMemberAfterExit();

    // 9d Quit (stop-all path): fresh member, then tray-quit graceful path.
    tap.text = '';
    const sub3 = coreSubscribe('mock-core-3');
    if (term === null) return fail('fresh member PTY not spawned');
    term.onData((d: string) => {
      tap.text += d;
    });
    const pidB = sub3.pid;
    console.log(`[lifecycle-smoke] ok: fresh member for Quit path (session=${sub3.sessionId} pid=${pidB} spawn#${sub3.spawnCount})`);
    createWindow({ show: false });
    await waitForReady(20000);
    await waitForTap(/mock-cli/i, 15000, 'banner on fresh member');
    const quit = await requestStop('tray-quit');
    if (!quit.exited || quit.exitCode !== 0 || !quit.graceful) {
      return fail(`Quit path did not end gracefully (exited=${quit.exited} code=${quit.exitCode} graceful=${quit.graceful})`);
    }
    console.log(`[lifecycle-smoke] ok: 9d tray-Quit stop-all requested graceful shutdown, pty exit ${quit.exitCode}`);
    console.log('[lifecycle-smoke] PASS');
    return 0;
  } catch (err) {
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
  const fs = await import('node:fs');
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

async function main(): Promise<void> {
  await app.whenReady();
  // Registered before any branch: without this, the last window closing
  // ends the process (observed: silent exit 0 right after win.close()),
  // which would make Keep Running impossible in every mode.
  app.on('window-all-closed', () => {
    if (lifecycleTestMode) return;
    if (keepRunning && !isQuitting) return; // retained PTY lives in the tray.
    app.quit();
  });
  app.on('activate', () => {
    if (win === null && !isQuitting && !process.argv.includes(SMOKE_FLAG)) createWindow();
  });
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
      app.exit(code);
    } catch (err) {
      console.error(`[lifecycle-smoke] FAIL: ${(err as Error).message}`);
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

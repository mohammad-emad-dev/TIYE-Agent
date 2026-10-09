// S1b main process (+ bounded S1 9e probe). Main owns ONE member PTY
// session across BrowserWindow recreation (Architecture 2.3, S1 steps
// 9a-9d). Window close offers Keep Running (retain PTY, tray with
// Open/Quit) or Stop (graceful CLI shutdown, then quit). Tray Quit follows
// the stop-all path. A separate mock-core OS process covers 9b re-subscribe
// over a narrow stdio JSON-lines IPC with no duplicate spawn; no team
// engine is included. Step 9e is a bounded read-only Windows CIM probe
// (PID + process creation time, never kills) inside the lifecycle smoke.
// Windows Job Object and crash recovery 9f are NOT implemented here.

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

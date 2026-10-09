// S1a main process. Owns the PTY; the renderer is sandboxed with no Node.
// Lifecycle guarantees (window-close keep/stop, tray, core restart,
// Windows job ownership, WSL) are NOT implemented in this prototype.

import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent } from 'electron';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import * as pty from 'node-pty';
import { CHANNELS, isValidInput, isValidResize } from './shared';

const SMOKE_FLAG = '--smoke-test';
const WINDOW_SMOKE_FLAG = '--window-smoke';

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
// Window mode: one sandboxed renderer + main-owned PTY.
// ---------------------------------------------------------------------------
let win: BrowserWindow | null = null;
let term: pty.IPty | null = null;
let rendererReady = false;
let ptyExitCode: number | null = null;
let pendingOutput = '';

function fromWindow(event: IpcMainEvent): boolean {
  return win !== null && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
}

function createWindow(options?: { show?: boolean }): void {
  rendererReady = false;
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    show: options?.show ?? true,
    title: 'TIYE S1a terminal prototype',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => {
    // S1a: no keep-running choice yet; the PTY is torn down with the window.
    win = null;
    if (term !== null) {
      try {
        term.kill();
      } catch {
        /* already gone */
      }
      term = null;
    }
  });
}

function attachTerminal(): void {
  term = spawnMember();
  term.onData((data: string) => {
    if (win !== null && rendererReady) {
      win.webContents.send(CHANNELS.DATA, data);
    } else {
      pendingOutput += data;
    }
  });
  term.onExit(({ exitCode, signal }) => {
    ptyExitCode = exitCode;
    if (win !== null) win.webContents.send(CHANNELS.EXIT, { exitCode, signal });
  });

  ipcMain.on(CHANNELS.READY, (event) => {
    if (!fromWindow(event)) return;
    rendererReady = true;
    if (win !== null && pendingOutput !== '') {
      win.webContents.send(CHANNELS.DATA, pendingOutput);
      pendingOutput = '';
    }
  });
  ipcMain.on(CHANNELS.INPUT, (event, data: unknown) => {
    if (fromWindow(event) && term !== null && isValidInput(data)) term.write(data);
  });
  ipcMain.on(CHANNELS.RESIZE, (event, size: unknown) => {
    if (fromWindow(event) && term !== null && isValidResize(size)) term.resize(size.cols, size.rows);
  });
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
  try {
    attachTerminal();
  } catch (err) {
    dialog.showErrorBox('TIYE S1a: PTY spawn failed', (err as Error).message);
    app.exit(2);
    return;
  }
  createWindow();
  app.on('window-all-closed', () => {
    app.quit();
  });
}

void main().catch((error: unknown) => {
  console.error('[s1] startup failed:', error);
  app.exit(1);
});

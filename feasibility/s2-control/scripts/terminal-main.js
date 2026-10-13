'use strict';
// Opt-in feasibility child. The parent assigns this Electron to a Job before
// sending launch settings. No CLI is spawned before that message.
const { app, BrowserWindow, ipcMain } = require('electron');
const pty = require('../../s1-terminal/node_modules/node-pty');
const path = require('node:path');
const { terminalInputEvidence } = require('./terminal-input');
let win;
let terminal;
let pending = '';
let bytes = 0;
let input = '';
let expected = '';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
process.on('message', async settings => {
  if (win || settings?.type !== 'launch') return;
  await app.whenReady();
  win = new BrowserWindow({ width: 1100, height: 760, show: true, webPreferences: {
    preload: path.join(__dirname, 'terminal-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  win.on('closed', () => { emit({ type: 'closed' }); });
  ipcMain.on('terminal-ready', event => {
    if (event.sender !== win.webContents || terminal) return;
    terminal = pty.spawn(settings.executable, ['--session', settings.sessionID], {
      cwd: settings.cwd, env: { ...process.env, PWD: settings.cwd }, name: 'xterm-256color', cols: 120, rows: 38,
    });
    terminal.onData(data => { bytes += Buffer.byteLength(data); win.webContents.send('terminal-data', data); });
    terminal.onExit(() => emit({ type: 'pty-exit' }));
    pending = settings.prompt;
    expected = '\x1b[200~' + pending + '\x1b[201~\r';
    emit({ type: 'ready' });
  });
  ipcMain.on('terminal-input', (event, data) => {
    if (event.sender !== win.webContents || !terminal || typeof data !== 'string' || data.length > 65536) return;
    input = (input + data).slice(0, 65537);
    terminal.write(data);
  });
  await win.loadFile(path.join(settings.assets, 'terminal.html'));
});
process.on('message', async message => {
  if (message?.type === 'submit' && typeof message.prompt === 'string' && message.prompt.length <= 65536 && !pending) {
    pending = message.prompt;
    expected = '\x1b[200~' + pending + '\x1b[201~\r';
  }
  if (message?.type !== 'submit' || !win || !terminal || !pending) return;
  try {
    input = ''; // Ignore terminal capability replies sent before task delivery.
    const pasted = await win.webContents.executeJavaScript(`window.pasteTask(${JSON.stringify(pending)})`);
    if (!pasted) { emit({ type: 'input-failed' }); return; }
    await new Promise(resolve => setTimeout(resolve, 250));
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await new Promise(resolve => setTimeout(resolve, 250));
    emit({ type: 'submitted', ...terminalInputEvidence(input, expected), outputBytes: bytes });
    pending = '';
  } catch { emit({ type: 'input-failed' }); }
});
app.on('window-all-closed', () => app.quit());

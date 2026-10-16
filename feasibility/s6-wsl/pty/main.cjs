'use strict';
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {s1Require} = require('../../s5-performance/ui/toolchain');
const output = process.env.TIYE_S6_PTY_OUTPUT, runtime = process.env.TIYE_S6_PTY_RUNTIME;
if (!output || !runtime || !fs.existsSync(path.join(runtime, '.owner'))) throw Error('owned runtime required');
app.setPath('userData', path.join(runtime, 'electron-state'));
app.disableHardwareAcceleration();
const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, 'protocol.json')));
const nonce = crypto.randomBytes(8).toString('hex');
const result = {schema: 'tiye-s6-pty-native-v1', state: 'running', nonce, inputs: [], payloads: [],
  fullS6Qualified: false, productionEligible: false};
let window, worker, rendererReady = false, text = '', workerClosed = false, terminalExit, workerCode, workerSignal, workerError = '';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  const deadline = performance.now() + 7000;
  while (performance.now() < deadline) {
    const value = await read();
    if (value) return value;
    await wait(25);
  }
  throw Error('deadline-' + label);
}
function owned(event) {
  assert.equal(event.sender, window.webContents);
  assert.equal(event.senderFrame, window.webContents.mainFrame);
}
async function inspect() { return window.webContents.executeJavaScript('window.__inspect()'); }
async function line(pattern) {
  return until(async () => {
    const snapshot = await inspect();
    const found = snapshot.lines.map(value => value.trim()).find(value => pattern.test(value));
    return found && found.match(pattern);
  }, pattern.source);
}
function linuxInspect(expected) {
  const code = fs.readFileSync(path.join(__dirname, 'inspect.py'), 'utf8');
  return JSON.parse(execFileSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'Ubuntu', '--cd', '/tmp', '--exec',
    '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C.UTF-8', '/usr/bin/python3', '-c', code],
    {input: JSON.stringify(expected), encoding: 'utf8', timeout: 8000, windowsHide: true}));
}
async function run() {
  await until(() => rendererReady, 'renderer');
  worker = spawn(process.execPath, [path.join(__dirname, 'worker.cjs'), nonce],
    {env: {SystemRoot: process.env.SystemRoot || 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1'}, windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  result.windowsWorkerPid = worker.pid;
  worker.stderr.on('data', raw => { if (workerError.length < 65536) workerError += raw.toString(); });
  worker.on('message', message => {
    if (message.event === 'windows-launcher') result.windowsWslPid = message.pid;
    else if (message.event === 'data') {
      text += message.text;
      if (Buffer.byteLength(text) > 1048576) throw Error('transcript limit');
      window.webContents.send('pty-output', message.text);
    } else if (message.event === 'exit') terminalExit = message.exitCode;
  });
  worker.on('close', (code, signal) => { workerClosed = true; workerCode = code; workerSignal = signal; });
  const ready = await line(new RegExp('^TIYE_READY ' + nonce + ' (\\d{3})$'));
  assert.equal(ready[1], '111'); result.isatty = ready[1];
  const pid = await line(new RegExp('^TIYE_PID ' + nonce + ' (\\d+) (\\d+) (\\d+)$'));
  const expected = {pid: Number(pid[1]), startTicks: Number(pid[2]), uid: Number(pid[3]), nonce};
  assert(expected.uid > 0); result.linuxIdentity = linuxInspect(expected);
  assert.equal(result.linuxIdentity.status, 'verified-live'); assert.deepEqual(result.linuxIdentity.children, []);
  const mode = await line(new RegExp('^TIYE_MODE ' + nonce + ' echo=(\\d) isig=(\\d)$'));
  assert.deepEqual(mode.slice(1), ['0', '1']); result.mode = {echo: 0, isig: 1};
  await line(new RegExp('^TIYE_SIZE ' + nonce + ' 120 24$')); result.initialSize = [120, 24];
  for (const [index, payload] of protocol.pastes.entries()) {
    await window.webContents.executeJavaScript('window.__paste(' + JSON.stringify(payload) + ')');
    const received = payload.replace(/\r?\n/g, '\r');
    const ack = await line(new RegExp('^TIYE_ACK ' + nonce + ' ' + (index + 1) + ' (\\d+) ([a-f0-9]{64})$'));
    assert.equal(Number(ack[1]), Buffer.byteLength(received)); assert.equal(ack[2], hash(Buffer.from(received)));
    for (const visible of received.split('\r')) await line(new RegExp('^VISIBLE ' + visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    result.payloads.push({ordinal: index + 1, sentText: payload, receivedText: received,
      receivedUtf8Bytes: Number(ack[1]), linuxSha256: ack[2], visibleBufferMatched: true});
  }
  await window.webContents.executeJavaScript('window.__resize()'); worker.send({event: 'resize'});
  await line(new RegExp('^TIYE_SIZE ' + nonce + ' 100 16$')); result.resizedSize = [100, 16];
  await window.webContents.executeJavaScript('window.__interrupt()');
  await line(new RegExp('^TIYE_SIGINT ' + nonce + '$')); result.linuxSigintObserved = true;
  result.beforeStop = await inspect();
  fs.writeFileSync(path.join(output, 'terminal-before-stop.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript('window.__paste(' + JSON.stringify('STOP ' + nonce) + ')');
  await line(new RegExp('^TIYE_STOP ' + nonce + '$'));
  await until(() => workerClosed, 'worker exit');
  assert.equal(terminalExit, 0); assert.equal(workerCode, 0); assert.equal(workerSignal, null);
  result.terminalExitCode = terminalExit; result.workerExitCode = workerCode; result.workerSignal = workerSignal;
  result.afterStopIdentity = linuxInspect(expected);
  assert.equal(result.afterStopIdentity.status, 'gone');
  assert.equal(result.afterStopIdentity.bootIdSha256, result.linuxIdentity.bootIdSha256);
  result.renderer = await until(async () => {
    const snapshot = await inspect();
    return snapshot.receivedBytes === Buffer.byteLength(text) && snapshot.receivedSha256 === hash(Buffer.from(text)) && snapshot;
  }, 'renderer receipts');
  result.transcriptBytes = Buffer.byteLength(text); result.transcriptSha256 = hash(Buffer.from(text));
  result.versions = {electron: process.versions.electron, node: process.versions.node,
    nodePty: s1Require('node-pty/package.json').version, xterm: s1Require('@xterm/xterm/package.json').version};
  result.state = 'bounded-pty-observations-completed';
}
app.whenReady().then(async () => {
  window = new BrowserWindow({width: 1150, height: 670, show: true, webPreferences: {preload: path.join(__dirname, 'dist/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}});
  ipcMain.on('renderer-ready', event => { owned(event); rendererReady = true; });
  ipcMain.on('pty-input', (event, input) => {
    owned(event); assert.equal(typeof input, 'string'); assert(Buffer.byteLength(input) <= 16384);
    result.inputs.push(input); if (worker?.connected) worker.send({event: 'input', text: input});
  });
  try {
    await window.loadFile(path.join(__dirname, 'dist/index.html'));
    await run();
  } catch (error) {
    result.state = 'incomplete'; result.failure = error.message;
    if (worker?.connected) worker.send({event: 'kill'});
    if (worker) await until(() => workerClosed, 'failed worker exit').catch(() => {});
  } finally {
    fs.writeFileSync(path.join(output, 'decoded-vt.log'), text);
    fs.writeFileSync(path.join(output, 'worker.stderr.log'), workerError);
    fs.writeFileSync(path.join(output, 'native.json'), JSON.stringify(result, null, 2) + '\n');
    app.exit(result.state === 'bounded-pty-observations-completed' ? 0 : 1);
  }
});

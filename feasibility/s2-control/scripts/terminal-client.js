'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { nativeExecutable, attachJob, waitUntil, processInventory, ownedIdentities } = require('./persistent-cli');
const s1 = path.resolve(__dirname, '../../s1-terminal');

async function prepareAssets() {
  const assets = path.resolve(__dirname, '../../../.git/s2-terminal-assets');
  fs.mkdirSync(assets, { recursive: true });
  await require(path.join(s1, 'node_modules/esbuild')).build({ entryPoints: [path.join(__dirname, 'terminal-renderer.js')], bundle: true, platform: 'browser', outfile: path.join(assets, 'terminal-renderer.js') });
  fs.copyFileSync(path.join(__dirname, 'terminal.html'), path.join(assets, 'terminal.html'));
  fs.copyFileSync(path.join(s1, 'node_modules/@xterm/xterm/css/xterm.css'), path.join(assets, 'xterm.css'));
  return assets;
}

function parsedEvents(events) {
  return events.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}

async function openTerminal({ cwd, sessionID, taskPrompt }) {
  const result = { evidence: { terminalInputMatched: false } };
  let events = '';
  let truncated = false;
  result.readEvents = () => parsedEvents(events);
  result.outputTruncated = () => truncated;
  try {
    const assets = await prepareAssets();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require(path.join(s1, 'node_modules/electron')), [path.join(__dirname, 'terminal-main.js')], { cwd, env, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    const state = result.state = { child };
    child.stdout.on('data', data => { events += data; truncated ||= events.length > 32000; events = events.slice(-32000); });
    child.stderr.resume();
    child.on('error', () => { state.error = true; });
    child.on('close', () => { state.closed = true; });
    await attachJob(state);
    child.send({ type: 'launch', executable: nativeExecutable(), cwd, sessionID, assets, prompt: taskPrompt });
    await waitUntil(() => result.readEvents().some(event => event.type === 'ready') || state.error || state.closed, 20000);
    if (state.error || state.closed) throw new Error('terminal startup failed');
    await new Promise(resolve => setTimeout(resolve, 4000));
    state.captured = ownedIdentities(await processInventory(), child.pid);
    result.submittedAt = Date.now();
    child.send({ type: 'submit' });
    await waitUntil(() => result.readEvents().some(event => ['submitted', 'input-failed'].includes(event.type)) || state.closed, 10000);
    const submitted = result.readEvents().find(event => event.type === 'submitted');
    result.evidence.terminalInputMatched = submitted?.matched === true;
    result.evidence.terminalOutputObserved = submitted?.outputBytes > 0;
    result.evidence.inputDiagnostics = submitted ? { inputBytes: submitted.inputBytes, expectedBytes: submitted.expectedBytes, focusReports: submitted.focusReports, pasteMatched: submitted.pasteMatched, enterObserved: submitted.enterObserved } : null;
    if (!result.evidence.terminalInputMatched || !result.evidence.terminalOutputObserved) throw new Error('terminal input unverified');
  } catch { result.evidence.error = 'terminal startup/input failed'; }
  return result;
}

module.exports = { openTerminal, prepareAssets };

'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { nativeExecutable, attachJob, waitUntil, processInventory, ownedIdentities } = require('./persistent-cli');
const s1 = path.resolve(__dirname, '../../s1-terminal');
const T1_SUMMARY = 'Added clamp(value, min, max) and tests for below, within, and above bounds.';
const prompt = `T1: Add clamp(value, min, max) in clamp.js as a CommonJS export { clamp }. It returns min when value is below min, max when above max, otherwise value. Add clamp.test.js using node:test and node:assert/strict covering below, within, and above bounds. Only edit clamp.js and clamp.test.js. Do not run shell commands, install anything, commit or push. Finish by calling tiye-team-tools_report_result exactly once with status "done" and summary ${JSON.stringify(T1_SUMMARY)}. Do not merely claim a tool call in prose.`;

function terminalReportEvidence(messages, summary, member) {
  const assistants = messages.filter(message => message.type === 'assistant');
  const tools = assistants.flatMap(message => message.content || []).filter(part => part.type === 'tool');
  const reports = tools.filter(part => part.name === 'tiye-team-tools_report_result');
  const report = reports[0];
  // The observed TUI stores one extra boundary whitespace character. Keep
  // every internal character exact; trimming is not general prompt rewriting.
  const promptAccepted = messages.filter(message => message.type === 'user' && message.text?.trim() === prompt).length === 1;
  return {
    promptAccepted,
    promptDiagnostics: { messageTypes: [...new Set(messages.map(message => message.type))], users: messages.filter(message => message.type === 'user').map(message => ({ length: message.text?.length, exact: message.text === prompt, trimmed: message.text?.trim() === prompt, contains: message.text?.includes(prompt), normalized: message.text?.replace(/\s+/g, ' ').trim() === prompt.replace(/\s+/g, ' ').trim() })) },
    completedReports: reports.filter(entry => entry.state?.status === 'completed').length,
    completedAck: promptAccepted && reports.length === 1 && report.state?.status === 'completed'
      && report.state.input?.summary === summary && report.state.input?.status === 'done'
      && report.state.content?.length === 1 && report.state.content[0].type === 'text'
      && report.state.content[0].text === `ack report_result for ${member} (feasibility only, no engine effect)`,
    shellCalls: tools.filter(part => /shell|bash/.test(part.name)).length,
  };
}

async function prepareAssets() {
  const assets = path.resolve(__dirname, '../../../.git/s2-terminal-assets');
  fs.mkdirSync(assets, { recursive: true });
  await require(path.join(s1, 'node_modules/esbuild')).build({ entryPoints: [path.join(__dirname, 'terminal-renderer.js')], bundle: true, platform: 'browser', outfile: path.join(assets, 'terminal-renderer.js') });
  fs.copyFileSync(path.join(__dirname, 'terminal.html'), path.join(assets, 'terminal.html'));
  fs.copyFileSync(path.join(s1, 'node_modules/@xterm/xterm/css/xterm.css'), path.join(assets, 'xterm.css'));
  return assets;
}

async function terminalTask({ cwd, sessionID, summary, member, serviceApi }) {
  const evidence = { terminalInputMatched: false, completedAck: false };
  let state;
  try {
    const assets = await prepareAssets();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require(path.join(s1, 'node_modules/electron')), [path.join(__dirname, 'terminal-main.js')], { cwd, env, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    state = { child };
    let events = '';
    let truncated = false;
    child.stdout.on('data', data => { events += data; truncated ||= events.length > 32000; events = events.slice(-32000); });
    child.stderr.resume();
    child.on('error', () => { state.error = true; });
    child.on('close', () => { state.closed = true; });
    await attachJob(state);
    child.send({ type: 'launch', executable: nativeExecutable(), cwd, sessionID, assets, prompt });
    await waitUntil(() => events.includes('"type":"ready"') || state.error || state.closed, 20000);
    if (state.error || state.closed) throw new Error('terminal startup failed');
    await new Promise(resolve => setTimeout(resolve, 4000));
    state.captured = ownedIdentities(await processInventory(), child.pid);
    child.send({ type: 'submit' });
    await waitUntil(() => events.includes('"type":"submitted"') || events.includes('"type":"input-failed"') || state.closed, 10000);
    const submitted = events.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(event => event.type === 'submitted');
    evidence.terminalInputMatched = submitted?.matched === true;
    evidence.terminalOutputObserved = submitted?.outputBytes > 0;
    evidence.inputDiagnostics = submitted ? { inputBytes: submitted.inputBytes, expectedBytes: submitted.expectedBytes, focusReports: submitted.focusReports, pasteMatched: submitted.pasteMatched, enterObserved: submitted.enterObserved } : null;
    if (!evidence.terminalInputMatched || !evidence.terminalOutputObserved) throw new Error('terminal input unverified');
    const startedAt = Date.now();
    let reports = [];
    let assistants = [];
    let messages;
    while (Date.now() - startedAt < 120000) {
      messages = await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`);
      assistants = messages?.data?.filter(message => message.type === 'assistant') || [];
      reports = assistants.flatMap(message => message.content || []).filter(part => part.type === 'tool' && part.name === 'tiye-team-tools_report_result');
      if (reports.some(report => ['completed', 'error'].includes(report.state?.status)) || assistants.some(message => message.error)) break;
      if (state.closed || state.error) throw new Error('terminal stopped before report');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    evidence.elapsedMs = Date.now() - startedAt;
    Object.assign(evidence, terminalReportEvidence(messages?.data || [], summary, member));
    evidence.outputTruncated = truncated;
    evidence.cliSpawnError = state.error === true;
  } catch { evidence.error = 'terminal task failed'; }
  return { state, evidence };
}

module.exports = { terminalTask, terminalReportEvidence, prompt, prepareAssets, T1_SUMMARY };

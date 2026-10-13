'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { nativeExecutable, attachJob, waitUntil, processInventory, ownedIdentities } = require('./persistent-cli');
const s1 = path.resolve(__dirname, '../../s1-terminal');
const { phaseEvidence, recallEvidence } = require('./briefing-evidence');
const T1_SUMMARY = 'Added clamp(value, min, max) and tests for below, within, and above bounds.';
const prompt = `T1: Add clamp(value, min, max) in clamp.js as a CommonJS export { clamp }. It returns min when value is below min, max when above max, otherwise value. Add clamp.test.js using node:test and node:assert/strict covering below, within, and above bounds. Only edit clamp.js and clamp.test.js. Do not run shell commands, install anything, commit or push. Finish by calling tiye-team-tools_report_result exactly once with status "done" and summary ${JSON.stringify(T1_SUMMARY)}. Do not merely claim a tool call in prose.`;
const nudge = `If the assigned clamp function and test file are complete, finish by calling tiye-team-tools_report_result exactly once with status "done" and summary ${JSON.stringify(T1_SUMMARY)}. Do not edit files or use any other tools. If the task is incomplete, do not report success.`;

function terminalReportEvidence(messages, summary, member, task = {}) {
  const taskPrompt = task.prompt || prompt;
  const expectedTool = task.tool || 'report_result';
  const expectedInput = expectedTool === 'ask_leader' ? { question: task.question } : { summary, status: 'done' };
  const assistants = messages.filter(message => message.type === 'assistant');
  const tools = assistants.flatMap(message => message.content || []).filter(part => part.type === 'tool');
  const reports = tools.filter(part => part.name === `tiye-team-tools_${expectedTool}`);
  const report = reports[0];
  // The observed TUI stores one extra boundary whitespace character. Keep
  // every internal character exact; trimming is not general prompt rewriting.
  const promptAccepted = messages.filter(message => message.type === 'user' && message.text?.trim() === taskPrompt).length === 1;
  return {
    promptAccepted,
    promptDiagnostics: { messageTypes: [...new Set(messages.map(message => message.type))], users: messages.filter(message => message.type === 'user').map(message => ({ length: message.text?.length, exact: message.text === taskPrompt, trimmed: message.text?.trim() === taskPrompt })) },
    completedReports: reports.filter(entry => entry.state?.status === 'completed').length,
    completedAck: promptAccepted && reports.length === 1 && report.state?.status === 'completed'
      && Object.keys(report.state.input || {}).length === Object.keys(expectedInput).length && Object.entries(expectedInput).every(([key, value]) => report.state.input?.[key] === value)
      && report.state.content?.length === 1 && report.state.content[0].type === 'text'
      && report.state.content[0].text === `ack ${expectedTool} for ${member} (feasibility only, no engine effect)`,
    shellCalls: tools.filter(part => /shell|bash/.test(part.name)).length,
    codingToolCalls: tools.filter(part => /edit|write|patch/.test(part.name)).length,
    otherTeamToolCalls: tools.filter(part => part.name.startsWith('tiye-team-tools_') && part.name !== `tiye-team-tools_${expectedTool}`).length,
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

async function pollReport({ cwd, sessionID, serviceApi, state, task = {}, taskSubmittedAt }) {
  const startedAt = Date.now();
  let messages;
  let idleSamples = 0;
  while (Date.now() - startedAt < 120000) {
    messages = await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`);
    const assistants = messages?.data?.filter(message => message.type === 'assistant') || [];
    const reports = assistants.flatMap(message => message.content || []).filter(part => part.type === 'tool' && part.name === `tiye-team-tools_${task.tool || 'report_result'}`);
    if (reports.some(report => ['completed', 'error'].includes(report.state?.status)) || assistants.some(message => message.error)) break;
    if (state.closed || state.error) throw new Error('terminal stopped before report');
    if (task.stopOnIdle && assistants.some(message => message.time?.completed >= taskSubmittedAt && message.finish === 'stop')) {
      const session = await serviceApi(cwd, 'GET', `/api/session/${sessionID}`);
      idleSamples = session.data?.time?.idle >= taskSubmittedAt ? idleSamples + 1 : 0;
      if (idleSamples >= 2) return { messages: messages.data, elapsedMs: Date.now() - startedAt, idleWithoutReport: true };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { messages: messages?.data || [], elapsedMs: Date.now() - startedAt };
}

async function pollTextPhase({ cwd, sessionID, serviceApi, state, phasePrompt, submittedAt, priorAssistantIds }) {
  const deadline = Date.now() + 120000;
  let stable = 0;
  while (Date.now() < deadline) {
    if (state.error || state.closed) throw new Error('terminal closed during text phase');
    const messages = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
    const phase = phaseEvidence(messages, phasePrompt, priorAssistantIds);
    if (!phase.noErrors || !phase.noTools) throw new Error('unexpected activity during text phase');
    const session = await serviceApi(cwd, 'GET', `/api/session/${sessionID}`);
    stable = phase.accepted && phase.completed && session.data?.time?.idle >= submittedAt ? stable + 1 : 0;
    if (stable >= 2) return { messages, phase, stableIdle: true };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('text phase did not finish');
}

async function submitFollowup(child, state, readEvents, text) {
  const offset = readEvents().length;
  const submittedAt = Date.now();
  child.send({ type: 'submit', prompt: text });
  await waitUntil(() => readEvents().slice(offset).includes('"type":"submitted"') || readEvents().slice(offset).includes('"type":"input-failed"') || state.closed, 10000);
  const submitted = readEvents().slice(offset).split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(event => event.type === 'submitted');
  if (submitted?.matched !== true) throw new Error('followup input unverified');
  return submittedAt;
}

async function deliverBriefing(request) {
  const { task, child, state, readEvents } = request;
  const briefing = await pollTextPhase({ ...request, phasePrompt: task.briefing.prompt });
  const fields = { briefingInputMatched: true, briefingAccepted: briefing.phase.accepted, briefingFirstUserMessage: briefing.messages.filter(message => message.type === 'user').length === 1, briefingNoTools: briefing.phase.noTools, briefingStableIdle: briefing.stableIdle };
  if (!fields.briefingFirstUserMessage) throw new Error('briefing was not first');
  const submittedAt = await submitFollowup(child, state, readEvents, task.prompt || prompt);
  return { fields: { ...fields, codingInputMatched: true }, submittedAt };
}

async function verifyRecall(request) {
  const { cwd, sessionID, serviceApi, child, state, readEvents, task, submittedAt } = request;
  const deadline = Date.now() + 120000;
  let stable = 0;
  while (Date.now() < deadline && stable < 2) {
    const own = await serviceApi(cwd, 'GET', `/api/session/${sessionID}`);
    stable = own.data?.time?.idle >= submittedAt ? stable + 1 : 0;
    if (stable < 2) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (stable < 2) throw new Error('coding turn not idle');
  const before = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
  const priorAssistantIds = new Set(before.filter(message => message.type === 'assistant').map(message => message.id));
  const recallSubmittedAt = await submitFollowup(child, state, readEvents, task.briefing.recallPrompt);
  const recalled = await pollTextPhase({ ...request, phasePrompt: task.briefing.recallPrompt, submittedAt: recallSubmittedAt, priorAssistantIds });
  return { recallInputMatched: true, recallAccepted: recalled.phase.accepted, recallNoTools: recalled.phase.noTools, recallStableIdle: recalled.stableIdle, recall: recallEvidence(recalled.phase.assistants, task.briefing.profile) };
}

async function terminalTask({ cwd, sessionID, summary, member, serviceApi, allowNudge = false, task = {} }) {
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
    child.send({ type: 'launch', executable: nativeExecutable(), cwd, sessionID, assets, prompt: task.briefing?.prompt || task.prompt || prompt });
    await waitUntil(() => events.includes('"type":"ready"') || state.error || state.closed, 20000);
    if (state.error || state.closed) throw new Error('terminal startup failed');
    await new Promise(resolve => setTimeout(resolve, 4000));
    state.captured = ownedIdentities(await processInventory(), child.pid);
    let taskSubmittedAt = Date.now();
    child.send({ type: 'submit' });
    await waitUntil(() => events.includes('"type":"submitted"') || events.includes('"type":"input-failed"') || state.closed, 10000);
    const submitted = events.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(event => event.type === 'submitted');
    evidence.terminalInputMatched = submitted?.matched === true;
    evidence.terminalOutputObserved = submitted?.outputBytes > 0;
    evidence.inputDiagnostics = submitted ? { inputBytes: submitted.inputBytes, expectedBytes: submitted.expectedBytes, focusReports: submitted.focusReports, pasteMatched: submitted.pasteMatched, enterObserved: submitted.enterObserved } : null;
    if (!evidence.terminalInputMatched || !evidence.terminalOutputObserved) throw new Error('terminal input unverified');
    if (task.briefing) {
      const briefing = await deliverBriefing({ cwd, sessionID, serviceApi, child, state, readEvents: () => events, task, submittedAt: taskSubmittedAt });
      Object.assign(evidence, briefing.fields);
      taskSubmittedAt = briefing.submittedAt;
    }
    const initialStartedAt = Date.now();
    let observed = await pollReport({ cwd, sessionID, serviceApi, state, task, taskSubmittedAt });
    Object.assign(evidence, terminalReportEvidence(observed.messages, summary, member, task));
    evidence.initialIdleWithoutReport = observed.idleWithoutReport === true;
    evidence.initialCompletedAck = evidence.completedAck;
    evidence.initialElapsedMs = observed.elapsedMs;
    evidence.nudgeUsed = false;
    if (allowNudge && task.kind !== 'question' && !evidence.completedAck && evidence.promptAccepted && evidence.completedReports === 0 && !observed.messages.some(message => message.type === 'assistant' && message.error)) {
      const ownSession = await serviceApi(cwd, 'GET', `/api/session/${sessionID}`);
      const tools = observed.messages.filter(message => message.type === 'assistant').flatMap(message => message.content || []).filter(part => part.type === 'tool');
      const idleAfterTask = Number.isFinite(ownSession.data?.time?.idle) && ownSession.data.time.idle >= taskSubmittedAt;
      if (idleAfterTask && !tools.some(tool => tool.name === 'tiye-team-tools_report_result') && fs.existsSync(path.join(cwd, 'clamp.js')) && fs.existsSync(path.join(cwd, 'clamp.test.js'))) {
        evidence.nudgeUsed = true;
        const eventOffset = events.length;
        child.send({ type: 'submit', prompt: nudge });
        await waitUntil(() => events.slice(eventOffset).includes('"type":"submitted"') || events.slice(eventOffset).includes('"type":"input-failed"') || state.closed, 10000);
        const nudgeInput = events.slice(eventOffset).split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).find(event => event.type === 'submitted');
        evidence.nudgeInputMatched = nudgeInput?.matched === true;
        if (!evidence.nudgeInputMatched) throw new Error('nudge input unverified');
        observed = await pollReport({ cwd, sessionID, serviceApi, state });
        Object.assign(evidence, terminalReportEvidence(observed.messages, summary, member, task));
        evidence.nudgePromptAccepted = observed.messages.filter(message => message.type === 'user' && message.text?.trim() === nudge).length === 1;
      }
    }
    evidence.elapsedMs = Date.now() - initialStartedAt;
    if (task.briefing && evidence.completedAck) {
      Object.assign(evidence, await verifyRecall({ cwd, sessionID, serviceApi, child, state, readEvents: () => events, task, submittedAt: taskSubmittedAt }));
    }
    evidence.outputTruncated = truncated;
    evidence.cliSpawnError = state.error === true;
  } catch { evidence.error = 'terminal task failed'; }
  return { state, evidence };
}

module.exports = { terminalTask, terminalReportEvidence, prompt, prepareAssets, T1_SUMMARY };

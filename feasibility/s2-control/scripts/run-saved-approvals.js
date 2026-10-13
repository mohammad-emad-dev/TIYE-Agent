'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { serviceApi, SERVICE_PERMISSIONS } = require('./service-cli');
const { openTerminal } = require('./terminal-client');
const { closePrivate } = require('./persistent-cli');
const { terminalUI } = require('./terminal-ui');
const { approvalScreen, approvalKeyEvidence } = require('./terminal-approval-evidence');
const { conversationFingerprint } = require('./recovery-evidence');
const { quiescentMessages } = require('./service-quiescence');
const { MODEL, savedAlwaysScreen, shellPhaseSnapshot, ownedSavedRules, savedApprovalRunPassed } = require('./saved-approval-evidence');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));
const command = `rtk proxy node -e "require('node:fs').appendFileSync('approval-marker.txt','approved')"`;
const prompt = `Call the shell tool exactly once with command: ${command}. Use the current project directory. Wait for approval if required. Stop after the attempt; no other tools, retries or fallbacks.`;
const taskDefinition = { command, prompt };
const controlCwd = path.resolve(__dirname, '../../..');

async function projectIdentity(cwd) {
  const location = await serviceApi(controlCwd, 'GET', `/api/location?location[directory]=${encodeURIComponent(cwd)}`);
  if (typeof location?.project?.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(location.project.id)
    || path.resolve(location.directory).toLowerCase() !== path.resolve(cwd).toLowerCase()
    || path.resolve(location.project.directory).toLowerCase() !== path.resolve(cwd).toLowerCase()) throw new Error('owned project identity unverified');
  return location.project.id;
}

async function savedRows(projectID) {
  const response = await serviceApi(controlCwd, 'GET', `/api/permission/saved?projectID=${encodeURIComponent(projectID)}`);
  if (!Array.isArray(response?.data) || response.data.some(row => row.projectID !== projectID)) throw new Error('saved permission scope invalid');
  return response.data;
}

async function readPhase(request, outcome) {
  const messages = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
  const requests = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/permission`)).data;
  if (!Array.isArray(messages) || !Array.isArray(requests)) throw new Error('saved phase schema invalid');
  return { messages, requests, ...shellPhaseSnapshot({ messages, requests, ...request, task: taskDefinition, submittedAt: request.taskSubmittedAt, outcome }) };
}

function markerMatches(cwd, expected) {
  const marker = path.join(cwd, 'approval-marker.txt');
  return expected === null ? !fs.existsSync(marker) : fs.existsSync(marker) && fs.readFileSync(marker).equals(Buffer.from(expected));
}

async function observePhase(request, { name, outcome, marker }) {
  console.log(`[saved-approvals] phase ${name}`);
  let prior, stable = 0, pendingEverObserved = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (request.state.closed || request.state.error) throw new Error('saved phase terminal closed');
    const snapshot = await readPhase(request, outcome);
    pendingEverObserved ||= snapshot.requests.length > 0;
    if (!snapshot.evidence.noAssistantErrors) throw new Error('saved phase assistant error');
    const fingerprint = conversationFingerprint(snapshot.messages) + JSON.stringify(snapshot.requests);
    const markerMatched = markerMatches(request.cwd, marker);
    stable = snapshot.evidence.phaseObserved && markerMatched ? (fingerprint === prior ? stable + 1 : 1) : 0;
    prior = snapshot.evidence.phaseObserved && markerMatched ? fingerprint : undefined;
    if (stable >= 2) return { snapshot, evidence: { name, ...snapshot.evidence, stableTwice: true, markerMatched, pendingEverObserved, passed: outcome !== 'completed' || name === 'seed-always' || !pendingEverObserved } };
    await delay();
  }
  throw new Error('saved phase observation deadline');
}

async function inspectAlways(request, pending, selected, evidence) {
  const snapshot = await readPhase(request, 'pending');
  if (!snapshot.evidence.phaseObserved || snapshot.request.id !== pending.id || snapshot.request.source.id !== pending.source.id
    || snapshot.request.source.messageID !== pending.source.messageID) throw new Error('saved approval request changed');
  const ui = await terminalUI(request.state, 'inspect');
  const screen = approvalScreen(ui, command);
  if (selected === 'once' && screen.visible && screen.selected === 'once') {
    const style = label => { const choice = ui.choices.find(candidate => candidate.label === label); return JSON.stringify([choice.fg, choice.bg, choice.fgMode, choice.bgMode, choice.inverse]); };
    request.palette = { selected: style('Allow once'), normal: style('Reject') };
  }
  const visible = selected === 'always' ? savedAlwaysScreen({ ...ui, proposed: pending.save, palette: request.palette }) : screen.visible && screen.selected === selected;
  evidence.uiInspection = { expectedSelected: selected, visible: screen.visible, selected: screen.selected,
    choiceColors: ui.choices.map(choice => ({ label: choice.label, fg: choice.fg, bg: choice.bg, fgMode: choice.fgMode, bgMode: choice.bgMode, inverse: choice.inverse })),
    permissionHeadingPresent: ui.screen.includes('Permission required'), expectedCommandPresent: ui.screen.includes('$ ' + command) };
  evidence.uiInspection.savedPatternsPresent = pending.save?.every(pattern => ui.screen.includes(pattern));
  if (!visible) throw new Error('saved approval choice unqualified');
  return hash(ui.screen);
}

async function press(request, keys) {
  const response = await terminalUI(request.state, 'keys', { keys });
  const observed = approvalKeyEvidence(response.input, keys);
  if (!observed.matched) throw new Error('saved approval key input mismatch');
  return observed;
}

async function chooseAlways(request, pending, evidence, ownership) {
  const hashes = [];
  hashes.push(await inspectAlways(request, pending, 'once', evidence)); await delay();
  hashes.push(await inspectAlways(request, pending, 'once', evidence));
  evidence.navigationInput = await press(request, ['Right']);
  hashes.push(await inspectAlways(request, pending, 'always', evidence)); await delay();
  hashes.push(await inspectAlways(request, pending, 'always', evidence));
  if (!markerMatches(request.cwd, null)) throw new Error('saved command executed prematurely');
  evidence.uiAlwaysSelectedTwice = true;
  evidence.screenHashes = hashes;
  ownership.submittedAt = Date.now(); ownership.approvalSent = true;
  evidence.decisionInput = await press(request, ['Return']);
  evidence.uiAlwaysInputMatched = true;
}

async function stopSession(request, evidence) {
  try {
    await serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
    const second = await serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
    const snapshot = await readPhase(request, 'pending');
    if (second?.interrupted !== false || !quiescentMessages({ messages: snapshot.messages, pending: snapshot.requests, createdAt: request.taskSubmittedAt })) throw new Error('saved session stop unverified');
    await serviceApi(request.cwd, 'DELETE', `/api/session/${request.sessionID}`);
    const sessions = (await serviceApi(request.cwd, 'GET', `/api/session?directory=${encodeURIComponent(request.cwd)}`)).data;
    evidence.sessionRemoved = Array.isArray(sessions) && !sessions.some(session => session.id === request.sessionID);
    if (!evidence.sessionRemoved) throw new Error('saved session deletion unverified');
  } finally { if (request.state) evidence.cleanup = await closePrivate(request.state); }
}

async function freshPhase(cwd, projectID, phase) {
  const evidence = { name: phase.name, newSession: true, passed: false };
  let request;
  try {
    const permissions = phase.outcome === 'denied' ? [...SERVICE_PERMISSIONS, { action: 'shell', resource: command, effect: 'deny' }] : SERVICE_PERMISSIONS;
    const created = (await serviceApi(cwd, 'POST', '/api/session', { location: { directory: cwd }, agent: 'build', model: MODEL, permissions, title: 'TIYE saved approval feasibility' })).data;
    if (!/^ses_[A-Za-z0-9]+$/.test(created?.id)) throw new Error('saved session identity invalid');
    request = { cwd, sessionID: created.id, taskSubmittedAt: created.time.created };
    evidence.sessionSelectionConfirmed = JSON.stringify(created.permissions) === JSON.stringify(permissions) && created.agent === 'build'
      && Object.entries(MODEL).every(([key, expected]) => created.model?.[key] === expected) && path.resolve(created.location.directory).toLowerCase() === path.resolve(cwd).toLowerCase()
      && await (phase.projectIdentity || projectIdentity)(cwd) === projectID;
    if (!evidence.sessionSelectionConfirmed) throw new Error('saved session selection unverified');
    const terminal = await openTerminal({ cwd, sessionID: request.sessionID, taskPrompt: prompt });
    request.state = terminal.state; request.taskSubmittedAt = terminal.submittedAt;
    evidence.terminalInputMatched = terminal.evidence.terminalInputMatched && terminal.evidence.terminalOutputObserved;
    if (terminal.evidence.error || !evidence.terminalInputMatched) throw new Error('saved terminal input unverified');
    Object.assign(evidence, (await observePhase(request, phase)).evidence);
    evidence.outputTruncated = terminal.outputTruncated();
    if (evidence.outputTruncated) throw new Error('saved terminal output truncated');
  } finally { if (request) await stopSession(request, evidence); }
  return evidence;
}

function createOtherProject(cwd) {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-saved-scope-'));
  for (const name of ['package.json', 'README.md', 'protected.txt', 'opencode.json']) fs.copyFileSync(path.join(cwd, name), path.join(other, name));
  for (const args of [['init', '--quiet'], ['add', 'package.json', 'README.md', 'protected.txt'], ['-c', 'user.name=TIYE Fixture', '-c', 'user.email=fixture@local', 'commit', '--quiet', '-m', `Saved scope ${crypto.randomUUID()}`]]) {
    if (spawnSync('git', args, { cwd: other, windowsHide: true }).status !== 0) throw new Error('saved scope fixture failed');
  }
  return other;
}

async function removeOwnedRules(ownership) {
  if (!ownership.projectID) return !ownership.approvalSent;
  const rows = await savedRows(ownership.projectID);
  if (rows.length === 0) { ownership.rulesRemoved = true; return; }
  if (!ownership.approvalSent || !ownedSavedRules({ rows, ...ownership })) throw new Error('saved rule cleanup ownership unverified');
  for (const row of rows) {
    if (await serviceApi(controlCwd, 'DELETE', `/api/permission/saved/${encodeURIComponent(row.id)}`) !== null) throw new Error('saved rule removal unverified');
  }
  ownership.rulesRemoved = (await savedRows(ownership.projectID)).length === 0;
  if (!ownership.rulesRemoved) throw new Error('saved rules remain');
}

async function removeOtherProject(cwd) {
  await serviceApi(controlCwd, 'DELETE', `/api/debug/location?location[directory]=${encodeURIComponent(cwd)}`);
  const remaining = await serviceApi(controlCwd, 'GET', '/api/debug/location');
  if (!Array.isArray(remaining) || remaining.some(entry => path.resolve(entry.directory).toLowerCase() === path.resolve(cwd).toLowerCase())) throw new Error('saved other location remains');
  const resolved = fs.realpathSync(cwd);
  if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-s2-saved-scope-')) throw new Error('saved other temp boundary invalid');
  const sessions = (await serviceApi(controlCwd, 'GET', `/api/session?directory=${encodeURIComponent(cwd)}`)).data;
  if (!Array.isArray(sessions) || sessions.length !== 0) throw new Error('saved other sessions remain');
  fs.rmSync(resolved, { recursive: true, maxRetries: 10, retryDelay: 200 });
  return !fs.existsSync(resolved);
}

async function observe(request, ownership) {
  const evidence = { parentPermissionReplies: 0, savedPhases: [], savedRuleRemoved: false, otherProjectCleaned: false };
  let other;
  try {
    ownership.projectID = await projectIdentity(request.cwd);
    other = createOtherProject(request.cwd);
    const otherID = await projectIdentity(other);
    evidence.projectIdentitiesDistinct = ownership.projectID !== otherID;
    evidence.projectBaselinesEmpty = (await savedRows(ownership.projectID)).length === 0 && (await savedRows(otherID)).length === 0;
    if (!evidence.projectIdentitiesDistinct || !evidence.projectBaselinesEmpty) throw new Error('saved project baselines unqualified');
    const pending = (await observePhase(request, { name: 'seed-pending', outcome: 'pending', marker: null })).snapshot.request;
    ownership.proposed = pending.save;
    if (!Array.isArray(ownership.proposed) || !ownership.proposed.length || ownership.proposed.some(pattern => typeof pattern !== 'string')) throw new Error('saved proposals invalid');
    await chooseAlways(request, pending, evidence, ownership);
    evidence.savedPhases.push((await observePhase(request, { name: 'seed-always', outcome: 'completed', marker: 'approved' })).evidence);
    let rows = await savedRows(ownership.projectID);
    evidence.savedRuleOwned = ownedSavedRules({ rows, ...ownership });
    if (!evidence.savedRuleOwned) throw new Error('saved created rules unqualified');
    evidence.savedRuleCount = rows.length; evidence.proposedPatternHashes = ownership.proposed.map(hash);
    evidence.savedPhases.push(await freshPhase(request.cwd, ownership.projectID, { name: 'same-project', outcome: 'completed', marker: 'approvedapproved' }));
    evidence.savedRulePersistedAcrossSessions = ownedSavedRules({ rows: await savedRows(ownership.projectID), ...ownership });
    evidence.savedPhases.push(await freshPhase(other, otherID, { name: 'other-project', outcome: 'pending', marker: null }));
    evidence.savedPhases.push(await freshPhase(request.cwd, ownership.projectID, { name: 'deny-precedence', outcome: 'denied', marker: 'approvedapproved' }));
    if (!ownedSavedRules({ rows: await savedRows(ownership.projectID), ...ownership })) throw new Error('saved rules disappeared before revocation');
    await removeOwnedRules(ownership);
    evidence.savedPhases.push(await freshPhase(request.cwd, ownership.projectID, { name: 'revoked-ask', outcome: 'pending', marker: 'approvedapproved' }));
    if ((await savedRows(otherID)).length !== 0) throw new Error('other project acquired a saved rule');
  } catch { evidence.error = 'saved approval observation failed'; }
  finally {
    try { await removeOwnedRules(ownership); evidence.savedRuleRemoved = ownership.rulesRemoved || !ownership.approvalSent; }
    catch { evidence.error = 'saved approval rule cleanup failed'; }
    try { evidence.originalClientCleanup = await closePrivate(request.state); }
    catch { evidence.error = 'saved original client cleanup failed'; }
    try { if (other) evidence.otherProjectCleaned = await removeOtherProject(other); }
    catch (error) { evidence.error = 'saved approval other-project cleanup failed'; evidence.otherCleanupFailure = ['EPERM', 'EBUSY', 'ENOENT'].includes(error.code) ? error.code : error.message === 'saved other location remains' ? 'location-remains' : error.message === 'saved other sessions remain' ? 'sessions-remain' : 'other'; }
  }
  return evidence;
}

async function main() {
  const before = configFingerprints();
  if ((await serviceApi(controlCwd, 'GET', '/api/info')).version !== '2.0.28') throw new Error('saved approvals require reviewed 2.0.28');
  const names = ['run-saved-approvals.js', 'saved-approval-evidence.js', 'run-tool-probe.js', 'service-cli.js', 'terminal-client.js', 'terminal-main.js', 'terminal-renderer.js', 'terminal-preload.js', 'terminal-ui.js', 'terminal-approval-evidence.js', 'approval-evidence.js', 'persistent-cli.js', 'service-quiescence.js', 'recovery-evidence.js', 'terminal-task.js'];
  const measurement = { scope: 'Native always approval, same-project fresh-session reuse, other-project ask, configured deny precedence and owned revocation; not backend-restart durability', recordedAt: new Date().toISOString(), expectedVersion: '2.0.28',
    sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])) };
  const ownership = { approvalSent: false, rulesRemoved: false };
  const task = { ...taskDefinition, kind: 'permission', caseID: 'saved-always', permissions: SERVICE_PERMISSIONS, expectedMarker: 'approvedapproved',
    initialCommitMessage: `TIYE saved approvals ${crypto.randomUUID()}`, verifyOwnedCleanup: () => !ownership.approvalSent || ownership.rulesRemoved,
    observe: request => observe(request, ownership) };
  measurement.run = await runMember('member-a', { terminalMode: true, task });
  measurement.run.passed = savedApprovalRunPassed(measurement.run);
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.run.passed && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/saved-approvals-latest.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[saved-approvals] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[saved-approvals] lifecycle failure'); process.exitCode = 1; });
module.exports = { taskDefinition, projectIdentity, savedRows, observePhase, chooseAlways, freshPhase, removeOwnedRules };

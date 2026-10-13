'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS, serviceApi } = require('./service-cli');
const { approvalSnapshot, approvalOutcome } = require('./approval-evidence');
const { approvalScreen, approvalKeyEvidence, terminalApprovalRunPassed, approvalObservationApi } = require('./terminal-approval-evidence');
const { terminalUI } = require('./terminal-ui');
const { conversationFingerprint } = require('./recovery-evidence');
const { quiescentMessages } = require('./service-quiescence');
const { reviewedVersion } = require('./reviewed-version');
const command = `rtk proxy node -e "require('node:fs').appendFileSync('approval-marker.txt','approved')"`;
const definitions = [
  { caseID: 'reject-shell', decision: 'reject', command, prompt: `Call the shell tool exactly once with command: ${command}. Use the current project directory. Wait for approval. If rejected, stop without retries or fallback tools.` },
  { caseID: 'allow-once-shell', decision: 'once', command, expectedMarker: 'approved', prompt: `Call the shell tool twice in sequence with exactly the same command each time: ${command}. Use the current project directory. Wait for each approval. Only make the second call after the first completes. Do not use any other tools, retries or fallback methods.` },
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));

async function readSnapshot(request, task, evidence) {
  const read = route => request.observationApi('GET', route);
  const messages = (await read(`/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
  const requests = (await read(`/api/session/${request.sessionID}/permission`)).data;
  if (!Array.isArray(messages) || !Array.isArray(requests)) throw new Error('terminal approval schema invalid');
  const snapshot = approvalSnapshot({ messages, requests, sessionID: request.sessionID, task, cwd: request.cwd });
  const users = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt);
  const fresh = users.length === 1 && users[0].time?.created >= request.taskSubmittedAt && messages.filter(message => message.type === 'assistant').length > 0
    && messages.filter(message => message.type === 'assistant').every(message => message.time?.created >= users[0].time.created);
  Object.assign(evidence, snapshot.evidence, { freshPromptAndAssistants: fresh });
  return { ...snapshot, messages, requests };
}

function exactPending(snapshot, evidence) {
  return evidence.freshPromptAndAssistants && evidence.promptAccepted && evidence.noAssistantErrors && evidence.exactShellCallsOnly
    && evidence.correlatedPending && snapshot.requests.length === 1 && snapshot.request.resources.length === 1;
}

async function inspectPending(request, task, evidence, expectedRequest) {
  const snapshot = await readSnapshot(request, task, evidence);
  if (!exactPending(snapshot, evidence) || snapshot.request.id !== expectedRequest.id || snapshot.request.source.id !== expectedRequest.source.id
    || snapshot.request.source.messageID !== expectedRequest.source.messageID) throw new Error('terminal approval identity changed');
  const ui = await terminalUI(request.state, 'inspect');
  const visible = approvalScreen(ui, task.command);
  evidence.uiScreenQualified = visible.visible;
  if (!visible.visible) throw new Error('terminal approval screen unqualified');
  return { selected: visible.selected, screenHash: hash(ui.screen) };
}

async function pressKeys(request, keys) {
  const response = await terminalUI(request.state, 'keys', { keys });
  const observed = approvalKeyEvidence(response.input, keys);
  if (!observed.matched) throw new Error('terminal approval key input unverified');
  return observed;
}

async function deliverDecision(request, task, evidence, pending) {
  const first = await inspectPending(request, task, evidence, pending);
  await delay();
  const second = await inspectPending(request, task, evidence, pending);
  if (first.selected !== 'once' || second.selected !== 'once') throw new Error('terminal approval default selection changed');
  evidence.uiPendingObservedTwice = true;
  evidence.uiNavigationInputMatched = true;
  if (task.decision === 'reject') {
    evidence.navigationInput = await pressKeys(request, ['Right', 'Right']);
    evidence.uiNavigationInputMatched = evidence.navigationInput.matched;
  }
  const selectedFirst = await inspectPending(request, task, evidence, pending);
  await delay();
  const selectedSecond = await inspectPending(request, task, evidence, pending);
  if (selectedFirst.selected !== task.decision || selectedSecond.selected !== task.decision) throw new Error('terminal approval selected decision mismatch');
  evidence.uiSelectedDecisionObservedTwice = true;
  evidence.screenHashes = { pendingFirst: first.screenHash, pendingSecond: second.screenHash, selectedFirst: selectedFirst.screenHash, selectedSecond: selectedSecond.screenHash };
  evidence.markerAbsentBeforeDecision = !fs.existsSync(path.join(request.cwd, 'approval-marker.txt'));
  if (!evidence.markerAbsentBeforeDecision) throw new Error('terminal command ran before approval');
  evidence.uiDecisionInputsSent = 1;
  evidence.decisionInput = await pressKeys(request, ['Return']);
  evidence.uiDecisionInputMatched = evidence.decisionInput.matched;
  evidence.replyDecision = task.decision;
}

async function observe(task, request) {
  const evidence = { apiApprovalRepliesSent: 0, apiMutationAttempts: 0, apiReadAttempts: 0, uiDecisionInputsSent: 0, permissionObserved: false };
  request = { ...request, observationApi: approvalObservationApi({ api: request.serviceApi, cwd: request.cwd, sessionID: request.sessionID, evidence }) };
  const deadline = Date.now() + 90000;
  let originalRequest, stable = 0, prior, markerSamples = 0;
  try {
    while (Date.now() < deadline) {
      if (request.state.closed || request.state.error) throw new Error('terminal approval client closed');
      const snapshot = await readSnapshot(request, task, evidence);
      if (!originalRequest && exactPending(snapshot, evidence) && evidence.shellCalls === 1 && evidence.completedShellCalls === 0 && evidence.failedShellCalls === 0) {
        await deliverDecision(request, task, evidence, snapshot.request);
        originalRequest = snapshot.request; stable = 0; prior = undefined;
      } else if (originalRequest) {
        const finished = task.decision === 'once' ? exactPending(snapshot, evidence) && snapshot.request.id !== originalRequest.id
          : quiescentMessages({ messages: snapshot.messages, pending: snapshot.requests, createdAt: request.taskSubmittedAt });
        const fingerprint = conversationFingerprint(snapshot.messages) + JSON.stringify(snapshot.requests);
        if (finished && task.decision === 'once') {
          const marker = path.join(request.cwd, 'approval-marker.txt');
          if (!fs.existsSync(marker) || !fs.readFileSync(marker).equals(Buffer.from('approved'))) throw new Error('terminal approval marker mismatch');
          markerSamples++;
        } else markerSamples = 0;
        stable = finished ? (fingerprint === prior ? stable + 1 : 1) : 0;
        prior = finished ? fingerprint : undefined;
        if (stable >= 2) {
          const qualified = approvalOutcome({ snapshot, decision: task.decision, originalToolID: originalRequest.source.id, originalRequestID: originalRequest.id,
            replyAccepted: evidence.uiDecisionInputMatched, pendingObservedTwice: task.decision === 'once', stableTerminal: task.decision === 'reject' });
          if (!qualified) throw new Error('terminal approval backend outcome mismatch');
          const marker = path.join(request.cwd, 'approval-marker.txt');
          const matched = fs.existsSync(marker) && fs.readFileSync(marker).equals(Buffer.from('approved'));
          return { ...evidence, permissionObserved: true, stableTerminal: task.decision === 'reject', pendingObservedTwice: task.decision === 'once',
            markerBeforeStopMatched: matched, markerStableAtSecondApproval: task.decision === 'once' && matched && markerSamples >= 2, markerSamplesAtSecondApproval: markerSamples };
        }
      }
      if (!evidence.rejectionErrorsOnly) throw new Error('terminal approval assistant failed');
      await delay();
    }
    return { ...evidence, observationTimedOut: true, permissionObserved: false };
  } catch {
    return { ...evidence, error: 'terminal approval observation failed', permissionObserved: false };
  }
}

async function main() {
  const before = configFingerprints();
  if (reviewedVersion((await serviceApi(path.resolve(__dirname, '../../..'), 'GET', '/api/info')).version) !== '2.0.28') throw new Error('terminal approvals require reviewed 2.0.28');
  const names = ['run-terminal-approvals.js', 'terminal-approval-evidence.js', 'terminal-ui.js', 'terminal-main.js', 'terminal-renderer.js', 'terminal-preload.js', 'terminal-client.js', 'terminal-input.js', 'run-tool-probe.js', 'service-cli.js', 'approval-evidence.js', 'permission-evidence.js', 'service-quiescence.js', 'recovery-evidence.js', 'terminal-task.js'];
  const measurement = { scope: 'Native terminal Reject and Allow once decisions; parent uses read-only scoped API observation, no parent permission API replies', recordedAt: new Date().toISOString(), expectedVersion: '2.0.28',
    sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])), runs: [] };
  const target = path.resolve(__dirname, '../evidence/terminal-approvals-latest.json');
  for (const definition of definitions) {
    console.log(`[terminal-approvals] starting ${definition.caseID}`);
    const task = { ...definition, kind: 'permission', permissions: SERVICE_PERMISSIONS, observe: request => observe(definition, request) };
    const run = { caseID: definition.caseID, promptHash: hash(definition.prompt), ...await runMember('member-a', { terminalMode: true, task }) };
    run.passed = terminalApprovalRunPassed(run);
    measurement.runs.push(run);
    fs.writeFileSync(target, JSON.stringify(measurement, null, 2) + '\n');
    console.log(`[terminal-approvals] ${definition.caseID} passed=${run.passed}`);
    if (!run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli.serviceIdentityUnchanged) { measurement.stoppedReason = 'owned-cleanup-unverified'; break; }
  }
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.runs.length === definitions.length && !measurement.stoppedReason && measurement.runs.every(run => run.passed) && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(target, JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[terminal-approvals] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[terminal-approvals] lifecycle failure'); process.exitCode = 1; });

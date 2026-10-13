'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { permissionEvidence } = require('./permission-evidence');
const { approvalSnapshot, approvalOutcome } = require('./approval-evidence');
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));
const command = `rtk proxy node -e "require('node:fs').appendFileSync('approval-marker.txt','approved')"`;
const cases = [
  { caseID: 'deny-edit', permissions: [{ action: 'edit', resource: '*', effect: 'allow' }, { action: 'edit', resource: 'protected.txt', effect: 'deny' }, ...SERVICE_PERMISSIONS.filter(rule => rule.action !== 'edit')],
    prompt: 'Controlled permission probe: edit protected.txt exactly once, replacing original protected bytes with changed protected bytes. The file currently contains original protected bytes followed by a newline. Use the edit tool, not shell/write/patch or any fallback. Do not read or change any other files. Stop after the attempted edit and describe its outcome.' },
  { caseID: 'reject-shell', decision: 'reject', command, permissions: SERVICE_PERMISSIONS,
    prompt: `Call the shell tool exactly once with command: ${command}. Use the current project directory. Wait for approval. If rejected, stop without retries or fallback tools.` },
  { caseID: 'allow-once-shell', decision: 'once', command, expectedMarker: 'approved', permissions: SERVICE_PERMISSIONS,
    prompt: `Call the shell tool twice in sequence with exactly the same command each time: ${command}. Use the current project directory. Wait for each approval. Only make the second call after the first completes. Do not use any other tools, retries or fallback methods.` },
];

async function readSnapshot(request, task) {
  const { cwd, sessionID, serviceApi } = request;
  const messages = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
  const requests = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/permission`)).data;
  if (!Array.isArray(messages) || !Array.isArray(requests)) throw new Error('approval schema invalid');
  return { messages, requests, ...approvalSnapshot({ messages, requests, sessionID, task, cwd }) };
}

async function observe(task, request) {
  const deadline = Date.now() + 90000;
  let originalToolID, originalRequestID, pendingID;
  let replyAccepted = false;
  let samples = 0;
  let evidence = { permissionObserved: false };
  while (Date.now() < deadline) {
    if (request.state.closed || request.state.error) throw new Error('approval terminal closed');
    const snapshot = await readSnapshot(request, task);
    if (task.caseID === 'deny-edit') {
      evidence = permissionEvidence({ ...snapshot, sessionID: request.sessionID, task, cwd: request.cwd });
    } else {
      evidence = snapshot.evidence;
      if (!replyAccepted && evidence.promptAccepted && evidence.noAssistantErrors && evidence.exactShellCallsOnly
        && evidence.shellCalls === 1 && evidence.completedShellCalls === 0 && evidence.failedShellCalls === 0 && snapshot.request) {
        if (typeof snapshot.request.id !== 'string' || !/^per[A-Za-z0-9_-]+$/.test(snapshot.request.id)) throw new Error('approval identity invalid');
        samples = pendingID === snapshot.request.id ? samples + 1 : 1;
        pendingID = snapshot.request.id;
        if (samples >= 2) {
          originalToolID = snapshot.request.source.id;
          originalRequestID = snapshot.request.id;
          // Only a twice-observed, exact, owned request receives a scoped decision.
          const response = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/permission/${originalRequestID}/reply`, { decision: task.decision });
          replyAccepted = response === null;
          if (!replyAccepted) throw new Error('approval reply unverified');
          samples = 0; pendingID = undefined;
        }
        await delay(); continue;
      }
      if (replyAccepted && task.decision === 'once' && snapshot.request && snapshot.request.id !== originalRequestID) {
        samples = pendingID === snapshot.request.id ? samples + 1 : 1;
        pendingID = snapshot.request.id;
        const pendingObservedTwice = samples >= 2;
        const permissionObserved = approvalOutcome({ snapshot, decision: task.decision, originalToolID, originalRequestID, replyAccepted, pendingObservedTwice });
        if (permissionObserved) {
          const marker = path.join(request.cwd, 'approval-marker.txt');
          const markerBeforeStopMatched = fs.existsSync(marker) && fs.readFileSync(marker).equals(Buffer.from(task.expectedMarker));
          return { ...evidence, replyAccepted, replyDecision: task.decision, pendingObservedTwice, markerBeforeStopMatched, permissionObserved: markerBeforeStopMatched };
        }
        await delay(); continue;
      }
    }
    const session = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
    const finished = snapshot.messages.some(message => message.type === 'assistant' && ['stop', 'error'].includes(message.finish) && message.time?.completed >= request.taskSubmittedAt);
    const terminal = finished && snapshot.calls.every(({ tool }) => ['completed', 'error'].includes(tool.state?.status)) && evidence.ownPendingRequests === 0;
    const normalIdle = finished && session.time?.idle >= request.taskSubmittedAt;
    samples = (task.decision === 'reject' ? terminal : normalIdle) ? samples + 1 : 0;
    const stableIdle = samples >= 2;
    if (stableIdle || (!evidence.noAssistantErrors && task.decision !== 'reject')) {
      const permissionObserved = task.caseID === 'deny-edit' ? evidence.permissionObserved
        : approvalOutcome({ snapshot, decision: task.decision, originalToolID, originalRequestID, replyAccepted, stableTerminal: stableIdle });
      return { ...evidence, replyAccepted, replyDecision: replyAccepted ? task.decision : null, stableIdle: stableIdle && normalIdle, stableTerminal: stableIdle && terminal, permissionObserved };
    }
    await delay();
  }
  return { ...evidence, replyAccepted, observationTimedOut: true, permissionObserved: false };
}

async function main() {
  const before = configFingerprints();
  const names = ['run-approval-outcomes.js', 'approval-evidence.js', 'permission-evidence.js', 'run-tool-probe.js', 'service-cli.js', 'service-quiescence.js', 'terminal-task.js'];
  const sourceHashes = Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')]));
  const result = { scope: 'Targeted edit deny, shell reject and once-only approval; fresh disposable sessions', recordedAt: new Date().toISOString(), sourceHashes, runs: [] };
  const target = path.resolve(__dirname, '../evidence/approval-outcomes-latest.json');
  for (const definition of cases) {
    console.log(`[approval] starting ${definition.caseID}`);
    const task = { ...definition, kind: 'permission', observe: request => observe(definition, request) };
    const run = await runMember('member-a', { terminalMode: true, task });
    result.runs.push({ caseID: definition.caseID, promptHash: crypto.createHash('sha256').update(definition.prompt).digest('hex'), ...run });
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
    console.log(`[approval] ${definition.caseID} passed=${run.passed}`);
    if (!run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli?.serviceIdentityUnchanged) break;
  }
  result.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  result.passed = result.runs.length === cases.length && result.runs.every(run => run.passed) && result.selectedConfigsUnchanged;
  result.result = result.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
  console.log(`[approval] ${result.result}`);
  process.exitCode = result.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[approval] lifecycle failure'); process.exitCode = 1; });

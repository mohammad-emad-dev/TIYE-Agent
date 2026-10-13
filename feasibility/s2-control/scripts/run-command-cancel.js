'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { processInventory } = require('./persistent-cli');
const { activePendingSnapshot } = require('./active-disconnect-evidence');
const { sameSession } = require('./session-identity');
const { conversationFingerprint } = require('./recovery-evidence');
const { commandIdentities, sameCommandIdentities, commandProcessesGone, heartbeatGrowth, executingSnapshot, cancelledSnapshot } = require('./command-cancel-evidence');
const { terminateCapturedCommand } = require('./command-process-cleanup');
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function workloadSnapshot(cwd) {
  const markers = {}, heartbeats = {};
  for (const role of ['root', 'child']) {
    const markerPath = path.join(cwd, `${role}-started.json`), heartbeatPath = path.join(cwd, `${role}-heartbeat.txt`);
    if (fs.existsSync(markerPath)) {
      const bytes = fs.readFileSync(markerPath);
      if (bytes.length > 512) throw new Error('command marker invalid');
      try { markers[role] = JSON.parse(bytes); } catch { /* A first marker write may still be in progress. */ }
    }
    if (fs.existsSync(heartbeatPath)) {
      const bytes = fs.readFileSync(heartbeatPath);
      if (bytes.length > 4096 || !bytes.every(byte => byte === 120)) throw new Error('command heartbeat invalid');
      heartbeats[role] = bytes.length;
    }
  }
  return { markers, heartbeats, completionAbsent: ['root', 'child'].every(role => !fs.existsSync(path.join(cwd, `${role}-completed.txt`))),
    scriptHash: hash(fs.readFileSync(path.join(cwd, 'execution-fixture.cjs'))) };
}

async function readOperation(request, task) {
  const messages = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
  const pending = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/permission`)).data;
  if (!Array.isArray(messages) || !Array.isArray(pending)) throw new Error('command operation schema invalid');
  const snapshot = executingSnapshot({ messages, pending, sessionID: request.sessionID, task, cwd: request.cwd,
    originalToolID: task.execution.originalToolID, submittedAt: request.taskSubmittedAt });
  return { messages, pending, snapshot };
}

async function approveOwnedCommand(request, task, evidence) {
  const deadline = Date.now() + 90000;
  let prior, stable = 0;
  while (Date.now() < deadline) {
    const observed = await readOperation(request, task);
    const pending = activePendingSnapshot({ messages: observed.messages, requests: observed.pending, sessionID: request.sessionID, task, cwd: request.cwd });
    if (!pending.evidence.noAssistantErrors || pending.evidence.completedShellCalls || pending.evidence.failedShellCalls) throw new Error('command ended before approval');
    if (pending.activePending) {
      const identity = JSON.stringify([pending.request.id, pending.request.source.messageID, pending.request.source.id]);
      stable = identity === prior ? stable + 1 : 1; prior = identity;
      if (stable >= 2) {
        if (!/^per[A-Za-z0-9_-]+$/.test(pending.request.id)) throw new Error('command approval identity invalid');
        task.execution.originalToolID = pending.request.source.id;
        evidence.pendingBeforeApprovalTwice = true; evidence.approvalRepliesSent = 1;
        const reply = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/permission/${pending.request.id}/reply`, { decision: 'once' });
        evidence.replyAccepted = reply === null;
        if (!evidence.replyAccepted) throw new Error('command approval unverified');
        return;
      }
    } else { stable = 0; prior = undefined; }
    await delay();
  }
  throw new Error('command approval deadline');
}

async function executionTwice(request, task, evidence, servicePID) {
  const deadline = Date.now() + 30000;
  let previous;
  while (Date.now() < deadline) {
    const observed = await readOperation(request, task);
    if (!observed.snapshot.evidence.noAssistantErrors || observed.snapshot.evidence.completedShellCalls || observed.snapshot.evidence.failedShellCalls) throw new Error('command ended before execution proof');
    const workload = workloadSnapshot(request.cwd);
    if (!workload.completionAbsent || workload.scriptHash !== task.scriptHash) throw new Error('command fixture changed or completed');
    if (observed.snapshot.executing) {
      const inventory = await processInventory();
      const captured = commandIdentities({ markers: workload.markers, nonce: task.nonce, inventory, servicePID,
        forbiddenPIDs: [process.pid, ...request.state.captured.map(identity => identity.ProcessId)], submittedAt: request.taskSubmittedAt });
      if (captured) {
        task.execution.captured = captured;
        task.execution.markerFingerprint = hash(JSON.stringify(workload.markers));
        if (previous && sameCommandIdentities(previous.captured, inventory) && heartbeatGrowth(previous.heartbeats, workload.heartbeats)) {
          evidence.executingTwice = true; evidence.commandIdentityVerified = true; evidence.bothHeartbeatsGrew = true;
          evidence.commandProcessesCaptured = captured.length;
          evidence.rootHeartbeatBefore = previous.heartbeats.root; evidence.rootHeartbeatAtInterrupt = workload.heartbeats.root;
          evidence.childHeartbeatBefore = previous.heartbeats.child; evidence.childHeartbeatAtInterrupt = workload.heartbeats.child;
          return;
        }
        previous = { captured, heartbeats: workload.heartbeats };
      } else previous = undefined;
    } else previous = undefined;
    await delay();
  }
  throw new Error('executing command proof deadline');
}

async function cancellationTwice(request, task, evidence, createdAt) {
  const deadline = Date.now() + 30000;
  let prior, stable = 0;
  while (Date.now() < deadline) {
    const observed = await readOperation(request, task);
    const workload = workloadSnapshot(request.cwd);
    const gone = commandProcessesGone(task.execution.captured, await processInventory());
    const cancelled = cancelledSnapshot({ ...observed, createdAt, originalToolID: task.execution.originalToolID });
    const integrity = workload.completionAbsent && workload.scriptHash === task.scriptHash && hash(JSON.stringify(workload.markers)) === task.execution.markerFingerprint;
    const fingerprint = JSON.stringify([conversationFingerprint(observed.messages), workload.heartbeats]);
    stable = cancelled && gone && integrity ? (prior === fingerprint ? stable + 1 : 1) : 0;
    prior = stable ? fingerprint : undefined;
    if (stable >= 2) {
      Object.assign(evidence, { cancelledStableTwice: true, cancelledToolType: 'aborted', commandProcessesGoneTwice: true,
        heartbeatsStableTwice: true, completionMarkersAbsent: true });
      task.execution.cancelledHeartbeats = workload.heartbeats;
      return;
    }
    await delay();
  }
  throw new Error('command cancellation not independently verified');
}

async function observe(request, task) {
  const evidence = { commandCancelObserved: false, commandStage: 'approval', approvalRepliesSent: 0, fallbackTerminationUsed: false };
  try {
    const before = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
    const service = await request.serviceApi(request.cwd, 'GET', '/api/info');
    await approveOwnedCommand(request, task, evidence);
    evidence.commandStage = 'execution';
    await executionTwice(request, task, evidence, service.pid);
    evidence.commandStage = 'interrupt';
    const interruptedAt = Date.now();
    evidence.interruptAccepted = (await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {})).interrupted === true;
    evidence.secondInterruptInactive = (await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {})).interrupted === false;
    if (!evidence.interruptAccepted || !evidence.secondInterruptInactive) throw new Error('command interruption unverified');
    evidence.commandStage = 'quiescence';
    await cancellationTwice(request, task, evidence, before.time.created);
    evidence.cancellationObservationMs = Date.now() - interruptedAt;
    const final = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
    const after = await request.serviceApi(request.cwd, 'GET', '/api/info');
    evidence.sessionIdentityPreserved = sameSession(before, final, request.cwd);
    evidence.serviceIdentityPreserved = after.pid === service.pid && after.version === service.version;
    evidence.commandCancelObserved = evidence.sessionIdentityPreserved && evidence.serviceIdentityPreserved;
    evidence.commandStage = 'completed';
  } catch { evidence.error = 'owned executing-command cancellation failed'; }
  finally {
    try {
      if (task.execution.captured && !commandProcessesGone(task.execution.captured, await processInventory())) {
        evidence.fallbackTerminationUsed = true;
        evidence.fallbackTerminationVerified = await terminateCapturedCommand(task.execution.captured);
      }
    } catch { evidence.commandCleanupError = 'owned command cleanup unverified'; }
  }
  return evidence;
}

async function verifyAfterStop(cwd, task) {
  const before = workloadSnapshot(cwd);
  await delay();
  const after = workloadSnapshot(cwd);
  const captured = task.execution.captured;
  return { scriptUnchanged: before.scriptHash === task.scriptHash && after.scriptHash === task.scriptHash,
    commandProcessesGoneAfterCleanup: Boolean(captured && commandProcessesGone(captured, await processInventory())),
    heartbeatsStableAfterCleanup: JSON.stringify(before.heartbeats) === JSON.stringify(after.heartbeats)
      && JSON.stringify(after.heartbeats) === JSON.stringify(task.execution.cancelledHeartbeats),
    commandMarkersUnchanged: hash(JSON.stringify(before.markers)) === task.execution.markerFingerprint && hash(JSON.stringify(after.markers)) === task.execution.markerFingerprint,
    completionMarkersAbsentAfterCleanup: before.completionAbsent && after.completionAbsent };
}

async function main() {
  const before = configFingerprints();
  const executionFixture = fs.readFileSync(path.resolve(__dirname, '../fixtures/execution-fixture.cjs'), 'utf8');
  const nonce = crypto.randomBytes(16).toString('hex');
  const command = `rtk proxy node execution-fixture.cjs root ${nonce}`;
  const prompt = `Call the shell tool exactly once with this exact command: ${command}. Use the current project directory and a 120000 ms timeout. Wait for approval. The parent will stop this harmless long-running fixture. Do not use other tools, read or edit files, retry, or use fallbacks. If interrupted, stop.`;
  const task = { kind: 'command-cancel', command, prompt, nonce, executionFixture, scriptHash: hash(executionFixture), execution: {}, permissions: SERVICE_PERMISSIONS };
  task.observe = request => observe(request, task);
  task.verifyAfterStop = cwd => verifyAfterStop(cwd, task);
  const names = ['run-command-cancel.js', 'command-cancel-evidence.js', 'command-process-cleanup.js', 'run-tool-probe.js', 'service-cli.js', 'approval-evidence.js', 'active-disconnect-evidence.js', 'service-quiescence.js', 'persistent-cli.js', 'terminal-task.js', 'terminal-client.js', 'session-identity.js', '../fixtures/execution-fixture.cjs'];
  const evidence = { scope: 'Scoped cancellation after one approved harmless local shell command and its child both execute; not arbitrary external-effect rollback', recordedAt: new Date().toISOString(),
    sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])), promptHash: hash(prompt) };
  evidence.run = await runMember('member-a', { terminalMode: true, task });
  evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.run.passed && evidence.selectedConfigsUnchanged;
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/command-cancel-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[command-cancel] ${evidence.result}`); process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[command-cancel] lifecycle failure'); process.exitCode = 1; });
module.exports = { approveOwnedCommand, executionTwice, cancellationTwice, verifyAfterStop };

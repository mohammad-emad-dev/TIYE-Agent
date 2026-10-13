'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { crashOwnedClient } = require('./client-crash');
const { sameSession } = require('./session-identity');
const { conversationFingerprint } = require('./recovery-evidence');
const { activePendingSnapshot, cancelledSnapshot } = require('./active-disconnect-evidence');
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));
const command = `rtk proxy node -e "require('node:fs').writeFileSync('approval-marker.txt','approved')"`;
const prompt = `Call the shell tool exactly once with command: ${command}. Use the current project directory. Wait for approval. Do not use other tools, retry or use fallbacks. If interrupted, stop. Never claim that an unapproved command ran.`;

async function readSnapshot(request, task) {
  const { cwd, sessionID, serviceApi } = request;
  const messages = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
  const pending = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/permission`)).data;
  if (!Array.isArray(messages) || !Array.isArray(pending)) throw new Error('active snapshot schema invalid');
  return { messages, pending, snapshot: activePendingSnapshot({ messages, requests: pending, sessionID, task, cwd }) };
}

async function pendingTwice(request, task, original) {
  const deadline = Date.now() + 90000;
  let prior, stable = 0;
  while (Date.now() < deadline) {
    const observed = await readSnapshot(request, task);
    const permission = observed.snapshot.request;
    if (observed.snapshot.activePending) {
      const identity = JSON.stringify([permission.id, permission.source.messageID, permission.source.id]);
      if (original && identity !== original) throw new Error('pending operation identity changed');
      stable = identity === prior ? stable + 1 : 1; prior = identity;
      if (stable >= 2) return { ...observed, identity };
    } else {
      stable = 0; prior = undefined;
      if (!observed.snapshot.evidence.noAssistantErrors || observed.snapshot.evidence.completedShellCalls > 0) throw new Error('active operation ended unexpectedly');
    }
    await delay();
  }
  throw new Error('pending operation not established');
}

async function cancellationTwice(request, task, originalToolID, createdAt) {
  const deadline = Date.now() + 30000;
  let prior, stable = 0;
  while (Date.now() < deadline) {
    const observed = await readSnapshot(request, task);
    const matched = cancelledSnapshot({ ...observed, originalToolID, createdAt });
    const fingerprint = conversationFingerprint(observed.messages);
    stable = matched ? (prior === fingerprint ? stable + 1 : 1) : 0;
    prior = matched ? fingerprint : undefined;
    if (stable >= 2) return observed;
    await delay();
  }
  throw new Error('cancelled operation not quiescent');
}

async function performDisconnect({ request, task, evidence }) {
  const initial = await pendingTwice(request, task);
  const before = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const service = await request.serviceApi(request.cwd, 'GET', '/api/info');
  const marker = path.join(request.cwd, 'approval-marker.txt');
  evidence.pendingBeforeCrashTwice = true;
  evidence.markerAbsentBeforeCrash = !fs.existsSync(marker);
  if (!evidence.markerAbsentBeforeCrash) throw new Error('command already executed');
  evidence.disconnectStage = 'crash';
  Object.assign(evidence, await crashOwnedClient(request, service.pid));
  evidence.disconnectStage = 'backend-pending';
  const after = await pendingTwice(request, task, initial.identity);
  const sessionAfter = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const serviceAfter = await request.serviceApi(request.cwd, 'GET', '/api/info');
  evidence.pendingAfterCrashTwice = true;
  evidence.originalOperationPreserved = after.identity === initial.identity;
  evidence.sessionIdentityPreserved = sameSession(before, sessionAfter, request.cwd);
  evidence.servicePreservedAcrossCrash = service.pid === serviceAfter.pid && service.version === serviceAfter.version;
  evidence.markerAbsentAfterCrash = !fs.existsSync(marker);
  if (!evidence.sessionIdentityPreserved || !evidence.servicePreservedAcrossCrash || !evidence.markerAbsentAfterCrash) throw new Error('post-crash ownership or file scope changed');
  evidence.disconnectStage = 'interrupt';
  const interruptedAt = Date.now();
  const interrupted = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
  evidence.interruptAccepted = interrupted.interrupted === true;
  const again = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
  evidence.secondInterruptInactive = again.interrupted === false;
  if (!evidence.interruptAccepted || !evidence.secondInterruptInactive) throw new Error('owned cancellation unverified');
  const cancelled = await cancellationTwice(request, task, initial.snapshot.request.source.id, before.time.created);
  evidence.cancellationObservationMs = Date.now() - interruptedAt;
  evidence.cancelledStableTwice = true;
  evidence.cancelledToolType = cancelled.snapshot.evidence.failedShellErrorTypes[0];
  evidence.markerAbsentAfterCancel = !fs.existsSync(marker);
  const final = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  evidence.sessionIdentityPreserved &&= sameSession(before, final, request.cwd);
  evidence.approvalRepliesSent = 0;
  evidence.activeDisconnectObserved = evidence.sessionIdentityPreserved && evidence.markerAbsentAfterCancel;
  evidence.disconnectStage = 'completed';
  return evidence;
}

async function observe(request, task) {
  const evidence = { activeDisconnectObserved: false, disconnectStage: 'await-pending' };
  try { return await performDisconnect({ request, task, evidence }); }
  catch { return { ...evidence, error: 'owned active-client disconnect failed' }; }
}

async function main() {
  const before = configFingerprints();
  const task = { kind: 'active-disconnect', prompt, command, permissions: SERVICE_PERMISSIONS };
  task.observe = request => observe(request, task);
  const names = ['run-active-disconnect.js', 'active-disconnect-evidence.js', 'client-crash.js', 'session-identity.js', 'approval-evidence.js', 'service-quiescence.js', 'run-tool-probe.js', 'terminal-client.js', 'terminal-task.js', 'terminal-main.js', 'service-cli.js'];
  const evidence = { scope: 'Native client terminated while own backend shell tool waits for approval, followed by scoped session cancellation; not token-stream/service crash recovery', recordedAt: new Date().toISOString(),
    sourceHashes: Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])),
    promptHash: crypto.createHash('sha256').update(prompt).digest('hex') };
  evidence.run = await runMember('member-a', { terminalMode: true, task });
  evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.run.passed && evidence.selectedConfigsUnchanged;
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/active-disconnect-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[active-disconnect] ${evidence.result}`);
  process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[active-disconnect] lifecycle failure'); process.exitCode = 1; });

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { serviceApi, SERVICE_PERMISSIONS } = require('./service-cli');
const { closePrivate, processInventory, waitUntil } = require('./persistent-cli');
const { approveOwnedCommand, executionTwice, cancellationTwice, verifyAfterStop } = require('./run-command-cancel');
const { commandProcessesGone, commandCancelRunPassed } = require('./command-cancel-evidence');
const { terminateCapturedCommand } = require('./command-process-cleanup');
const { inspectStrictAsk } = require('./strict-ask-preflight');
const { createStrictAskInputGate } = require('./strict-ask-input');
const { sameSession } = require('./session-identity');
const { conversationFingerprint } = require('./recovery-evidence');
const controlCwd = path.resolve(__dirname, '../../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function observe(request, task, ownership, { trigger, afterSuspension } = {}) {
  const evidence = { approvalRepliesSent: 0, fallbackTerminationUsed: false, commandCancelObserved: false, suspendCalls: 0, faultReads: 0, inputTransportCalls: 0 };
  let gate;
  try {
    const before = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
    const inspected = await inspectStrictAsk(request.cwd, serviceApi);
    if (inspected.evidence.status !== 'clear') throw new Error('active input gate baseline blocked');
    const context = inspected.context;
    let inject = false;
    const observedApi = async (cwd, method, route, body) => {
      if (inject && method === 'GET' && route === `/api/permission/saved?projectID=${encodeURIComponent(context.projectID)}`) {
        inject = false; evidence.faultReads++;
        throw new Error('injected permission read failure');
      }
      return serviceApi(cwd, method, route, body);
    };
    gate = await createStrictAskInputGate({ context, api: trigger ? serviceApi : observedApi, intervalMs: 250,
      send: text => { evidence.inputTransportCalls++; return serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/prompt`, { text, resume: false }); },
      stop: async () => {
        evidence.suspendCalls++;
        // The gate already closed adapter input synchronously. Revalidate actual ownership before mutation.
        const service = await serviceApi(controlCwd, 'GET', '/api/info');
        const location = await serviceApi(controlCwd, 'GET', `/api/location?location[directory]=${encodeURIComponent(request.cwd)}`);
        const session = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
        evidence.stopOwnershipConfirmed = service.pid === context.servicePID && service.version === context.version
          && location?.project?.id === context.projectID && path.resolve(location.project.directory).toLowerCase() === context.projectDirectory
          && sameSession(before, session, request.cwd);
        if (!evidence.stopOwnershipConfirmed) throw new Error('active stop ownership unverified');
        evidence.inputBlockedBeforeStop = gate.status().status === 'blocked';
        evidence.interruptAccepted = (await serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {})).interrupted === true;
        evidence.secondInterruptInactive = (await serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {})).interrupted === false;
        if (!evidence.interruptAccepted || !evidence.secondInterruptInactive) throw new Error('active input stop unverified');
        await cancellationTwice(request, task, evidence, before.time.created);
        return { verified: true };
      } });
    evidence.initialInputOpen = gate.status().status === 'open';
    if (!evidence.initialInputOpen) throw new Error('active input not open');
    await approveOwnedCommand(request, task, evidence);
    await executionTwice(request, task, evidence, context.servicePID);
    if (trigger) await trigger({ context, request, evidence });
    else inject = true;
    await waitUntil(() => ['suspended', 'stop-unverified'].includes(gate.status().monitor.status), 30000);
    evidence.suspensionStatus = gate.status();
    if (evidence.suspensionStatus.monitor.status !== 'suspended' || evidence.faultReads !== (trigger ? 0 : 1) || evidence.suspendCalls !== 1) throw new Error('active input suspension failed');
    if (afterSuspension) await afterSuspension({ gate, evidence });
    const messages = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
    evidence.rejectedInput = await gate.submit('TIYE blocked fixture input');
    const afterMessages = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
    evidence.rejectedInputMessagesUnchanged = Array.isArray(messages) && Array.isArray(afterMessages) && conversationFingerprint(messages) === conversationFingerprint(afterMessages);
    if (evidence.rejectedInput.status !== 'blocked' || evidence.inputTransportCalls !== 0 || !evidence.rejectedInputMessagesUnchanged) throw new Error('suspended input reached native transport');
    const final = (await serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
    const afterService = await serviceApi(controlCwd, 'GET', '/api/info');
    evidence.sessionIdentityPreserved = sameSession(before, final, request.cwd);
    evidence.serviceIdentityPreserved = afterService.pid === context.servicePID && afterService.version === context.version;
    evidence.commandCancelObserved = evidence.sessionIdentityPreserved && evidence.serviceIdentityPreserved;
  } catch { evidence.error = 'active strict ask input observation failed'; }
  finally {
    try { if (gate) { evidence.closedStatus = await gate.close(); ownership.gateClosed = evidence.closedStatus.status === 'closed'; } }
    catch { evidence.error = 'active input gate close failed'; }
    try {
      if (task.execution.captured && !commandProcessesGone(task.execution.captured, await processInventory())) {
        evidence.fallbackTerminationUsed = true;
        evidence.fallbackTerminationVerified = await terminateCapturedCommand(task.execution.captured);
      }
    } catch { evidence.commandCleanupError = 'active owned command cleanup unverified'; }
  }
  return evidence;
}

function activeInputRunPassed(run) {
  const cli = run?.cli;
  return Boolean(commandCancelRunPassed(run) && cli.initialInputOpen && cli.suspendCalls === 1 && cli.faultReads === 1
    && cli.stopOwnershipConfirmed && cli.inputBlockedBeforeStop && cli.suspensionStatus?.monitor?.status === 'suspended'
    && cli.suspensionStatus.reason === 'permission-state-unverified' && cli.rejectedInput?.status === 'blocked'
    && cli.inputTransportCalls === 0 && cli.rejectedInputMessagesUnchanged && cli.closedStatus?.status === 'closed');
}

async function main() {
  const before = configFingerprints();
  if ((await serviceApi(controlCwd, 'GET', '/api/info')).version !== '2.0.28') throw new Error('active gate requires reviewed 2.0.28');
  const executionFixture = fs.readFileSync(path.resolve(__dirname, '../fixtures/execution-fixture.cjs'), 'utf8');
  const nonce = crypto.randomBytes(16).toString('hex');
  const command = `rtk proxy node execution-fixture.cjs root ${nonce}`;
  const prompt = `Call the shell tool exactly once with this exact command: ${command}. Use the current project directory and a 120000 ms timeout. Wait for approval. The parent will stop this harmless long-running fixture. Do not use other tools, read or edit files, retry, or use fallbacks. If interrupted, stop.`;
  const ownership = { gateClosed: false };
  const task = { kind: 'command-cancel', command, prompt, nonce, executionFixture, scriptHash: hash(executionFixture), execution: {}, permissions: SERVICE_PERMISSIONS,
    initialCommitMessage: `TIYE active input ${crypto.randomUUID()}`, verifyOwnedCleanup: () => ownership.gateClosed };
  task.observe = request => observe(request, task, ownership);
  task.verifyAfterStop = cwd => verifyAfterStop(cwd, task);
  const names = ['run-strict-ask-active.js', 'strict-ask-input.js', 'strict-ask-monitor.js', 'strict-ask-preflight.js', 'run-command-cancel.js', 'command-cancel-evidence.js',
    'command-process-cleanup.js', 'run-tool-probe.js', 'service-cli.js', 'approval-evidence.js', 'active-disconnect-evidence.js', 'service-quiescence.js', 'persistent-cli.js',
    'terminal-task.js', 'terminal-client.js', 'session-identity.js', 'recovery-evidence.js', '../fixtures/execution-fixture.cjs'];
  const measurement = { scope: 'Adapter input gate and owned active command suspension after one injected permission-read failure; not native saved-grant-triggered cancellation or atomic veto',
    recordedAt: new Date().toISOString(), expectedVersion: '2.0.28', sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])), promptHash: hash(prompt) };
  measurement.run = await runMember('member-a', { terminalMode: true, task });
  measurement.run.passed = activeInputRunPassed(measurement.run);
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.run.passed && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/strict-ask-active-latest.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[strict-ask-active] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[strict-ask-active] lifecycle failure'); process.exitCode = 1; });
module.exports = { activeInputRunPassed, observeActiveInput: observe };

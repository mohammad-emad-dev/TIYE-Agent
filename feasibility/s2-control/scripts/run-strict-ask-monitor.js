'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { serviceApi, SERVICE_PERMISSIONS } = require('./service-cli');
const { MODEL, ownedSavedRules } = require('./saved-approval-evidence');
const { taskDefinition, projectIdentity, savedRows, observePhase, chooseAlways, removeOwnedRules } = require('./run-saved-approvals');
const { closePrivate, waitUntil } = require('./persistent-cli');
const { launchWithStrictAsk } = require('./strict-ask-preflight');
const { createStrictAskMonitor } = require('./strict-ask-monitor');
const controlCwd = path.resolve(__dirname, '../../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sameDirectory = (left, right) => typeof left === 'string' && typeof right === 'string' && path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();

async function observe(request, ownership) {
  const evidence = { parentPermissionReplies: 0, suspendCalls: 0, savedRuleRemoved: false, monitorIntervalMs: 250 };
  let idleID, monitor;
  try {
    ownership.projectID = await projectIdentity(request.cwd);
    evidence.savedBaselineEmpty = (await savedRows(ownership.projectID)).length === 0;
    if (!evidence.savedBaselineEmpty) throw new Error('monitor saved baseline invalid');
    const pending = (await observePhase(request, { name: 'monitor-seed-pending', outcome: 'pending', marker: null })).snapshot.request;
    const launch = await launchWithStrictAsk({ cwd: request.cwd, launch: async context => {
      ownership.idleSessionUnverified = true;
      const created = (await serviceApi(request.cwd, 'POST', '/api/session', { location: { directory: context.cwd }, agent: 'build', model: MODEL,
        permissions: SERVICE_PERMISSIONS, title: 'TIYE strict ask monitor idle fixture' })).data;
      if (!/^ses_[A-Za-z0-9]+$/.test(created?.id)) throw new Error('monitor idle identity invalid');
      idleID = created.id;
      evidence.idleSelectionConfirmed = sameDirectory(created.location?.directory, request.cwd) && created.agent === 'build'
        && JSON.stringify(created.permissions) === JSON.stringify(SERVICE_PERMISSIONS) && Object.entries(MODEL).every(([key, value]) => created.model?.[key] === value);
      if (!evidence.idleSelectionConfirmed) throw new Error('monitor idle selection invalid');
      monitor = await createStrictAskMonitor({ context, intervalMs: evidence.monitorIntervalMs, suspend: async () => {
        evidence.suspendCalls++;
        // This fixture accepts no input. A real adapter must close its input path before the owned stop.
        const service = await serviceApi(controlCwd, 'GET', '/api/info');
        if (service.pid !== context.servicePID || service.version !== context.version) throw new Error('monitor stop service changed');
        const session = (await serviceApi(request.cwd, 'GET', `/api/session/${idleID}`)).data;
        const location = await serviceApi(controlCwd, 'GET', `/api/location?location[directory]=${encodeURIComponent(request.cwd)}`);
        evidence.stopOwnershipConfirmed = session?.id === idleID && sameDirectory(session.location?.directory, context.cwd)
          && location?.project?.id === context.projectID && sameDirectory(location.directory, context.cwd)
          && sameDirectory(location.project.directory, context.projectDirectory);
        if (!evidence.stopOwnershipConfirmed) throw new Error('monitor stop ownership invalid');
        const stopped = await serviceApi(request.cwd, 'POST', `/api/session/${idleID}/interrupt`, {});
        const messages = (await serviceApi(request.cwd, 'GET', `/api/session/${idleID}/message?limit=100&order=desc`)).data;
        const permissions = (await serviceApi(request.cwd, 'GET', `/api/session/${idleID}/permission`)).data;
        evidence.idleNeverExecuted = stopped?.interrupted === false && Array.isArray(messages) && messages.length === 0 && Array.isArray(permissions) && permissions.length === 0;
        return { verified: evidence.idleNeverExecuted };
      } });
      return true;
    } });
    evidence.initialLaunchAllowed = launch.status === 'launched';
    evidence.initialMonitorArmed = monitor?.status().status === 'armed';
    if (!evidence.initialLaunchAllowed || !evidence.initialMonitorArmed) throw new Error('monitor startup not armed');
    ownership.proposed = pending.save;
    if (!Array.isArray(ownership.proposed) || !ownership.proposed.length || ownership.proposed.some(pattern => typeof pattern !== 'string')) throw new Error('monitor proposals invalid');
    await chooseAlways(request, pending, evidence, ownership);
    evidence.seed = (await observePhase(request, { name: 'seed-always', outcome: 'completed', marker: 'approved' })).evidence;
    const rows = await savedRows(ownership.projectID);
    evidence.savedRuleOwned = ownedSavedRules({ rows, ...ownership });
    if (!evidence.savedRuleOwned) throw new Error('monitor saved ownership invalid');
    evidence.savedRuleCount = rows.length;
    await waitUntil(() => monitor.status().status !== 'armed' && monitor.status().status !== 'suspending', 90000);
    evidence.detectedStatus = monitor.status();
    if (evidence.detectedStatus.status !== 'suspended' || evidence.detectedStatus.reason !== 'saved-shell-allow' || evidence.suspendCalls !== 1) throw new Error('monitor did not suspend');
    await removeOwnedRules(ownership);
    evidence.savedRuleRemoved = ownership.rulesRemoved;
    evidence.afterRevocation = await monitor.check();
    evidence.noAutoResume = evidence.afterRevocation.status === 'suspended' && evidence.suspendCalls === 1;
    if (!evidence.noAutoResume) throw new Error('monitor resumed after revocation');
  } catch { evidence.error = 'strict ask monitor observation failed'; }
  finally {
    try { if (monitor) { evidence.closedStatus = await monitor.close(); evidence.monitorClosed = evidence.closedStatus.status === 'closed'; } }
    catch { evidence.error = 'monitor close failed'; }
    try {
      if (idleID) {
        const stopped = await serviceApi(request.cwd, 'POST', `/api/session/${idleID}/interrupt`, {});
        if (stopped?.interrupted !== false) throw new Error('monitor idle cleanup not stopped');
        await serviceApi(request.cwd, 'DELETE', `/api/session/${idleID}`);
        const sessions = (await serviceApi(request.cwd, 'GET', `/api/session?directory=${encodeURIComponent(request.cwd)}`)).data;
        evidence.idleSessionRemoved = Array.isArray(sessions) && !sessions.some(session => session.id === idleID);
        ownership.idleSessionUnverified = !evidence.idleSessionRemoved;
        if (!evidence.idleSessionRemoved) throw new Error('monitor idle deletion unverified');
      }
    } catch { evidence.error = 'monitor idle cleanup failed'; }
    try { await removeOwnedRules(ownership); evidence.savedRuleRemoved = ownership.rulesRemoved || !ownership.approvalSent; }
    catch { evidence.error = 'monitor saved cleanup failed'; }
    try { evidence.originalClientCleanup = await closePrivate(request.state); }
    catch { evidence.error = 'monitor original client cleanup failed'; }
  }
  return evidence;
}

function monitorRunPassed(run) {
  const cli = run?.cli;
  return Boolean(!run?.error && !run?.fixtureErrors && !cli?.error && cli?.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.locationConfirmed && cli.connected
    && cli.savedBaselineEmpty && cli.initialLaunchAllowed && cli.initialMonitorArmed && cli.idleSelectionConfirmed
    && cli.seed?.passed && cli.seed.phaseObserved && cli.seed.stableTwice && cli.seed.markerMatched && cli.seed.executedModelConfirmed
    && cli.savedRuleOwned && cli.savedRuleCount > 0 && cli.savedRuleRemoved && cli.uiAlwaysSelectedTwice && cli.uiAlwaysInputMatched
    && cli.navigationInput?.matched && cli.decisionInput?.matched && cli.parentPermissionReplies === 0
    && cli.detectedStatus?.status === 'suspended' && cli.detectedStatus.reason === 'saved-shell-allow' && cli.suspendCalls === 1
    && cli.stopOwnershipConfirmed && cli.idleNeverExecuted && cli.noAutoResume && cli.afterRevocation?.status === 'suspended'
    && cli.monitorClosed && cli.closedStatus?.disposition === 'suspended' && cli.idleSessionRemoved
    && cli.originalClientCleanup?.verified && cli.originalClientCleanup.jobVerified && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified)
    && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerMatched && run.onlyFixtureFilesPresent && run.fixtureStopped && run.tempRemoved
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0 && run.logHygiene && !run.serverLogTruncated);
}

async function main() {
  const before = configFingerprints();
  if ((await serviceApi(controlCwd, 'GET', '/api/info')).version !== '2.0.28') throw new Error('monitor requires reviewed 2.0.28');
  const names = ['strict-ask-preflight.js', 'strict-ask-monitor.js', 'run-strict-ask-monitor.js', 'run-saved-approvals.js', 'saved-approval-evidence.js', 'run-tool-probe.js', 'service-cli.js',
    'terminal-client.js', 'terminal-main.js', 'terminal-renderer.js', 'terminal-preload.js', 'terminal-ui.js', 'terminal-approval-evidence.js', 'approval-evidence.js', 'persistent-cli.js', 'service-quiescence.js', 'recovery-evidence.js', 'terminal-task.js'];
  const measurement = { scope: 'Prototype polling detects an owned native saved shell grant and suspends one owned idle session; no active-command prevention or core adapter guarantee',
    recordedAt: new Date().toISOString(), expectedVersion: '2.0.28', sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])) };
  const ownership = { approvalSent: false, rulesRemoved: false, idleSessionUnverified: false };
  const task = { ...taskDefinition, kind: 'permission', caseID: 'strict-ask-monitor', permissions: SERVICE_PERMISSIONS, expectedMarker: 'approved',
    initialCommitMessage: `TIYE strict ask monitor ${crypto.randomUUID()}`, verifyOwnedCleanup: () => (!ownership.approvalSent || ownership.rulesRemoved) && !ownership.idleSessionUnverified,
    observe: request => observe(request, ownership) };
  measurement.run = await runMember('member-a', { terminalMode: true, task });
  measurement.run.passed = monitorRunPassed(measurement.run);
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.run.passed && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/strict-ask-monitor-latest.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[strict-ask-monitor] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[strict-ask-monitor] lifecycle failure'); process.exitCode = 1; });
module.exports = { monitorRunPassed };

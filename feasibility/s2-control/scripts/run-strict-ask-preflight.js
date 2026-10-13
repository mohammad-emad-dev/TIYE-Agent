'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { serviceApi, SERVICE_PERMISSIONS } = require('./service-cli');
const { MODEL, ownedSavedRules } = require('./saved-approval-evidence');
const { taskDefinition, projectIdentity, savedRows, observePhase, chooseAlways, removeOwnedRules } = require('./run-saved-approvals');
const { closePrivate } = require('./persistent-cli');
const { strictAskPreflight, launchWithStrictAsk } = require('./strict-ask-preflight');
const controlCwd = path.resolve(__dirname, '../../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function idleLaunch(cwd, evidence, ownership) {
  let sessionID;
  try {
    const result = await launchWithStrictAsk({ cwd, launch: async context => {
      evidence.launchCallbacks++;
      ownership.idleSessionUnverified = true;
      const created = (await serviceApi(cwd, 'POST', '/api/session', { location: { directory: context.cwd }, agent: 'build', model: MODEL,
        permissions: SERVICE_PERMISSIONS, title: 'TIYE strict ask preflight idle fixture' })).data;
      if (!/^ses_[A-Za-z0-9]+$/.test(created?.id)) throw new Error('idle session identity invalid');
      sessionID = created.id;
      evidence.idleSessionSelectionConfirmed = JSON.stringify(created.permissions) === JSON.stringify(SERVICE_PERMISSIONS) && created.agent === 'build'
        && Object.entries(MODEL).every(([key, value]) => created.model?.[key] === value)
        && path.resolve(created.location?.directory || '').toLowerCase() === path.resolve(cwd).toLowerCase()
        && context.projectID === ownership.projectID;
      if (!evidence.idleSessionSelectionConfirmed) throw new Error('idle session selection invalid');
      return true;
    } });
    evidence.revokedLaunchStatus = result.status;
    if (result.status !== 'launched') throw new Error('revoked idle launch blocked');
    const messages = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
    const pending = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/permission`)).data;
    const interrupted = await serviceApi(cwd, 'POST', `/api/session/${sessionID}/interrupt`, {});
    evidence.idleSessionNeverExecuted = Array.isArray(messages) && messages.length === 0 && Array.isArray(pending) && pending.length === 0 && interrupted?.interrupted === false;
    if (!evidence.idleSessionNeverExecuted) throw new Error('idle session activity unexpected');
  } finally {
    if (sessionID) {
      // Only this freshly created session; no client or model request was started.
      const stopped = await serviceApi(cwd, 'POST', `/api/session/${sessionID}/interrupt`, {});
      if (stopped?.interrupted !== false) throw new Error('idle session stop unverified');
      await serviceApi(cwd, 'DELETE', `/api/session/${sessionID}`);
      const sessions = (await serviceApi(cwd, 'GET', `/api/session?directory=${encodeURIComponent(cwd)}`)).data;
      evidence.idleSessionRemoved = Array.isArray(sessions) && !sessions.some(session => session.id === sessionID);
      ownership.idleSessionUnverified = !evidence.idleSessionRemoved;
      if (!evidence.idleSessionRemoved) throw new Error('idle session removal unverified');
    }
  }
}

async function observe(request, ownership) {
  const evidence = { parentPermissionReplies: 0, launchCallbacks: 0, savedRuleRemoved: false };
  try {
    ownership.projectID = await projectIdentity(request.cwd);
    evidence.savedBaselineEmpty = (await savedRows(ownership.projectID)).length === 0;
    if (!evidence.savedBaselineEmpty) throw new Error('saved baseline not empty');
    evidence.emptyPreflight = await strictAskPreflight({ cwd: request.cwd });
    if (evidence.emptyPreflight.status !== 'clear') throw new Error('empty preflight blocked');
    const pending = (await observePhase(request, { name: 'preflight-seed-pending', outcome: 'pending', marker: null })).snapshot.request;
    ownership.proposed = pending.save;
    if (!Array.isArray(ownership.proposed) || !ownership.proposed.length || ownership.proposed.some(pattern => typeof pattern !== 'string')) throw new Error('proposed patterns invalid');
    await chooseAlways(request, pending, evidence, ownership);
    evidence.seed = (await observePhase(request, { name: 'seed-always', outcome: 'completed', marker: 'approved' })).evidence;
    const rows = await savedRows(ownership.projectID);
    evidence.savedRuleOwned = ownedSavedRules({ rows, ...ownership });
    if (!evidence.savedRuleOwned) throw new Error('saved ownership invalid');
    evidence.savedRuleCount = rows.length;
    const before = (await serviceApi(request.cwd, 'GET', `/api/session?directory=${encodeURIComponent(request.cwd)}`)).data;
    if (!Array.isArray(before)) throw new Error('session baseline invalid');
    evidence.conflictPreflight = await launchWithStrictAsk({ cwd: request.cwd, launch: () => { evidence.launchCallbacks++; throw new Error('blocked callback executed'); } });
    const after = (await serviceApi(request.cwd, 'GET', `/api/session?directory=${encodeURIComponent(request.cwd)}`)).data;
    evidence.blockedSessionSetUnchanged = Array.isArray(after) && JSON.stringify(before.map(session => session.id).sort()) === JSON.stringify(after.map(session => session.id).sort());
    if (evidence.conflictPreflight.status !== 'blocked' || evidence.conflictPreflight.reason !== 'saved-shell-allow'
      || evidence.conflictPreflight.conflictingRules !== rows.length || evidence.launchCallbacks !== 0 || !evidence.blockedSessionSetUnchanged) throw new Error('conflict launch not blocked');
    await removeOwnedRules(ownership);
    evidence.savedRuleRemoved = ownership.rulesRemoved;
    await idleLaunch(request.cwd, evidence, ownership);
  } catch { evidence.error = 'strict ask preflight observation failed'; }
  finally {
    try { await removeOwnedRules(ownership); evidence.savedRuleRemoved = ownership.rulesRemoved || !ownership.approvalSent; }
    catch { evidence.error = 'strict ask saved rule cleanup failed'; }
    try { evidence.originalClientCleanup = await closePrivate(request.state); }
    catch { evidence.error = 'strict ask original client cleanup failed'; }
  }
  return evidence;
}

function preflightRunPassed(run) {
  const cli = run?.cli;
  return Boolean(!run?.error && !run?.fixtureErrors && !cli?.error && cli?.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.locationConfirmed && cli.connected
    && cli.savedBaselineEmpty && cli.emptyPreflight?.status === 'clear' && cli.emptyPreflight.stableReads === 2
    && cli.seed?.passed && cli.seed.phaseObserved && cli.seed.stableTwice && cli.seed.markerMatched && cli.seed.freshPromptAndAssistants && cli.seed.executedModelConfirmed
    && cli.savedRuleOwned && cli.savedRuleCount > 0 && cli.savedRuleRemoved && cli.uiAlwaysSelectedTwice && cli.uiAlwaysInputMatched
    && cli.navigationInput?.matched && cli.decisionInput?.matched && cli.parentPermissionReplies === 0
    && cli.conflictPreflight?.status === 'blocked' && cli.conflictPreflight.reason === 'saved-shell-allow' && cli.conflictPreflight.conflictingRules === cli.savedRuleCount
    && cli.blockedSessionSetUnchanged && cli.launchCallbacks === 1 && cli.revokedLaunchStatus === 'launched' && cli.idleSessionSelectionConfirmed && cli.idleSessionNeverExecuted && cli.idleSessionRemoved
    && cli.originalClientCleanup?.verified && cli.originalClientCleanup.jobVerified && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified)
    && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerMatched && run.onlyFixtureFilesPresent && run.fixtureStopped && run.tempRemoved
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0 && run.logHygiene && !run.serverLogTruncated);
}

async function main() {
  const before = configFingerprints();
  if ((await serviceApi(controlCwd, 'GET', '/api/info')).version !== '2.0.28') throw new Error('preflight requires reviewed 2.0.28');
  const names = ['strict-ask-preflight.js', 'run-strict-ask-preflight.js', 'run-saved-approvals.js', 'saved-approval-evidence.js', 'run-tool-probe.js', 'service-cli.js',
    'terminal-client.js', 'terminal-main.js', 'terminal-renderer.js', 'terminal-preload.js', 'terminal-ui.js', 'terminal-approval-evidence.js', 'approval-evidence.js', 'persistent-cli.js', 'service-quiescence.js', 'recovery-evidence.js', 'terminal-task.js'];
  const measurement = { scope: 'Prototype strict-ask launch preflight against an owned native saved shell grant, then revocation and one idle session launch; no continuous monitoring or atomic guarantee',
    recordedAt: new Date().toISOString(), expectedVersion: '2.0.28', sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])) };
  const ownership = { approvalSent: false, rulesRemoved: false, idleSessionUnverified: false };
  const task = { ...taskDefinition, kind: 'permission', caseID: 'strict-ask-preflight', permissions: SERVICE_PERMISSIONS, expectedMarker: 'approved',
    initialCommitMessage: `TIYE strict ask preflight ${crypto.randomUUID()}`, verifyOwnedCleanup: () => (!ownership.approvalSent || ownership.rulesRemoved) && !ownership.idleSessionUnverified,
    observe: request => observe(request, ownership) };
  measurement.run = await runMember('member-a', { terminalMode: true, task });
  measurement.run.passed = preflightRunPassed(measurement.run);
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.run.passed && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/strict-ask-preflight-latest.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[strict-ask-preflight] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[strict-ask-preflight] lifecycle failure'); process.exitCode = 1; });
module.exports = { preflightRunPassed };

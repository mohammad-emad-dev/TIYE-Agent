'use strict';
const { ownedIdentities } = require('./persistent-cli');
const { approvalSnapshot } = require('./approval-evidence');
const { cancelledSnapshot } = require('./active-disconnect-evidence');

function commandIdentities({ markers, nonce, inventory, servicePID, forbiddenPIDs, submittedAt }) {
  const root = markers.root, child = markers.child;
  if (!root || !child || root.role !== 'root' || child.role !== 'child' || root.nonce !== nonce || child.nonce !== nonce
    || !Number.isInteger(root.pid) || !Number.isInteger(child.pid) || root.pid === child.pid || child.parentPID !== root.pid) return undefined;
  const descendants = ownedIdentities(inventory, servicePID);
  const identities = [root, child].map(marker => descendants.find(entry => entry.ProcessId === marker.pid && entry.ParentProcessId === marker.parentPID));
  if (identities.some(entry => !entry || !Number.isFinite(Date.parse(entry.Created)) || Date.parse(entry.Created) < submittedAt - 1000)) return undefined;
  if (Date.parse(identities[1].Created) < Date.parse(identities[0].Created)) return undefined;
  const captured = ownedIdentities(inventory, root.pid);
  if (captured.some(entry => entry.ProcessId === servicePID || forbiddenPIDs.includes(entry.ProcessId))) return undefined;
  return captured;
}

function sameCommandIdentities(captured, inventory) {
  return captured.length >= 2 && captured.every(identity => inventory.some(current => current.ProcessId === identity.ProcessId
    && current.Created === identity.Created && current.ParentProcessId === identity.ParentProcessId));
}

function commandProcessesGone(captured, inventory) {
  return captured.length >= 2 && captured.every(identity => !inventory.some(current => current.ProcessId === identity.ProcessId && current.Created === identity.Created));
}

function heartbeatGrowth(before, after) {
  return ['root', 'child'].every(role => Number.isInteger(before?.[role]) && before[role] > 0 && Number.isInteger(after?.[role]) && after[role] > before[role]);
}

function executingSnapshot({ messages, pending, sessionID, task, cwd, originalToolID, submittedAt }) {
  const snapshot = approvalSnapshot({ messages, requests: pending, sessionID, task, cwd });
  const call = snapshot.calls[0];
  const accepted = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt);
  snapshot.executing = Boolean(snapshot.evidence.promptAccepted && accepted[0]?.time?.created >= submittedAt
    && snapshot.evidence.noAssistantErrors && snapshot.evidence.exactShellCallsOnly && snapshot.calls.length === 1
    && call.tool.id === originalToolID && call.tool.state?.status === 'running' && !Number.isFinite(call.message.time?.completed) && pending.length === 0);
  return snapshot;
}

function commandCancelRunPassed(run) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && !cli?.commandCleanupError && cli?.commandCancelObserved && cli.pendingBeforeApprovalTwice
    && cli.replyAccepted && cli.approvalRepliesSent === 1 && cli.executingTwice && cli.commandIdentityVerified && cli.bothHeartbeatsGrew
    && cli.interruptAccepted && cli.secondInterruptInactive && cli.cancelledStableTwice && cli.cancelledToolType === 'aborted'
    && cli.commandProcessesGoneTwice && cli.heartbeatsStableTwice && cli.completionMarkersAbsent && !cli.fallbackTerminationUsed
    && cli.sessionIdentityPreserved && cli.serviceIdentityPreserved && cli.terminalInputMatched && cli.terminalOutputObserved
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.connected
    && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified) && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.commandProcessesGoneAfterCleanup && run.heartbeatsStableAfterCleanup && run.commandMarkersUnchanged && run.completionMarkersAbsentAfterCleanup && run.scriptUnchanged
    && run.onlyFixtureFilesPresent && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0
    && run.logHygiene && !run.serverLogTruncated && run.fixtureStopped && run.tempRemoved);
}

module.exports = { commandIdentities, sameCommandIdentities, commandProcessesGone, heartbeatGrowth, executingSnapshot, cancelledSnapshot, commandCancelRunPassed };

'use strict';
const { approvalSnapshot } = require('./approval-evidence');
const { quiescentMessages } = require('./service-quiescence');

function activePendingSnapshot(request) {
  const snapshot = approvalSnapshot(request);
  const assistant = snapshot.request && request.messages.find(message => message.id === snapshot.request.source.messageID && message.type === 'assistant');
  snapshot.activePending = Boolean(snapshot.evidence.promptAccepted && snapshot.evidence.noAssistantErrors && snapshot.evidence.exactShellCallsOnly
    && snapshot.evidence.shellCalls === 1 && snapshot.evidence.completedShellCalls === 0 && snapshot.evidence.failedShellCalls === 0
    && snapshot.request && assistant && !Number.isFinite(assistant.time?.completed));
  return snapshot;
}

function cancelledSnapshot({ snapshot, messages, pending, createdAt, originalToolID }) {
  const original = snapshot.calls.find(({ tool }) => tool.id === originalToolID)?.tool;
  return Boolean(snapshot.evidence.promptAccepted && snapshot.evidence.exactShellCallsOnly && snapshot.evidence.rejectionErrorsOnly
    && snapshot.evidence.shellCalls === 1 && snapshot.evidence.completedShellCalls === 0 && snapshot.evidence.failedShellCalls === 1
    && original?.state?.status === 'error' && original.state.error?.type === 'aborted'
    && quiescentMessages({ messages, pending, createdAt }));
}

function activeDisconnectRunPassed(run) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli?.activeDisconnectObserved
    && cli.terminalInputMatched && cli.terminalOutputObserved && cli.pendingBeforeCrashTwice && cli.pendingAfterCrashTwice
    && cli.originalOperationPreserved && cli.sessionIdentityPreserved && cli.servicePreservedAcrossCrash
    && cli.crashTargetOwned && cli.ptyExitObserved && Number.isFinite(cli.ptyExitCode) && cli.ptyExitCode !== 0
    && cli.firstClientCleanup?.verified && cli.firstClientCleanup.jobVerified
    && cli.interruptAccepted && cli.secondInterruptInactive && cli.cancelledStableTwice && cli.cancelledToolType === 'aborted'
    && cli.markerAbsentBeforeCrash && cli.markerAbsentAfterCrash && cli.markerAbsentAfterCancel && cli.approvalRepliesSent === 0
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.connected
    && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified) && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.onlyFixtureFilesPresent && run.commandMarkerAbsent && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0
    && run.logHygiene && !run.serverLogTruncated && run.fixtureStopped && run.tempRemoved);
}

module.exports = { activePendingSnapshot, cancelledSnapshot, activeDisconnectRunPassed };

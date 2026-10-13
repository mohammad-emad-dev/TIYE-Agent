'use strict';
const crypto = require('node:crypto');

function conversationFingerprint(messages) {
  const turns = messages.filter(message => ['user', 'assistant'].includes(message.type)).map(message => ({
    id: message.id, type: message.type, text: message.text, content: message.content, model: message.model,
    created: message.time?.created, completed: message.time?.completed, finish: message.finish, error: message.error, agent: message.agent,
  })).sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(turns)).digest('hex');
}

function ownedCrashTarget({ pid, captured, current, rootPID, servicePID }) {
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(rootPID) || !Number.isInteger(servicePID) || pid === rootPID || pid === servicePID) return undefined;
  const owned = captured.find(identity => identity.ProcessId === pid);
  return owned && typeof owned.Created === 'string' && Number.isFinite(Date.parse(owned.Created))
    && current.some(identity => identity.ProcessId === pid && identity.Created === owned.Created) ? owned : undefined;
}

function recoveryRunPassed(run) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli?.recoveryObserved
    && cli.terminalInputMatched && cli.terminalOutputObserved && cli.seedAccepted && cli.seedJsonMatched && cli.seedStableIdle
    && cli.crashTargetOwned && cli.ptyExitObserved && Number.isFinite(cli.ptyExitCode) && (cli.ptyExitCode !== 0 || (Number.isFinite(cli.ptyExitSignal) && cli.ptyExitSignal !== 0))
    && cli.firstClientCleanup?.verified && cli.firstClientCleanup.jobVerified
    && cli.historyPreserved && cli.sessionIdentityPreserved && cli.stoppedAfterClientCrash && cli.servicePreservedAcrossCrash
    && cli.resumeInputMatched && cli.resumeOutputObserved && cli.newClientVerified && cli.recallAccepted && cli.recallJsonMatched && cli.recallStableIdle && cli.noTools
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.connected
    && cli.sessionStopped && cli.idleVerified && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated && !cli.resumeOutputTruncated
    && run.onlyFixtureFilesPresent && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0
    && run.logHygiene && !run.serverLogTruncated && run.fixtureStopped && run.tempRemoved);
}

module.exports = { conversationFingerprint, ownedCrashTarget, recoveryRunPassed };

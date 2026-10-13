'use strict';
const path = require('node:path');
const samePath = (left, right) => typeof left === 'string' && path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();

function worktreeLocationMatches({ location, root, worktree }) {
  return Boolean(typeof location?.project?.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(location.project.id)
    && samePath(location.directory, worktree) && [root, worktree].some(directory => samePath(location.project.directory, directory)));
}

function worktreeApprovalRunPassed(run) {
  const cli = run.cli;
  const phases = cli?.worktreePhases;
  if (!Array.isArray(phases) || phases.length !== 5 || new Set(phases.map(phase => phase.name)).size !== 5) return false;
  const expected = { 'seed-always': 'completed', 'worktree-reuse': cli.sharedNativeProject ? 'completed' : 'pending', 'worktree-deny': 'denied', 'worktree-revoked': 'pending', 'root-revoked': 'pending' };
  const phasePassed = Object.entries(expected).every(([name, outcome]) => {
    const phase = phases.find(candidate => candidate.name === name);
    return phase?.passed && phase.phaseObserved && phase.stableTwice && phase.markerMatched && phase.freshPromptAndAssistants && phase.executedModelConfirmed
      && phase.exactShellCallsOnly && phase.noAssistantErrors && phase.shellCalls === 1 && phase.completedShellCalls === (outcome === 'completed' ? 1 : 0)
      && phase.failedShellCalls === (outcome === 'denied' ? 1 : 0) && phase.ownPendingRequests === (outcome === 'pending' ? 1 : 0)
      && JSON.stringify(phase.failedShellErrorTypes) === JSON.stringify(outcome === 'denied' ? ['permission.rejected'] : [])
      && (name !== 'worktree-reuse' || outcome !== 'completed' || !phase.pendingEverObserved)
      && (!phase.newSession || (phase.sessionSelectionConfirmed && phase.terminalInputMatched && !phase.outputTruncated && phase.sessionRemoved && phase.cleanup?.verified && phase.cleanup.jobVerified));
  });
  return Boolean(phasePassed && !run.error && !run.fixtureErrors && !cli.error && cli.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && typeof cli.sharedNativeProject === 'boolean' && cli.gitCommonDirectoryMatched && cli.gitHeadMatched && cli.worktreeLocationConfirmed && cli.savedBaselinesEmpty
    && cli.savedRuleOwned && cli.savedRulePresentBeforeDeny && cli.savedRuleRemoved && cli.uiAlwaysSelectedTwice && cli.uiAlwaysInputMatched
    && cli.navigationInput?.matched && cli.decisionInput?.matched && cli.parentPermissionReplies === 0
    && cli.worktreeProtectedUnchanged && cli.worktreeFileScopeMatched && cli.worktreeMarkerAfterCleanupMatched && cli.worktreeRemoved && cli.gitRegistryClean
    && cli.originalClientCleanup?.verified && cli.originalClientCleanup.jobVerified && cli.permissionsConfirmed && cli.agentConfirmed
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.connected && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified)
    && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerMatched && run.onlyFixtureFilesPresent && run.fixtureStopped && run.tempRemoved
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0 && run.logHygiene && !run.serverLogTruncated);
}

module.exports = { worktreeLocationMatches, worktreeApprovalRunPassed };

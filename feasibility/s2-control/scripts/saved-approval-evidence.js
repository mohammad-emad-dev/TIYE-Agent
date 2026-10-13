'use strict';
const { approvalSnapshot } = require('./approval-evidence');
const { quiescentMessages } = require('./service-quiescence');

const MODEL = { providerID: 'opencode', id: 'muse-spark-1.3-contributor-free', variant: 'xhigh' };
function savedAlwaysScreen({ screen, choices, proposed, palette }) {
  if (typeof screen !== 'string' || !Array.isArray(choices) || choices.length !== 3 || !Array.isArray(proposed) || !proposed.length) return false;
  const labels = ['Allow once', 'Always allow', 'Reject'];
  if (!labels.every(label => choices.filter(choice => choice.label === label).length === 1)) return false;
  const ordered = labels.map(label => choices.find(choice => choice.label === label));
  const lines = screen.split('\n');
  const heading = lines.findIndex(line => line.replace(/^[^\p{L}\p{N}]+/u, '').trim() === 'Permission required');
  const row = ordered[0].row;
  const styles = choice => JSON.stringify([choice.fg, choice.bg, choice.fgMode, choice.bgMode, choice.inverse]);
  const body = lines.slice(heading + 1, row).join('\n');
  return heading >= 0 && Number.isInteger(row) && row > heading && ordered.every(choice => choice.row === row && Number.isInteger(choice.column)
    && lines[row]?.slice(choice.column, choice.column + choice.label.length) === choice.label)
    && ordered[0].column < ordered[1].column && ordered[1].column < ordered[2].column
    && styles(ordered[1]) === palette.selected && [ordered[0], ordered[2]].every(choice => styles(choice) === palette.normal)
    && proposed.every(pattern => typeof pattern === 'string' && pattern.length > 0 && body.includes(pattern));
}
function shellPhaseSnapshot({ messages, requests, sessionID, task, cwd, submittedAt, outcome }) {
  const snapshot = approvalSnapshot({ messages, requests, sessionID, task, cwd });
  const users = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt);
  const assistants = messages.filter(message => message.type === 'assistant');
  const fresh = users.length === 1 && users[0].time?.created >= submittedAt && assistants.length > 0 && assistants.every(message => message.time?.created >= users[0].time.created);
  const executedModelConfirmed = assistants.length > 0 && assistants.every(message => Object.entries(MODEL).every(([key, expected]) => message.model?.[key] === expected));
  const common = fresh && executedModelConfirmed && snapshot.evidence.promptAccepted && snapshot.evidence.noAssistantErrors
    && snapshot.evidence.exactShellCallsOnly && snapshot.calls.length === 1;
  const tool = snapshot.calls[0]?.tool;
  const pending = snapshot.request && requests.length === 1 && snapshot.request.resources.length === 1 && snapshot.evidence.correlatedPending;
  const completed = requests.length === 0 && quiescentMessages({ messages, pending: requests, createdAt: submittedAt });
  const observed = common && (outcome === 'pending' ? pending && tool.state.status === 'running'
    : outcome === 'completed' ? completed && tool.state.status === 'completed'
    : outcome === 'denied' && completed && tool.state.status === 'error' && tool.state.error?.type === 'permission.rejected');
  return { ...snapshot, evidence: { ...snapshot.evidence, freshPromptAndAssistants: fresh, executedModelConfirmed, phaseObserved: Boolean(observed) } };
}

function ownedSavedRules({ rows, projectID, proposed, submittedAt }) {
  if (!Array.isArray(rows) || !Array.isArray(proposed) || proposed.length === 0 || new Set(proposed).size !== proposed.length
    || rows.length !== proposed.length || new Set(rows.map(row => row.id)).size !== rows.length) return false;
  return rows.every(row => typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(row.id) && row.projectID === projectID
    && row.action === 'shell' && proposed.includes(row.resource) && Number.isFinite(row.time?.created) && row.time.created >= submittedAt)
    && proposed.every(pattern => rows.filter(row => row.resource === pattern).length === 1);
}

function savedApprovalRunPassed(run) {
  const cli = run.cli;
  const phases = cli?.savedPhases;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.locationConfirmed && cli.connected
    && cli.projectBaselinesEmpty && cli.projectIdentitiesDistinct && cli.savedRuleOwned && cli.savedRulePersistedAcrossSessions
    && cli.savedRuleRemoved && cli.uiAlwaysInputMatched && cli.uiAlwaysSelectedTwice && cli.parentPermissionReplies === 0
    && Array.isArray(phases) && phases.length === 5 && new Set(phases.map(phase => phase.name)).size === 5
    && ['seed-always', 'same-project', 'other-project', 'deny-precedence', 'revoked-ask'].every(name => phases.some(phase => phase.name === name && phase.passed))
    && phases.every(phase => phase.phaseObserved && phase.stableTwice && phase.markerMatched && phase.freshPromptAndAssistants && phase.executedModelConfirmed
      && (!phase.newSession || (phase.sessionSelectionConfirmed && phase.cleanup?.verified && phase.cleanup.jobVerified && phase.sessionRemoved)))
    && cli.otherProjectCleaned && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified) && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerMatched && run.onlyFixtureFilesPresent && run.fixtureStopped && run.tempRemoved
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0 && run.logHygiene && !run.serverLogTruncated);
}

module.exports = { MODEL, savedAlwaysScreen, shellPhaseSnapshot, ownedSavedRules, savedApprovalRunPassed };

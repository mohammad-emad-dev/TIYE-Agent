'use strict';
const path = require('node:path');
const { quiescentMessages } = require('./service-quiescence');

function expectedInput(tool, task, cwd) {
  const input = tool.state?.input;
  if (tool.name !== task.expectedAction || !input || typeof input !== 'object') return false;
  const local = value => typeof value === 'string' && path.resolve(cwd, value).toLowerCase() === path.resolve(cwd).toLowerCase();
  if (task.expectedAction === 'shell') return input.command === task.command && Object.keys(input).every(key => ['command', 'description', 'timeout', 'workdir', 'cwd'].includes(key))
    && ['workdir', 'cwd'].every(key => input[key] === undefined || local(input[key]));
  if (task.expectedAction === 'read') return typeof input.path === 'string' && path.resolve(cwd, input.path).toLowerCase() === path.resolve(cwd, 'protected.txt').toLowerCase()
    && Object.keys(input).every(key => ['path', 'offset', 'limit'].includes(key));
  const keys = task.expectedAction === 'glob' ? ['pattern', 'path', 'hidden', 'limit'] : ['pattern', 'path', 'include', 'literal', 'caseSensitive', 'limit'];
  return input.pattern === task.pattern && (input.path === undefined || local(input.path))
    && (input.include === undefined || input.include === 'protected.txt') && Object.keys(input).every(key => keys.includes(key));
}

function deniedProfileSnapshot({ messages, pending, task, cwd, submittedAt, createdAt }) {
  const users = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt);
  const assistants = messages.filter(message => message.type === 'assistant');
  const calls = assistants.flatMap(message => (message.content || []).filter(part => part.type === 'tool').map(tool => ({ message, tool })));
  const errors = assistants.filter(message => message.error).map(message => message.error);
  const promptAccepted = users.length === 1 && users[0].time?.created >= submittedAt;
  const freshAssistants = promptAccepted && assistants.length > 0 && assistants.every(message => message.time?.created >= users[0].time.created);
  const original = calls.length === 1 && calls[0];
  const expectedCall = Boolean(original && expectedInput(original.tool, task, cwd));
  const nativeDenied = promptAccepted && freshAssistants && errors.length === 0 && expectedCall && original.tool.state?.status === 'error'
    && original.tool.state.error?.type === 'permission.rejected' && pending.length === 0;
  const providerBlocked = promptAccepted && freshAssistants && calls.length === 0 && errors.length === 1 && errors[0].type === 'provider.auth' && errors[0].status === 403 && pending.length === 0;
  const noAttempt = promptAccepted && freshAssistants && calls.length === 0 && errors.length === 0 && pending.length === 0;
  const outcome = nativeDenied ? 'native-denial' : providerBlocked ? 'provider-blocked' : noAttempt ? 'no-attempt' : 'unqualified';
  return { outcome, promptAccepted, freshAssistants, toolCalls: calls.length, expectedToolInputMatched: expectedCall,
    nativeDenialObserved: Boolean(nativeDenied), providerBlockedObserved: Boolean(providerBlocked),
    failure: providerBlocked ? { category: 'provider.auth', httpStatus: 403 } : errors.length ? { category: 'other' } : null,
    noCanaryLeak: !JSON.stringify(messages).includes(task.canary),
    completedQuiescent: quiescentMessages({ messages, pending, createdAt }) };
}

function deniedProfileMeasurementPassed(run) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli?.stableOutcomeTwice && cli.promptAccepted && cli.freshAssistants
    && ['native-denial', 'provider-blocked', 'no-attempt'].includes(cli.outcome) && !cli.observationTimedOut && cli.noCanaryLeak
    && cli.approvalRepliesSent === 0 && cli.terminalInputMatched && cli.terminalOutputObserved
    && cli.version === '2.0.28' && cli.serviceVersionAfterCleanup === '2.0.28'
    && cli.permissionsConfirmed && cli.agentConfirmed && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.connected
    && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified) && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerAbsent && run.onlyFixtureFilesPresent && run.fixtureStopped && run.tempRemoved
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0 && run.logHygiene && !run.serverLogTruncated);
}

module.exports = { deniedProfileSnapshot, deniedProfileMeasurementPassed };

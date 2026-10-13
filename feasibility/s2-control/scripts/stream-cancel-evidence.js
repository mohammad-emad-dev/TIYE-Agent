'use strict';
const { quiescentMessages } = require('./service-quiescence');

function streamSample({ messages, prompt, submittedAt }) {
  const users = messages.filter(message => message.type === 'user' && message.text?.trim() === prompt);
  const assistants = users.length === 1 ? messages.filter(message => message.type === 'assistant' && message.time?.created >= users[0].time.created) : [];
  const assistant = assistants.length === 1 ? assistants[0] : undefined;
  const noTools = messages.filter(message => message.type === 'assistant').every(message => Array.isArray(message.content) && message.content.every(part => part.type !== 'tool'));
  const noErrors = messages.filter(message => message.type === 'assistant').every(message => !message.error);
  const text = assistant?.content?.filter(part => part.type === 'text').map(part => part.text).join('') || '';
  return { assistantID: assistant?.id, text, promptAccepted: users.length === 1 && users[0].time.created >= submittedAt,
    noTools, noErrors, unfinished: Boolean(assistant && !Number.isFinite(assistant.time?.completed) && !['stop', 'error'].includes(assistant.finish)) };
}

function streamGrowth(before, after) {
  return Boolean(before?.assistantID && before.assistantID === after.assistantID && before.promptAccepted && after.promptAccepted
    && before.noTools && after.noTools && before.noErrors && after.noErrors && before.unfinished && after.unfinished
    && before.text.length > 0 && after.text.length > before.text.length && after.text.startsWith(before.text));
}

function cancelledText({ messages, pending, assistantID, createdAt }) {
  const assistant = messages.find(message => message.type === 'assistant' && message.id === assistantID);
  return Boolean(assistant?.finish === 'error' && assistant.error?.type === 'aborted'
    && messages.filter(message => message.type === 'assistant').every(message => Array.isArray(message.content) && message.content.every(part => part.type !== 'tool'))
    && quiescentMessages({ messages, pending, createdAt }));
}

function streamCancelRunPassed(run) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli?.streamCancelObserved
    && cli.terminalInputMatched && cli.terminalOutputObserved && cli.promptAccepted && cli.sameAssistantTextGrew && cli.unfinishedAtBothSamples
    && cli.secondTextCodeUnits > cli.firstTextCodeUnits && cli.firstTextCodeUnits > 0 && cli.noTools
    && cli.interruptAccepted && cli.secondInterruptInactive && cli.cancelledAssistantType === 'aborted' && cli.cancelledStableTwice
    && cli.sessionIdentityPreserved && cli.serviceIdentityPreserved
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.permissionsConfirmed && cli.agentConfirmed && cli.connected
    && cli.sessionStopped && (cli.idleVerified || cli.quiescentVerified) && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.onlyFixtureFilesPresent && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0
    && run.logHygiene && !run.serverLogTruncated && run.fixtureStopped && run.tempRemoved);
}

module.exports = { streamSample, streamGrowth, cancelledText, streamCancelRunPassed };

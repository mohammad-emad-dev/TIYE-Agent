'use strict';
const path = require('node:path');

function approvalSnapshot({ messages, requests, sessionID, task, cwd }) {
  const assistants = messages.filter(message => message.type === 'assistant');
  const calls = assistants.flatMap(message => (message.content || []).filter(tool => tool.type === 'tool').map(tool => ({ message, tool })));
  const exactShell = ({ tool }) => tool.name === 'shell' && tool.state?.input?.command === task.command
    && Object.keys(tool.state.input).every(key => ['command', 'description', 'timeout', 'workdir', 'cwd'].includes(key))
    && ['workdir', 'cwd'].every(key => tool.state.input[key] === undefined || path.resolve(cwd, tool.state.input[key]).toLowerCase() === path.resolve(cwd).toLowerCase());
  const own = requests.filter(request => request.sessionID === sessionID);
  const request = own.length === 1 ? own[0] : undefined;
  const pending = request && calls.find(({ message, tool }) => exactShell({ tool }) && tool.state.status === 'running'
    && request.action === 'shell' && request.resources?.includes(task.command) && request.source?.type === 'tool'
    && request.source.messageID === message.id && request.source.id === tool.id);
  const evidence = {
    promptAccepted: messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt).length === 1,
    noAssistantErrors: assistants.every(message => !message.error),
    rejectionErrorsOnly: assistants.every(message => !message.error || message.error.type === 'aborted'),
    exactShellCallsOnly: calls.length > 0 && calls.every(exactShell),
    shellCalls: calls.length,
    completedShellCalls: calls.filter(({ tool }) => tool.state?.status === 'completed').length,
    failedShellCalls: calls.filter(({ tool }) => tool.state?.status === 'error').length,
    failedShellErrorTypes: [...new Set(calls.filter(({ tool }) => tool.state?.status === 'error').map(({ tool }) => tool.state.error?.type).filter(type => typeof type === 'string' && /^[A-Za-z.]{1,80}$/.test(type)))],
    ownPendingRequests: own.length,
    correlatedPending: Boolean(pending),
  };
  return { evidence, request: pending ? request : undefined, calls };
}

function approvalOutcome({ snapshot, decision, originalToolID, originalRequestID, replyAccepted, pendingObservedTwice, stableTerminal }) {
  const { evidence, request, calls } = snapshot;
  const original = calls.find(({ tool }) => tool.id === originalToolID)?.tool;
  const common = replyAccepted && evidence.promptAccepted && evidence.exactShellCallsOnly;
  return Boolean(common && (decision === 'reject'
    ? stableTerminal && evidence.rejectionErrorsOnly && evidence.shellCalls === 1 && evidence.failedShellCalls === 1 && evidence.completedShellCalls === 0
      && evidence.ownPendingRequests === 0 && original?.state?.status === 'error' && ['aborted', 'permission.rejected'].includes(original.state.error?.type)
    : decision === 'once' && evidence.noAssistantErrors && pendingObservedTwice && evidence.shellCalls === 2 && evidence.completedShellCalls === 1
      && evidence.failedShellCalls === 0 && original?.state?.status === 'completed' && evidence.correlatedPending
      && request.id !== originalRequestID && request.source.id !== originalToolID));
}

module.exports = { approvalSnapshot, approvalOutcome };

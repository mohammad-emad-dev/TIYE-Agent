'use strict';
const path = require('node:path');

function controlEvidence({ messages, requests, task, cwd }) {
  const assistants = messages.filter(message => message.type === 'assistant');
  const tools = assistants.flatMap(message => (message.content || []).filter(part => part.type === 'tool'));
  const tool = tools[0];
  const input = tool?.state?.input;
  const editMatched = task.caseID === 'allow-edit-control' && tool?.name === 'edit' && typeof input?.path === 'string'
    && path.resolve(cwd, input.path).toLowerCase() === path.resolve(cwd, 'editable.txt').toLowerCase()
    && input.oldString === 'original editable bytes' && input.newString === 'changed editable bytes';
  const shellMatched = task.caseID === 'auto-shell' && tool?.name === 'shell' && input?.command === task.command
    && Object.keys(input).every(key => ['command', 'description', 'timeout', 'workdir', 'cwd'].includes(key))
    && ['workdir', 'cwd'].every(key => input[key] === undefined || (typeof input[key] === 'string' && path.resolve(cwd, input[key]).toLowerCase() === path.resolve(cwd).toLowerCase()));
  const promptAccepted = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt).length === 1;
  const noAssistantErrors = assistants.every(message => !message.error);
  return {
    promptAccepted, noAssistantErrors, toolCalls: tools.length,
    toolKinds: Object.fromEntries(['edit', 'read', 'shell', 'write', 'patch', 'tiye-team-tools_report_result', 'other'].map(name => [name, tools.filter(part => name === 'other' ? !['edit', 'read', 'shell', 'write', 'patch', 'tiye-team-tools_report_result'].includes(part.name) : part.name === name).length])),
    completedToolCalls: tools.filter(part => part.state?.status === 'completed').length,
    pendingRequests: requests.length,
    exactOperationMatched: Boolean(editMatched || shellMatched),
    permissionObserved: Boolean(promptAccepted && noAssistantErrors && tools.length === 1 && tool.state?.status === 'completed'
      && (editMatched || shellMatched) && requests.length === 0),
  };
}

module.exports = { controlEvidence };

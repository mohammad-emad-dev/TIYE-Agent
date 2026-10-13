'use strict';

function permissionEvidence({ messages, requests, sessionID, task }) {
  const assistants = messages.filter(message => message.type === 'assistant');
  const tools = assistants.flatMap(message => (message.content || []).filter(part => part.type === 'tool').map(tool => ({ message, tool })));
  const shells = tools.filter(({ tool }) => tool.name === 'shell');
  const edits = tools.filter(({ tool }) => ['edit', 'write', 'patch'].includes(tool.name));
  const ownRequests = requests.filter(request => request.sessionID === sessionID);
  const accepted = messages.filter(message => message.type === 'user' && message.text?.trim() === task.prompt).length === 1;
  const correlated = ownRequests.filter(request => request.action === 'shell' && request.source?.type === 'tool'
    && Array.isArray(request.resources) && request.resources.includes(task.command)
    && shells.some(({ message, tool }) => request.source.messageID === message.id && request.source.id === tool.id
      && tool.state?.status === 'running' && tool.state.input?.command === task.command));
  // V2 Core's typed configured-denial error; provider HTTP errors do not count.
  const denied = edits.filter(({ tool }) => tool.state?.status === 'error' && tool.state.error?.type === 'Permission.BlockedError'
    && tool.state.input?.filePath?.replace(/\\/g, '/').split('/').at(-1) === 'protected.txt');
  const unexpectedTools = tools.filter(({ tool }) => !['edit', 'write', 'patch', 'shell'].includes(tool.name));
  return {
    promptAccepted: accepted,
    toolCalls: tools.length,
    editCalls: edits.length,
    shellCalls: shells.length,
    completedShellCalls: shells.filter(({ tool }) => tool.state?.status === 'completed').length,
    deniedEditCalls: denied.length,
    // Fixed error-type identifiers only; never save error text or tool inputs.
    toolErrorTypes: [...new Set(tools.filter(({ tool }) => tool.state?.status === 'error').map(({ tool }) => tool.state.error?.type).filter(type => typeof type === 'string' && /^[A-Za-z.]{1,80}$/.test(type)))],
    ownPendingRequests: ownRequests.length,
    correlatedShellApprovals: correlated.length,
    noAssistantErrors: assistants.every(message => !message.error),
    permissionObserved: accepted && assistants.every(message => !message.error) && unexpectedTools.length === 0
      && (task.caseID === 'deny-edit' ? edits.length === 1 && denied.length === 1 && shells.length === 0 && ownRequests.length === 0
        : task.caseID === 'ask-shell' && edits.length === 0 && shells.length === 1 && correlated.length === 1 && ownRequests.length === 1),
  };
}

function permissionRunPassed({ run, caseID }) {
  const cli = run.cli;
  return Boolean(!run.error && !run.fixtureErrors && !cli?.error && cli?.permissionObserved === true
    && !cli.observationTimedOut && (caseID === 'ask-shell' ? cli.pendingObservedTwice === true : cli.stableIdle === true)
    && cli.terminalInputMatched && cli.terminalOutputObserved && cli.promptAccepted && cli.permissionsConfirmed && cli.agentConfirmed
    && cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.connected
    && cli.sessionStopped && cli.idleVerified && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged
    && cli.cleanup?.verified && cli.cleanup.jobVerified && !cli.cliSpawnError && !cli.outputTruncated
    && run.protectedFileUnchanged && run.commandMarkerAbsent && run.onlyFixtureFilesPresent
    && run.serverReportCalls === 0 && run.serverQuestionCalls === 0 && run.otherServerCalls === 0
    && run.logHygiene && !run.serverLogTruncated && run.fixtureStopped && run.tempRemoved);
}

module.exports = { permissionEvidence, permissionRunPassed };

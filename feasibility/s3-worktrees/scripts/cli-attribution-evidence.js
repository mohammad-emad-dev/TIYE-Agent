'use strict';
const {commitMatches}=require('./attribution-git');
function exactCliTool(events, command, observation, sessionId) {
  const tools=events.filter(event=>event.type==='tool_use'&&event.part?.type==='tool').map(event=>event.part);
  return typeof sessionId==='string' && sessionId.startsWith('ses_') && tools.length===1 && tools[0].sessionID===sessionId
    && tools[0].tool==='shell' && tools[0].state?.status==='completed'
    && tools[0].state.input?.command===command && typeof tools[0].state.output==='string'
    && Object.keys(tools[0].state.input).length===1 && tools[0].state.output.trim()===JSON.stringify(observation)
    && tools[0].state.metadata?.metadata?.exit===0 && tools[0].state.metadata.metadata.truncated===false;
}
function cliAttributionPassed(record) {
  return Boolean(!record.error && record.cliCompleted && record.cliVersion==='opencode v2.0.28'
    && record.launchMode==='standalone private server' && record.exactToolMatched && record.observationMatched
    && record.observation?.authorMatched===true && record.observation.committerMatched===true && record.observation.directoryMatched===true
    && record.observation.workerSha256===record.sourceHashes?.['../fixtures/attribution-task.cjs']
    && Array.isArray(record.nativeTool) && exactCliTool(record.nativeTool.map(part=>({type:'tool_use',part})),
      'rtk proxy node attribution-task.cjs',record.observation,record.cliSessionId)
    && record.workerUnchanged && record.taskUnchanged && record.onlyExpectedFilesChanged && record.cliDidNotCommit
    && record.fallbackCommitMatched && record.identity && commitMatches(record.fallbackCommit,record.identity)
    && record.worktreesCreated===1 && record.worktreesRemoved===1 && record.originalRootUnchanged
    && record.registryRootOnly && record.baseTempRemoved && record.rootTempRemoved);
}
module.exports={exactCliTool,cliAttributionPassed};

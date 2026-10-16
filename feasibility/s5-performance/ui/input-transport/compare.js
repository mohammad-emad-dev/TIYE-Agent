'use strict';
const assert=require('node:assert/strict'),{analyze}=require('./analyze'),{distribution}=require('../flood/metrics');
function compare(pipe,ipc){
  assert.equal(pipe.profile.probeTransport,'pipe');assert.equal(ipc.profile.probeTransport,'ipc');
  function waveform(profile){const {name,probeTransport,...settings}=profile;return settings;}
  assert.deepEqual(waveform(pipe.profile),waveform(ipc.profile));assert.deepEqual(pipe.sourceHashes,ipc.sourceHashes);assert.deepEqual(pipe.buildHashes,ipc.buildHashes);
  const analyses=[analyze(pipe),analyze(ipc)];for(const analysis of analyses){assert.equal(analysis.rows.length,35);assert.equal(analysis.completed,35);assert.equal(analysis.skipped,0);assert.equal(analysis.singleOutstandingVerified,true);}
  const perOrdinal=analyses[0].rows.map((left,index)=>{
    const right=analyses[1].rows[index];assert.equal(left.ordinal,right.ordinal);assert.equal(left.dueMs,right.dueMs);assert.equal(left.transport,'pipe');assert.equal(right.transport,'ipc');assert.equal(left.workerTransport,'pipe');assert.equal(right.workerTransport,'ipc');
    return {ordinal:left.ordinal,dueMs:left.dueMs,pipeView:left.view,ipcView:right.view,viewMatches:left.view===right.view,pipeTotalMs:left.totalMs,ipcTotalMs:right.totalMs,pipeInputNoticeToAckMs:left.mainStages.inputNoticeToAckIngressMs,ipcInputNoticeToAckMs:right.mainStages.inputNoticeToAckIngressMs};
  });
  return {schema:'tiye-s5-probe-transport-comparison-v1',diagnosticOnly:true,runOrder:['pipe','ipc'],freshRuns:2,repeatsPerProfile:1,randomized:false,causalEffectEstablished:false,historicalSpikeFixed:false,identicalExecutedSourceAndBuildHashes:true,sameWaveformSettings:true,ordinalDeadlinesMatched:35,
    ordinalViewMismatches:perOrdinal.filter(row=>!row.viewMatches).map(row=>row.ordinal),
    runs:analyses.map((analysis,index)=>({transport:index===0?'pipe':'ipc',completed:analysis.completed,over100:analysis.over100,applicationDispatchToRenderNotice:distribution(analysis.rows.map(row=>row.totalMs)),inputNoticeToAckIngress:distribution(analysis.rows.map(row=>row.mainStages.inputNoticeToAckIngressMs)),
      apiCallback:{api:index===0?'stdin.write':'child.send',notWorkerReceipt:true,duration:distribution(analysis.rows.map(row=>row.parentControl.sendStartToCallbackMs))},byView:{grid:(index===0?pipe:ipc).metrics.grid.input,focus:(index===0?pipe:ipc).metrics.focus.input}})),perOrdinal,
    scope:'One fixed-order observation per transport; API callback semantics differ; same application endpoints. No causal reduction, root cause, general reliability, memory/hour or production qualification.'};
}
module.exports={compare};

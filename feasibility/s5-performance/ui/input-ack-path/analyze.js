'use strict';
const {inspectAckPath}=require('./check-ack-path');
const assert=require('node:assert/strict'),{classifyOverlap}=require('./overlap'),{distribution}=require('../flood/metrics');
function analyze(evidence){
  const trace=evidence.trace;assert.equal(trace.clock,'main-monotonic');
  const rows=trace.probes.map(probe=>{
    const mainFields=['dispatchMs','inputReceivedMs','ackIngressMs','renderedReceivedMs'];
    const complete=mainFields.every(field=>Number.isFinite(probe[field]));
    const chronology=complete&&mainFields.every((field,index)=>index===0||probe[field]>=probe[mainFields[index-1]]);
    const interval={startMs:probe.dispatchMs,endMs:probe.renderedReceivedMs??null,clock:trace.clock};
    const mainStages=chronology?{dispatchToInputNoticeMs:probe.inputReceivedMs-probe.dispatchMs,inputNoticeToAckIngressMs:probe.ackIngressMs-probe.inputReceivedMs,ackIngressToRenderNoticeMs:probe.renderedReceivedMs-probe.ackIngressMs}:null;
    const renderer=probe.renderer;
    const rendererStages=renderer?.chunkStages.map(stage=>({chunkOrdinal:stage.chunkOrdinal,queueWaitMs:stage.queueStartMs-stage.receivedMs,hashMs:stage.hashEndMs-stage.queueStartMs,writeCallbackMs:stage.writeEndMs-stage.hashEndMs,callbackToRenderMs:renderer.renderMs-stage.writeEndMs}))??[];
    const overlaps=trace.operations.map((span,index)=>({index,kind:span.kind,status:span.status,relation:classifyOverlap(interval,{...span,clock:trace.clock})})).filter(row=>!['before','after'].includes(row.relation));
    const dueInterval={startMs:probe.dueMs,endMs:probe.dispatchMs,clock:trace.clock};
    const preDispatch=trace.operations.map((span,index)=>({index,kind:span.kind,status:span.status,relation:classifyOverlap(dueInterval,{...span,clock:trace.clock})})).filter(row=>!['before','after'].includes(row.relation));
    const gaps=trace.loopGaps.map((gap,index)=>({index,relation:classifyOverlap(interval,gap)})).filter(row=>!['before','after'].includes(row.relation));
    const totalMs=Number.isFinite(probe.renderedReceivedMs)?probe.renderedReceivedMs-probe.dispatchMs:null;
    return {ordinal:probe.ordinal,transport:probe.transport,workerTransport:probe.workerTransport,view:probe.view,dueMs:probe.dueMs,dispatchMs:probe.dispatchMs,schedulingLatenessMs:probe.dispatchMs-probe.dueMs,schedule:probe.schedule??null,rendererInputView:probe.rendererInputView??null,viewMatches:probe.rendererInputView===probe.view,totalMs,over100Ms:totalMs===null?null:totalMs>100,
      mainStagesComplete:complete,mainChronologyValid:chronology,mainStages,rendererLocalMs:renderer?renderer.renderMs-renderer.inputMs:null,rendererStages,
      parentControl:probe.controlSendCallbackMs===undefined?null:{inputNoticeToSendStartMs:probe.controlSendStartMs-probe.inputReceivedMs,sendStartToCallbackMs:probe.controlSendCallbackMs-probe.controlSendStartMs,sendStartToAckIngressMs:probe.ackIngressMs-probe.controlSendStartMs,callbackBeforeAckIngress:probe.controlSendCallbackMs<=probe.ackIngressMs},
      workerLocal:probe.worker?{clock:probe.worker.clock,commandToWriteStartMs:probe.worker.writeStartMs-probe.worker.commandReadMs,writeCallMs:probe.worker.writeEndMs-probe.worker.writeStartMs,writeEndToAckMs:probe.worker.ackMs-probe.worker.writeEndMs,commandToAckMs:probe.worker.ackMs-probe.worker.commandReadMs}:null,
      workerNoticeMs:probe.workerNoticeMs??null,workerNoticeBeforeAckIngress:probe.workerNoticeMs===undefined?null:probe.workerNoticeMs<=probe.ackIngressMs,
      longTaskSupported:renderer?.longTaskSupported??null,longTasks:renderer?.longTasks??null,preDispatchCooccurrences:preDispatch,operationCooccurrences:overlaps,mainTimerCooccurrences:gaps};
  });
  assert.equal(rows.length,evidence.injected);
  const singleOutstandingVerified=trace.probes.every((probe,index)=>index===0||Number.isFinite(trace.probes[index-1].renderedReceivedMs)&&trace.probes[index-1].renderedReceivedMs<=probe.dispatchMs);
  for(const view of ['grid','focus']){
    const probes=rows.filter(row=>row.view===view),latencies=evidence.input[view].latencies;assert.equal(probes.length,latencies.length);
    probes.forEach((probe,index)=>assert(Math.abs(probe.totalMs-latencies[index])<0.000001));
  }
  return {ackPath:inspectAckPath(evidence),schema:'tiye-s5-input-ack-path-stage-analysis-v1',diagnosticOnly:true,historicalSpikeFixed:false,singleOutstandingVerified,thresholdMs:100,planned:evidence.input.grid.planned+evidence.input.focus.planned,completed:rows.filter(row=>row.totalMs!==null).length,
    schedulingLateness:distribution(rows.map(row=>row.schedulingLatenessMs)),schedulingChecks:evidence.scheduler.checks.length,viewMismatches:rows.filter(row=>!row.viewMatches).map(row=>row.ordinal),
    skipped:trace.skipped.length,completeMainStages:rows.filter(row=>row.mainStagesComplete&&row.mainChronologyValid).length,rendererChunkStages:rows.filter(row=>row.rendererStages.length>0).length,
    over100:rows.filter(row=>row.over100Ms).map(row=>row.ordinal),rows};
}
module.exports={analyze};

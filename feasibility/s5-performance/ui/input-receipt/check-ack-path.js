'use strict';
const assert=require('node:assert/strict'),{classifyOverlap}=require('./overlap'),{distribution}=require('../flood/metrics');
function checkLoop(loop,domain,mixedMs){
  assert.equal(loop.domain,domain);assert.equal(loop.status,'stopped');assert.equal(loop.periodMs,20);assert.equal(loop.thresholdMs,20);
  for(const field of ['startMs','lastTickMs','stoppedMs'])assert(Number.isFinite(loop[field])&&loop[field]>=0);
  assert(loop.startMs<=loop.lastTickMs&&loop.lastTickMs<=loop.stoppedMs&&loop.stoppedMs-loop.startMs>=mixedMs);assert(Number.isInteger(loop.ticks)&&loop.ticks>0);assert.equal(loop.terminalUnobservedMs,loop.stoppedMs-loop.lastTickMs);assert(loop.gaps.length<=1000);
  let previous=loop.startMs;for(const gap of loop.gaps){assert(Number.isFinite(gap.startMs)&&Number.isFinite(gap.endMs)&&gap.startMs>=previous&&gap.endMs<=loop.stoppedMs);assert.equal(gap.latenessMs,gap.endMs-gap.startMs);assert(gap.latenessMs>=20);previous=gap.endMs;}
}
function inspectAckPath(evidence){
  const {producer,worker}=evidence.diagnostics;assert.equal(producer.schema,'tiye-s5-producer-ack-v1');assert.equal(worker.schema,'tiye-s5-worker-loop-v1');assert.equal(producer.member,0);assert.equal(worker.member,0);assert.equal(producer.ack.clock,'producer-monotonic');
  checkLoop(producer.loop,'producer-monotonic',evidence.profile.mixedMs);checkLoop(worker.loop,'worker-monotonic',evidence.profile.mixedMs);assert.equal(producer.ack.rows.length,35);assert.equal(evidence.trace.probes.length,35);
  const rows=producer.ack.rows.map((ack,index)=>{
    const probe=evidence.trace.probes[index];assert.equal(ack.ordinal,index+1);assert.equal(probe.ordinal,ack.ordinal);assert.equal(probe.worker.clock,'worker-monotonic');let previous=producer.loop.startMs;
    for(const field of ['inputReceivedMs','writeStartMs','writeReturnMs','writeCallbackMs']){assert(Number.isFinite(ack[field])&&ack[field]>=previous);previous=ack[field];}assert(ack.writeCallbackMs<=producer.loop.stoppedMs);assert.equal(typeof ack.writeAccepted,'boolean');
    let workerPrevious=worker.loop.startMs;for(const field of ['commandReadMs','writeStartMs','writeEndMs','ackMs']){assert(Number.isFinite(probe.worker[field])&&probe.worker[field]>=workerPrevious);workerPrevious=probe.worker[field];}assert(probe.worker.ackMs<=worker.loop.stoppedMs);
    const producerInterval={clock:producer.ack.clock,startMs:ack.inputReceivedMs,endMs:ack.writeCallbackMs},workerInterval={clock:probe.worker.clock,startMs:probe.worker.commandReadMs,endMs:probe.worker.ackMs};
    function cooccurrences(interval,loop){return loop.gaps.map((gap,index)=>({index,relation:classifyOverlap(interval,{...gap,clock:loop.domain})})).filter(row=>!['before','after'].includes(row.relation));}
    return {ordinal:ack.ordinal,producerLocal:{clock:producer.ack.clock,inputToWriteStartMs:ack.writeStartMs-ack.inputReceivedMs,writeCallMs:ack.writeReturnMs-ack.writeStartMs,returnToCallbackMs:ack.writeCallbackMs-ack.writeReturnMs,inputToCallbackMs:ack.writeCallbackMs-ack.inputReceivedMs,writeAccepted:ack.writeAccepted,loopCooccurrences:cooccurrences(producerInterval,producer.loop)},workerLocal:{clock:probe.worker.clock,commandToAckMs:probe.worker.ackMs-probe.worker.commandReadMs,loopCooccurrences:cooccurrences(workerInterval,worker.loop)}};
  });
  return {sameClockArithmeticOnly:true,producerRows:35,workerRows:35,producerLoopTicks:producer.loop.ticks,workerLoopTicks:worker.loop.ticks,producerLoopGaps:producer.loop.gaps.length,workerLoopGaps:worker.loop.gaps.length,producerInputToCallback:distribution(rows.map(row=>row.producerLocal.inputToCallbackMs)),falseWriteReturns:rows.filter(row=>!row.producerLocal.writeAccepted).length,rows};
}
module.exports={inspectAckPath};

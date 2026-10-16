'use strict';
const assert=require('node:assert/strict');
const stamp=number=>assert(Number.isFinite(number)&&number>=0);
function createTrace(){
  const probes=new Map(),skipped=[],operations=[],loopGaps=[];let tail='';
  function probe(ordinal){assert(Number.isInteger(ordinal)&&probes.has(ordinal));return probes.get(ordinal);}
  function append(list,row,limit){assert(list.length<limit,'trace-limit');list.push(row);}
  return {
    dispatched(ordinal,view,dueMs,dispatchMs){assert.equal(ordinal,probes.size+1);assert(probes.size<50);stamp(dueMs);stamp(dispatchMs);assert(['grid','focus'].includes(view));probes.set(ordinal,{ordinal,view,dueMs,dispatchMs});},
    schedule(ordinal,packet){const row=probe(ordinal);assert.equal(row.schedule,undefined);assert(Number.isInteger(packet.slot)&&packet.slot>0);stamp(packet.checkedMs);assert.equal(typeof packet.viewTransitioning,'boolean');row.schedule=packet;},
    skipped(view,dueMs,checkedMs){stamp(dueMs);stamp(checkedMs);append(skipped,{view,dueMs,checkedMs,reason:'window-not-focused'},50);},
    input(packet,now){stamp(now);stamp(packet.rendererInputMs);assert(Number.isInteger(packet.queueDepth)&&packet.queueDepth>=0);const row=probe(packet.ordinal);assert.equal(row.inputReceivedMs,undefined);assert(['grid','focus'].includes(packet.inputView));row.rendererInputView=packet.inputView;row.inputReceivedMs=now;row.rendererInputMs=packet.rendererInputMs;row.rendererQueueDepth=packet.queueDepth;},
    controlStarted(ordinal,now){stamp(now);const row=probe(ordinal);assert.equal(row.controlWriteStartMs,undefined);assert(now>=row.inputReceivedMs);row.controlWriteStartMs=now;},
    controlFlushed(ordinal,now){stamp(now);const row=probe(ordinal);assert.equal(row.controlWriteCallbackMs,undefined);assert(now>=row.controlWriteStartMs);row.controlWriteCallbackMs=now;},
    notice(packet,now){
      stamp(now);assert.equal(packet.clock,'worker-monotonic');const row=probe(packet.ordinal);assert.equal(row.workerNoticeMs,undefined);
      let previous=-1;for(const field of ['commandReadMs','writeStartMs','writeEndMs','ackMs']){stamp(packet[field]);assert(packet[field]>=previous);previous=packet[field];}
      row.workerNoticeMs=now;row.worker={clock:packet.clock,commandReadMs:packet.commandReadMs,writeStartMs:packet.writeStartMs,writeEndMs:packet.writeEndMs,ackMs:packet.ackMs};
    },
    ingress(text,chunkOrdinal,now){
      stamp(now);assert(Number.isInteger(chunkOrdinal)&&chunkOrdinal>=0);const joined=tail+text,found=[];
      for(const match of joined.matchAll(/S5_ACK_0_(\d+)\x1b8/g)){const row=probe(Number(match[1]));if(row.ackIngressMs===undefined){row.ackIngressMs=now;row.ackChunkOrdinal=chunkOrdinal;found.push(row.ordinal);}}
      tail=joined.slice(-512);return found;
    },
    rendered(packet,now){
      stamp(now);stamp(packet.rendererInputMs);stamp(packet.renderMs);assert(packet.renderMs>=packet.rendererInputMs);assert(Array.isArray(packet.chunkStages)&&packet.chunkStages.length<=4);assert.equal(typeof packet.longTaskSupported,'boolean');assert(Array.isArray(packet.longTasks)&&packet.longTasks.length<=10000);
      for(const stage of packet.chunkStages){let previous=-1;for(const field of ['receivedMs','queueStartMs','hashEndMs','writeEndMs']){stamp(stage[field]);assert(stage[field]>=previous);previous=stage[field];}assert(Number.isInteger(stage.chunkOrdinal)&&stage.chunkOrdinal>=0);}
      for(const task of packet.longTasks){stamp(task.startMs);stamp(task.durationMs);}
      const row=probe(packet.ordinal);assert.equal(row.renderedReceivedMs,undefined);assert.equal(row.rendererInputMs,packet.rendererInputMs);assert.equal(packet.inputView,row.rendererInputView);row.renderedReceivedMs=now;row.renderer={inputMs:packet.rendererInputMs,renderMs:packet.renderMs,chunkStages:packet.chunkStages,longTaskSupported:packet.longTaskSupported,longTasks:packet.longTasks};
    },
    async operation(kind,fn,clock){const span={kind,startMs:clock(),endMs:null,status:'open'};stamp(span.startMs);append(operations,span,1024);try{const response=await fn();span.status='completed';return response;}catch(error){span.status='failed';throw error;}finally{span.endMs=clock();stamp(span.endMs);assert(span.endMs>=span.startMs);}},
    loop(previous,now){stamp(previous);stamp(now);if(now-previous-20>=20)append(loopGaps,{startMs:previous+20,endMs:now,clock:'main-monotonic'},10000);},
    snapshot(){return structuredClone({clock:'main-monotonic',timerMs:20,timerLatenessRecordedFromMs:20,probes:[...probes.values()],skipped,operations,loopGaps});}
  };
}
module.exports={createTrace};

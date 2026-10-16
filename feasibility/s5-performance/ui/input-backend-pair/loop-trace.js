'use strict';
const assert=require('node:assert/strict');
function createLoopTrace({clock,periodMs,thresholdMs,schedule,cancel,domain}){
  assert(['worker-monotonic','producer-monotonic'].includes(domain));assert(periodMs>0&&Number.isFinite(periodMs)&&thresholdMs>=0&&Number.isFinite(thresholdMs));
  let status='new',timer=null,previous=-1;const state={domain,periodMs,thresholdMs,startMs:null,lastTickMs:null,stoppedMs:null,ticks:0,gaps:[]};
  function stamp(){const now=clock();assert(Number.isFinite(now)&&now>=0&&now>=previous,'loop-clock-regressed');return now;}
  function tick(){
    if(status!=='running')return;const now=stamp(),startMs=previous+periodMs,latenessMs=now-startMs;
    if(latenessMs>=thresholdMs){assert(state.gaps.length<1000,'loop-trace-cap');state.gaps.push({startMs,endMs:now,latenessMs});}
    previous=now;state.lastTickMs=now;state.ticks++;
  }
  return {
    start(){assert.equal(status,'new');previous=stamp();state.startMs=previous;state.lastTickMs=previous;status='running';timer=schedule(tick,periodMs);},
    stop(){assert.equal(status,'running');state.stoppedMs=stamp();cancel(timer);status='stopped';},
    snapshot(){return structuredClone({...state,status,terminalUnobservedMs:state.stoppedMs===null?null:state.stoppedMs-state.lastTickMs});}
  };
}
module.exports={createLoopTrace};

'use strict';
const assert=require('node:assert/strict');
function delayProbeWrite({delayMs,clock,schedule,write}){
  assert(Number.isFinite(delayMs)&&delayMs>=0&&delayMs<=1000,'invalid-probe-delay');if(delayMs===0){write();return;}
  let previous=-1,done=false;function stamp(){const now=clock();assert(Number.isFinite(now)&&now>=0&&now>=previous,'delay-clock-regressed');previous=now;return now;}
  const deadline=stamp()+delayMs;
  function tick(){if(done)return;const now=stamp();if(now<deadline){schedule(tick,deadline-now);return;}done=true;write();}
  schedule(tick,delayMs);
}
module.exports={delayProbeWrite};

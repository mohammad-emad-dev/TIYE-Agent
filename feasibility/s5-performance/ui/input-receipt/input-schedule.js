'use strict';
const assert=require('node:assert/strict');
function startInputSchedule({clock,schedule,cancel,dispatch,onError,periodMs,stopBeforeMs}){
  assert(Number.isFinite(periodMs)&&periodMs>0&&Number.isFinite(stopBeforeMs));
  const count=Math.ceil(stopBeforeMs/periodMs)-1;assert(Number.isInteger(count)&&count>0&&count<=50,'input-slot-cap');
  const plannedDueMs=Array.from({length:count},(_,index)=>(index+1)*periodMs),checks=[];
  let status='running',index=0,timer=null,generation=0,lastClock=-1;
  function readClock(){const now=clock();assert(Number.isFinite(now)&&now>=0&&now>=lastClock,'schedule-clock-regressed');lastClock=now;return now;}
  function cancelTimer(){generation++;if(timer!==null){cancel(timer);timer=null;}}
  function fail(error){if(status!=='running')return;status='failed';cancelTimer();onError(error);}
  function arm(){const now=readClock(),token=++generation;timer=schedule(()=>tick(token),Math.max(0,plannedDueMs[index]-now));}
  function advance(){
    const checkedMs=readClock(),dueMs=plannedDueMs[index];
    if(checkedMs<dueMs){arm();return;}
    assert(checkedMs<stopBeforeMs,'input-active-window-ended');assert(checkedMs<dueMs+periodMs,'input-slot-missed');
    const check={slot:index+1,dueMs,checkedMs};checks.push(check);dispatch({...check});index++;
    if(status!=='running')return;if(index===count){status='completed';return;}arm();
  }
  function tick(token){if(status!=='running'||token!==generation)return;timer=null;try{advance();}catch(error){fail(error);}}
  const controller={
    stop(){if(status!=='running')return;status='stopped';cancelTimer();},
    snapshot(){return structuredClone({mode:'independent-fixed-deadline',clock:'main-monotonic',periodMs,stopBeforeMs,status,plannedDueMs,checks});}
  };
  try{arm();}catch(error){fail(error);}return controller;
}
module.exports={startInputSchedule};

'use strict';
const assert=require('node:assert/strict');
function createSearchBarrier({clock,schedule,cancel,periodMs,timeoutMs}){
  assert(Number.isFinite(periodMs)&&periodMs>0&&Number.isFinite(timeoutMs)&&timeoutMs>0);
  const rows=[];let pending=null,failed=false,lastClock=-1;
  function stamp(){const now=clock();assert(Number.isFinite(now)&&now>=0&&now>=lastClock,'barrier-clock-regressed');lastClock=now;return now;}
  function expire(hold){
    if(pending!==hold)return;const now=stamp();
    if(now<hold.row.deadlineMs){hold.timer=schedule(()=>expire(hold),hold.row.deadlineMs-now);return;}
    hold.row.status='failed';hold.row.failedMs=now;failed=true;pending=null;hold.reject(Error('search-barrier-timeout-slot-'+hold.row.slot));
  }
  return {
    wait(slot){
      assert(!failed&&!pending,'barrier-unavailable');assert(Number.isInteger(slot)&&slot===rows.length+1&&slot<=35,'barrier-slot-order');
      const armedMs=stamp(),dueMs=slot*periodMs;assert(armedMs<dueMs,'barrier-armed-too-late');
      const row={slot,dueMs,armedMs,deadlineMs:armedMs+timeoutMs,completedMs:null,releasedMs:null,status:'pending'};rows.push(row);
      return new Promise((resolve,reject)=>{
        const hold={row,resolve,reject,timer:null};pending=hold;
        try{hold.timer=schedule(()=>expire(hold),timeoutMs);}catch(error){row.status='failed';failed=true;pending=null;reject(error);}
      });
    },
    release(slot,completedMs){
      assert(pending&&pending.row.slot===slot,'barrier-release-mismatch');const releasedMs=stamp(),hold=pending;
      assert(Number.isFinite(completedMs)&&completedMs>=hold.row.dueMs&&completedMs>=hold.row.armedMs&&releasedMs>=completedMs,'barrier-release-order');
      assert(releasedMs<hold.row.deadlineMs,'barrier-release-after-deadline');cancel(hold.timer);hold.row.completedMs=completedMs;hold.row.releasedMs=releasedMs;hold.row.status='released';pending=null;hold.resolve();
    },
    snapshot(){return structuredClone({mode:'held-page-response-until-input-render-ack',clock:'main-monotonic',periodMs,timeoutMs,failed,pendingSlot:pending?.row.slot??null,rows});}
  };
}
module.exports={createSearchBarrier};

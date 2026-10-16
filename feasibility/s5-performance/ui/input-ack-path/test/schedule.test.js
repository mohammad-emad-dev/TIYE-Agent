'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{startInputSchedule}=require('../input-schedule');
function fixture(dispatch){let now=0,id=0;const callbacks=new Map(),delays=[],cancelled=[],errors=[],sent=[];
  const controller=startInputSchedule({clock:()=>now,schedule:(fn,delay)=>{callbacks.set(++id,fn);delays.push(delay);return id;},cancel:handle=>cancelled.push(handle),dispatch:packet=>{sent.push(packet);dispatch?.(packet);},onError:error=>errors.push(error.message),periodMs:5000,stopBeforeMs:178000});
  return {controller,sent,delays,errors,cancelled,fire(at,handle=id){now=at;callbacks.get(handle)();}};
}
test('absolute deadlines dispatch while unrelated async work is still pending without cumulative drift',async()=>{
  let finish;const unrelated=new Promise(resolve=>{finish=resolve;});let settled=false;unrelated.then(()=>{settled=true;});
  const f=fixture();f.fire(4999);assert.equal(f.sent.length,0);assert.equal(f.delays.at(-1),1);
  f.fire(5002);await Promise.resolve();assert.equal(settled,false);assert.equal(f.delays.at(-1),4998);
  for(let slot=2;slot<=35;slot++)f.fire(slot*5000+2);
  const snapshot=f.controller.snapshot();assert.equal(snapshot.status,'completed');assert.deepEqual(snapshot.plannedDueMs,Array.from({length:35},(_,i)=>(i+1)*5000));assert.deepEqual(snapshot.checks.map(row=>row.checkedMs-row.dueMs),Array(35).fill(2));assert.equal(f.sent.length,35);
  snapshot.checks[0].dueMs=0;assert.equal(f.controller.snapshot().checks[0].dueMs,5000);finish();await unrelated;
});
test('a whole missed slot or active-window expiry fails once without catch-up dispatch',()=>{
  for(const at of [10000,178000]){const f=fixture();f.fire(at);f.fire(at);assert.equal(f.controller.snapshot().status,'failed');assert.equal(f.sent.length,0);assert.equal(f.errors.length,1);}
});
test('stopping or a failed dispatch suppresses stale callbacks and retains attempted check',()=>{
  let f=fixture();f.controller.stop();f.fire(5000);assert.equal(f.sent.length,0);assert.equal(f.controller.snapshot().status,'stopped');assert.equal(f.cancelled.length,1);
  f=fixture(()=>{throw Error('overlapping-input-probe');});f.fire(5000);f.fire(5001);assert.deepEqual(f.errors,['overlapping-input-probe']);assert.equal(f.controller.snapshot().checks.length,1);assert.equal(f.controller.snapshot().status,'failed');assert.equal(f.sent.length,1);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createSearchBarrier}=require('../search-barrier');
function fixture(){let now=4250,id=0;const callbacks=new Map(),cancelled=[];
  const barrier=createSearchBarrier({clock:()=>now,schedule:fn=>{callbacks.set(++id,fn);return id;},cancel:timer=>cancelled.push(timer),periodMs:5000,timeoutMs:3000});
  return {barrier,cancelled,set(at){now=at;},fire(at,handle=id){now=at;callbacks.get(handle)();}};
}
test('page wait stays pending until matching render ACK and ignores stale timeout after release',async()=>{
  const f=fixture();let released=false;const waiting=f.barrier.wait(1).then(()=>{released=true;});await Promise.resolve();assert.equal(released,false);
  f.set(5020);f.barrier.release(1,5019);await waiting;assert.equal(released,true);assert.equal(f.cancelled.length,1);f.fire(8000);
  const snapshot=f.barrier.snapshot();assert.equal(snapshot.rows[0].completedMs,5019);assert.equal(snapshot.rows[0].releasedMs,5020);assert.equal(snapshot.failed,false);snapshot.rows[0].slot=9;assert.equal(f.barrier.snapshot().rows[0].slot,1);
});
test('timeout fails the unresolved page wait without permitting later ACK or another hold',async()=>{
  const f=fixture(),waiting=f.barrier.wait(1),rejected=assert.rejects(waiting,/search-barrier-timeout-slot-1/);f.fire(7249);assert.equal(f.barrier.snapshot().rows[0].status,'pending');f.fire(7250);await rejected;
  assert.equal(f.barrier.snapshot().rows[0].status,'failed');assert.throws(()=>f.barrier.release(1,7250));assert.throws(()=>f.barrier.wait(2));
});
test('orphan, duplicate, wrong ordinal, late arm and premature release are rejected',async()=>{
  let f=fixture();assert.throws(()=>f.barrier.release(1,5000));assert.throws(()=>f.barrier.wait(2));const waiting=f.barrier.wait(1);assert.throws(()=>f.barrier.wait(1));f.set(5001);assert.throws(()=>f.barrier.release(2,5000));assert.throws(()=>f.barrier.release(1,4999));f.barrier.release(1,5000);await waiting;assert.throws(()=>f.barrier.release(1,5001));
  f=fixture();f.set(5000);assert.throws(()=>f.barrier.wait(1),/barrier-armed-too-late/);
});

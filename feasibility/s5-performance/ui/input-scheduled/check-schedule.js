'use strict';
const assert=require('node:assert/strict');
function checkSchedule(evidence){
  const {scheduler,trace,profile}=evidence;
  assert.equal(scheduler.mode,'independent-fixed-deadline');assert.equal(scheduler.clock,trace.clock);assert.equal(scheduler.status,'completed');
  assert.equal(scheduler.periodMs,profile.inputMs);assert.equal(scheduler.stopBeforeMs,profile.mixedMs-2000);
  const expected=Array.from({length:Math.ceil(scheduler.stopBeforeMs/scheduler.periodMs)-1},(_,index)=>(index+1)*scheduler.periodMs);
  assert.equal(expected.length,35);assert.deepEqual(scheduler.plannedDueMs,expected);assert.equal(scheduler.checks.length,expected.length);
  const attempts=[...trace.probes.map(probe=>({dueMs:probe.dueMs,checkedMs:probe.schedule.checkedMs,probe})),...trace.skipped.map(skip=>({dueMs:skip.dueMs,checkedMs:skip.checkedMs}))];
  assert.equal(attempts.length,expected.length);
  for(const [index,dueMs]of expected.entries()){
    const check=scheduler.checks[index];assert.equal(check.slot,index+1);assert.equal(check.dueMs,dueMs);assert(Number.isFinite(check.checkedMs)&&check.checkedMs>=dueMs&&check.checkedMs<Math.min(dueMs+scheduler.periodMs,scheduler.stopBeforeMs));
    const matching=attempts.filter(attempt=>attempt.dueMs===dueMs);assert.equal(matching.length,1);const attempt=matching[0];assert.equal(attempt.checkedMs,check.checkedMs);
    if(attempt.probe){const probe=attempt.probe;assert.equal(probe.schedule.slot,check.slot);assert.equal(typeof probe.schedule.viewTransitioning,'boolean');assert(probe.dispatchMs>=check.checkedMs&&probe.dispatchMs<Math.min(dueMs+scheduler.periodMs,scheduler.stopBeforeMs));assert.equal(probe.rendererInputView,probe.view,'renderer-input-view-mismatch');}
  }
  return {planned:expected.length,checked:scheduler.checks.length,allSlotsAccounted:true,viewCorrelationValid:true};
}
module.exports={checkSchedule};

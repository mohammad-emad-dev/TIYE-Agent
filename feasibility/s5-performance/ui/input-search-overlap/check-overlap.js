'use strict';
const assert=require('node:assert/strict');
function checkOverlap(evidence){
  const {trace,searchBarrier:barrier,profile}=evidence;assert.equal(trace.clock,'main-monotonic');assert.equal(barrier.clock,trace.clock);
  assert.equal(barrier.mode,'held-page-response-until-input-render-ack');assert.equal(barrier.periodMs,profile.inputMs);assert.equal(barrier.timeoutMs,profile.searchBarrierTimeoutMs);assert.equal(barrier.failed,false);assert.equal(barrier.pendingSlot,null);
  assert.equal(barrier.rows.length,35);assert.equal(trace.probes.length,35);assert.equal(trace.skipped.length,0);assert.equal(evidence.searches.length,36);assert.equal(evidence.searches[0].controlSlot,null);
  const searches=trace.operations.filter(span=>span.kind==='render-search'),waits=trace.operations.filter(span=>span.kind==='controlled-search-wait'),pages=trace.operations.filter(span=>span.kind==='feed-page');
  assert.equal(searches.length,36);assert.equal(waits.length,35);assert.equal(pages.length,36);
  for(const [index,row]of barrier.rows.entries()){
    const slot=index+1,probe=trace.probes[index],search=searches[slot],wait=waits[index],page=pages[slot],report=evidence.searches[slot];
    assert.equal(row.slot,slot);assert.equal(probe.ordinal,slot);assert.equal(probe.schedule.slot,slot);assert.equal(report.controlSlot,slot);assert.equal(row.status,'released');assert.equal(row.dueMs,slot*profile.inputMs);assert.equal(row.deadlineMs,row.armedMs+profile.searchBarrierTimeoutMs);
    for(const field of ['armedMs','completedMs','releasedMs'])assert(Number.isFinite(row[field])&&row[field]>=0);
    assert(row.armedMs<row.dueMs&&row.dueMs===probe.dueMs);assert.equal(row.completedMs,probe.renderedReceivedMs);assert(row.completedMs<=row.releasedMs&&row.releasedMs<row.deadlineMs);
    let previous=row.armedMs;for(const field of ['dispatchMs','inputReceivedMs','ackIngressMs','renderedReceivedMs']){assert(Number.isFinite(probe[field])&&probe[field]>=previous);previous=probe[field];}
    assert(search.startMs<=wait.startMs&&wait.startMs<=row.armedMs&&row.releasedMs<=wait.endMs&&wait.endMs<=page.startMs&&page.startMs<=page.endMs&&page.endMs<=report.elapsedMs&&report.elapsedMs<=search.endMs,'controlled-search-order');
    for(const span of [search,wait,page])assert.equal(span.status,'completed');
    assert.equal(report.view,probe.view);assert.equal(probe.rendererInputView,probe.view);
  }
  return {controlledSearches:35,completedInputIntervalsContained:35,initialUnheldSearches:1,realPageQueriesAfterRelease:35,asynchronousResponseHold:true,synchronousQueryContentionMeasured:false};
}
module.exports={checkOverlap};

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWorkerTrace}=require('../worker-trace'),{createTrace}=require('../trace-ledger');
function fixture(){let now=1000;const packets=[],trace=createWorkerTrace(0,()=>now++,packet=>packets.push(packet));return {trace,packets};}
function write(trace,ordinal){trace.command(ordinal);trace.writeStart(ordinal);trace.writeEnd(ordinal);}
test('worker scanner retains fragmented ordinal/suffix and scans before truncating large chunks',()=>{
  const {trace,packets}=fixture();write(trace,1);trace.ingress('S5_ACK_0_');trace.ingress('1\x1b');assert.equal(packets.length,0);trace.ingress('8'+'z'.repeat(10000));assert.equal(packets[0].ordinal,1);
  write(trace,2);trace.ingress('S5_ACK_0_2\x1b8'+'q'.repeat(9000));assert.equal(packets.length,2);assert.equal(packets[1].ordinal,2);
  assert.deepEqual([packets[0].commandReadMs,packets[0].writeStartMs,packets[0].writeEndMs,packets[0].ackMs],[1000,1001,1002,1005]);
});
test('worker rejects overlaps, missing write stage, duplicate and unknown ACKs',()=>{
  let {trace}=fixture();trace.command(1);assert.throws(()=>trace.command(2));assert.throws(()=>trace.writeEnd(1));assert.throws(()=>trace.ingress('S5_ACK_0_1\x1b8'));
  ({trace}=fixture());write(trace,1);trace.ingress('S5_ACK_0_1\x1b8');assert.throws(()=>trace.ingress('S5_ACK_0_1\x1b8'));
  ({trace}=fixture());assert.throws(()=>trace.command(2));write(trace,1);assert.throws(()=>trace.ingress('S5_ACK_0_2\x1b8'));
});
test('parent accepts either IPC/stdout order and pipe callback after ACK without mixing clocks',()=>{
  for(const noticeFirst of [true,false]){
    const trace=createTrace();trace.dispatched(1,'grid',5,6);trace.input({ordinal:1,rendererInputMs:9000,inputView:'grid',queueDepth:0},7);trace.controlStarted(1,8);
    const packet={ordinal:1,clock:'worker-monotonic',commandReadMs:2000,writeStartMs:2001,writeEndMs:2002,ackMs:2010};
    if(noticeFirst)trace.notice(packet,9);trace.ingress('S5_ACK_0_1\x1b8',0,10);if(!noticeFirst)trace.notice(packet,11);trace.controlFlushed(1,12);
    assert.equal(trace.snapshot().probes[0].worker.ackMs,2010);assert.throws(()=>trace.notice(packet,13));
  }
});
test('invalid local clock ordering and foreign worker clock tags are rejected',()=>{
  const trace=createTrace();trace.dispatched(1,'grid',5,6);
  assert.throws(()=>trace.notice({ordinal:1,clock:'main-monotonic'},7));
  assert.throws(()=>trace.notice({ordinal:1,clock:'worker-monotonic',commandReadMs:3,writeStartMs:2,writeEndMs:4,ackMs:5},7));
  let now=10;const worker=createWorkerTrace(0,()=>now--,()=>{});worker.command(1);assert.throws(()=>worker.writeStart(1));
});

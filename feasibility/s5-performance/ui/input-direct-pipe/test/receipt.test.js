'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{delayProbeWrite}=require('../delay-probe'),{createTrace}=require('../trace-ledger'),{createWorkerTrace}=require('../worker-trace');
test('zero delay stays synchronous; delayed writes rearm early timers and run once',()=>{
  let writes=0;delayProbeWrite({delayMs:0,write:()=>writes++});assert.equal(writes,1);
  let now=100,tick;const delays=[];delayProbeWrite({delayMs:120,clock:()=>now,schedule:(fn,delay)=>{tick=fn;delays.push(delay);},write:()=>writes++});now=219;tick();assert.equal(writes,1);assert.equal(delays.at(-1),1);now=220;tick();tick();assert.equal(writes,2);
});
test('invalid delay clocks fail without silently releasing the write',()=>{
  for(const bad of [NaN,99]){let now=100,tick,writes=0;delayProbeWrite({delayMs:120,clock:()=>now,schedule:fn=>{tick=fn;},write:()=>writes++});now=bad;assert.throws(()=>tick());assert.equal(writes,0);}
});
test('receipt records tolerate ACK-first stdout arrival and reject duplicate receipts',()=>{
  const trace=createTrace();trace.dispatched(1,'grid',5,6);trace.input({ordinal:1,rendererInputMs:100,inputView:'grid',queueDepth:0},7);trace.controlStarted(1,8,'pipe');trace.ingress('S5_ACK_0_1\x1b8',0,10);
  const receipt={ordinal:1,transport:'pipe',clock:'worker-monotonic',commandReadMs:2000,configuredDelayMs:0};trace.receipt(receipt,11);assert.equal(trace.snapshot().probes[0].commandReceiptMs,11);assert.throws(()=>trace.receipt(receipt,12));
});
test('worker receipt and later ACK metadata preserve the same raw command stamp',()=>{
  let now=1;const packets=[],worker=createWorkerTrace(0,()=>now++,packet=>packets.push(packet));worker.command(1);worker.writeStart(1);worker.writeEnd(1);worker.ingress('S5_ACK_0_1\x1b8');assert.equal(packets[0].event,'probe-command-received');assert.equal(packets[1].event,'probe-worker-timing');assert.equal(packets[0].commandReadMs,packets[1].commandReadMs);
});

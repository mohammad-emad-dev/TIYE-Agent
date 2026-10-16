'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createTrace}=require('../trace-ledger'),{classifyOverlap}=require('../overlap');
test('overlap keeps endpoint contact, open intervals and foreign clocks distinct',()=>{
  const probe={startMs:10,endMs:20,clock:'main-monotonic'};
  for(const [span,expected]of [[{startMs:20,endMs:22,clock:probe.clock},'touch'],[{startMs:19,endMs:21,clock:probe.clock},'overlap'],[{startMs:15,endMs:null,clock:probe.clock},'not-finished'],[{startMs:15,endMs:18,clock:'renderer'},'unknown-clock'],[{startMs:15,endMs:14,clock:probe.clock},'unknown-data']])assert.equal(classifyOverlap(probe,span),expected);
});
test('fragmented ACK markers wait for the complete ordinal and restore sequence',()=>{
  const trace=createTrace();for(let index=1;index<=12;index++)trace.dispatched(index,'grid',index*5,index*5);
  assert.deepEqual(trace.ingress('S5_ACK_0_1',0,70),[]);assert.deepEqual(trace.ingress('2\x1b8',1,71),[12]);assert.deepEqual(trace.ingress('again',2,72),[]);
  const probes=trace.snapshot().probes;assert.equal(probes[0].ackIngressMs,undefined);assert.equal(probes[11].ackChunkOrdinal,1);
});
test('operation failures remain failed spans and open probe stages stay absent',async()=>{
  const trace=createTrace();trace.dispatched(1,'focus',5,6);let now=10;
  await assert.rejects(trace.operation('test-operation',async()=>{throw Error('failure');},()=>now++));
  const snapshot=trace.snapshot();assert.equal(snapshot.operations[0].status,'failed');assert.equal(snapshot.operations[0].endMs,11);assert.equal(snapshot.probes[0].renderedReceivedMs,undefined);
});

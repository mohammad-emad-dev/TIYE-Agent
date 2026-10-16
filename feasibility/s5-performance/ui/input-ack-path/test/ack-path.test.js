'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createLoopTrace}=require('../loop-trace'),{createProducerTrace}=require('../producer-trace');
test('loop trace retains threshold-boundary lateness without inventing catch-up ticks',()=>{
  let now=100,tick,cancelled=0;const loop=createLoopTrace({clock:()=>now,periodMs:20,thresholdMs:20,schedule:callback=>{tick=callback;return 1;},cancel:()=>{cancelled++;},domain:'worker-monotonic'});
  loop.start();assert.throws(()=>loop.start());for(const at of [120,159,199,259]){now=at;tick();}now=265;loop.stop();tick();
  const snapshot=loop.snapshot();assert.equal(snapshot.ticks,4);assert.deepEqual(snapshot.gaps,[{startMs:179,endMs:199,latenessMs:20},{startMs:219,endMs:259,latenessMs:40}]);assert.equal(snapshot.terminalUnobservedMs,6);assert.equal(cancelled,1);snapshot.gaps.pop();assert.equal(loop.snapshot().gaps.length,2);assert.throws(()=>loop.stop());
});
test('loop trace fails on regression or capacity overflow instead of dropping evidence',()=>{
  for(const scenario of ['regression','capacity']){let now=0,tick;const loop=createLoopTrace({clock:()=>now,periodMs:20,thresholdMs:20,schedule:callback=>{tick=callback;return 1;},cancel:()=>{},domain:'producer-monotonic'});loop.start();
    if(scenario==='regression'){now=-1;assert.throws(()=>tick());}else{for(let index=1;index<=1000;index++){now=index*40;tick();}now+=40;assert.throws(()=>tick(),/loop-trace-cap/);assert.equal(loop.snapshot().gaps.length,1000);}}
});
test('producer preserves false-return writes and waits for their completion callbacks',()=>{
  let now=2,finish;const emitted=[],trace=createProducerTrace({clock:()=>now++,write:(text,callback)=>{emitted.push(text);finish=callback;return false;}});
  trace.ack(1,'unchanged ACK bytes',1);assert.throws(()=>trace.snapshot(),/producer-ack-incomplete/);finish();const snapshot=trace.snapshot();assert.equal(snapshot.rows[0].writeAccepted,false);assert.deepEqual(emitted,['unchanged ACK bytes']);assert.deepEqual([snapshot.rows[0].inputReceivedMs,snapshot.rows[0].writeStartMs,snapshot.rows[0].writeReturnMs,snapshot.rows[0].writeCallbackMs],[1,2,3,4]);assert.throws(()=>trace.ack(1,'duplicate',5));assert.throws(()=>finish());
});
test('independently shifting producer and worker clock origins leaves local analysis unchanged',()=>{
  const {inspectAckPath}=require('../check-ack-path');
  function loop(domain,gap){return {domain,status:'stopped',periodMs:20,thresholdMs:20,startMs:0,lastTickMs:179990,stoppedMs:180000,terminalUnobservedMs:10,ticks:9000,gaps:[gap]};}
  const evidence={profile:{mixedMs:180000},diagnostics:{producer:{schema:'tiye-s5-producer-ack-v1',member:0,loop:loop('producer-monotonic',{startMs:4990,endMs:5010,latenessMs:20}),ack:{clock:'producer-monotonic',rows:Array.from({length:35},(_,index)=>{const ordinal=index+1,at=ordinal*5000;return {ordinal,inputReceivedMs:at,writeStartMs:at+1,writeReturnMs:at+2,writeCallbackMs:at+4,writeAccepted:true};})}},worker:{schema:'tiye-s5-worker-loop-v1',member:0,loop:loop('worker-monotonic',{startMs:6020,endMs:6040,latenessMs:20})}},trace:{probes:Array.from({length:35},(_,index)=>{const ordinal=index+1,at=ordinal*5000+1000;return {ordinal,worker:{clock:'worker-monotonic',commandReadMs:at,writeStartMs:at+1,writeEndMs:at+2,ackMs:at+40}};})}};
  const original=inspectAckPath(evidence);
  for(const [diagnostic,offset]of [[evidence.diagnostics.producer,10000],[evidence.diagnostics.worker,2000000]]){const trace=diagnostic.loop;for(const field of ['startMs','lastTickMs','stoppedMs'])trace[field]+=offset;for(const gap of trace.gaps){gap.startMs+=offset;gap.endMs+=offset;}}
  for(const row of evidence.diagnostics.producer.ack.rows)for(const field of ['inputReceivedMs','writeStartMs','writeReturnMs','writeCallbackMs'])row[field]+=10000;
  for(const probe of evidence.trace.probes)for(const field of ['commandReadMs','writeStartMs','writeEndMs','ackMs'])probe.worker[field]+=2000000;
  assert.deepEqual(inspectAckPath(evidence),original);
});

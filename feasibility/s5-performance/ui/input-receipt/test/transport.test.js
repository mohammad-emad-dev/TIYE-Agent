'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{sendProbe,createProbeReceiver}=require('../probe-transport');
test('false write/send return delivers once on selected route and completion is separate from send',()=>{
  for(const transport of ['pipe','ipc']){
    const writes=[],sent=[],events=[];let finish;const worker={connected:true,killed:false,stdin:{writable:true,destroyed:false,write:(packet,callback)=>{writes.push(packet);finish=callback;return false;}},send:(packet,callback)=>{sent.push(packet);finish=callback;return false;}};
    sendProbe({worker,transport,ordinal:1,onStart:route=>events.push(route),onComplete:()=>events.push('complete'),onError:error=>{throw error;}});
    assert.equal(writes.length,transport==='pipe'?1:0);assert.equal(sent.length,transport==='ipc'?1:0);assert.deepEqual(events,[transport]);finish();assert.deepEqual(events,[transport,'complete']);
    assert.deepEqual(transport==='pipe'?JSON.parse(writes[0]):sent[0],{action:'probe',probeOrdinal:1});
  }
});
test('callback errors are reported without fallback and unavailable channels reject before sending',()=>{
  for(const transport of ['pipe','ipc']){
    let sends=0,errors=0;const worker={connected:true,killed:false,stdin:{writable:true,destroyed:false,write:(_,callback)=>{sends++;callback(Error('closed'));}},send:(_,callback)=>{sends++;callback(Error('closed'));}};
    const request={worker,transport,ordinal:1,onStart:()=>{},onComplete:()=>assert.fail('unexpected-completion'),onError:()=>{errors++;}};sendProbe(request);assert.equal(sends,1);assert.equal(errors,1);
    worker.connected=false;worker.stdin.destroyed=true;assert.throws(()=>sendProbe(request));assert.equal(sends,1);
  }
});
test('receiver rejects wrong route, malformed packets and duplicate/out-of-order ordinals without delivery',()=>{
  for(const transport of ['pipe','ipc']){
    const received=[],receiver=createProbeReceiver({transport,onProbe:ordinal=>received.push(ordinal)}),packet={action:'probe',probeOrdinal:1};
    assert.throws(()=>receiver.receive(packet,transport==='pipe'?'ipc':'pipe'));
    for(const command of [null,[],{action:'start',probeOrdinal:1},{...packet,extra:true},{action:'probe',probeOrdinal:2}])assert.throws(()=>receiver.receive(command,transport));
    assert.equal(received.length,0);receiver.receive(packet,transport);assert.throws(()=>receiver.receive(packet,transport));receiver.receive({...packet,probeOrdinal:2},transport);assert.deepEqual(received,[1,2]);
  }
});

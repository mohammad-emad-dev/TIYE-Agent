'use strict';
const assert=require('node:assert/strict');
function sendProbe({worker,transport,ordinal,onStart,onComplete,onError}){
  assert(['pipe','ipc'].includes(transport));assert(Number.isInteger(ordinal)&&ordinal>=1&&ordinal<=35);
  const command={action:'probe',probeOrdinal:ordinal},completed=error=>{if(error)onError(error);else onComplete();};
  if(transport==='pipe')assert(worker.stdin&&!worker.stdin.destroyed&&worker.stdin.writable,'probe-pipe-unavailable');
  else assert(worker.connected&&!worker.killed&&typeof worker.send==='function','probe-ipc-unavailable');
  const line=transport==='pipe'?JSON.stringify(command)+'\n':null;onStart(transport);
  // A false return is backpressure; retrying would deliver the input twice.
  try{if(transport==='pipe')worker.stdin.write(line,completed);else worker.send(command,completed);}catch(error){onError(error);}
}
function createProbeReceiver({transport,onProbe}){
  assert(['pipe','ipc'].includes(transport));let next=1;
  return {receive(command,channel){
    assert.equal(channel,transport,'probe-wrong-channel');
    assert(command&&typeof command==='object'&&!Array.isArray(command)&&Object.keys(command).length===2&&Object.hasOwn(command,'action')&&Object.hasOwn(command,'probeOrdinal')&&command.action==='probe','malformed-probe');
    assert(Number.isInteger(command.probeOrdinal)&&command.probeOrdinal===next&&next<=35,'probe-order');next++;onProbe(command.probeOrdinal);
  }};
}
module.exports={sendProbe,createProbeReceiver};

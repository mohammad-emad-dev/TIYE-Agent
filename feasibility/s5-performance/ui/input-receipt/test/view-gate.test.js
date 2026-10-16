'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createViewGate}=require('../view-gate');
test('a due input waits for view confirmation and retains its original deadline',async()=>{
  let confirm,now=10,view='grid';const sent=[],gate=createViewGate({clock:()=>now,dispatch:packet=>sent.push({packet,view}),change:()=>new Promise(resolve=>{confirm=resolve;}),inputPending:()=>false,wait:async()=>{},setView:next=>{view=next;}});
  const switching=gate.switchTo('focus');gate.input({slot:6,dueMs:30000,checkedMs:30001});assert.equal(sent.length,0);assert.throws(()=>gate.input({slot:7}));now=20;confirm('focus');await switching;
  assert.equal(sent[0].view,'focus');assert.deepEqual(sent[0].packet,{slot:6,dueMs:30000,checkedMs:30001,viewWaitStartMs:10,viewWaitEndMs:20});assert.equal(gate.snapshot().pendingInput,null);
});
test('view mutation waits for an outstanding probe to complete',async()=>{
  let pending=true,release,changed=false;const gate=createViewGate({clock:()=>1,dispatch:()=>{},change:async next=>{changed=true;return next;},inputPending:()=>pending,wait:()=>new Promise(resolve=>{release=resolve;}),setView:()=>{}});
  const switching=gate.switchTo('focus');assert.equal(changed,false);pending=false;release();await switching;assert.equal(changed,true);
});

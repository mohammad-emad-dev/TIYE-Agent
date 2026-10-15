'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {requiredRoles,roleSeries,summarize}=require('../resource-metrics');
const {validateRows,redactRows}=require('../sampler');
const row=(sampledAtMs,cpuMs)=>({role:'main',status:'present',sampledAtMs,cpuMs,workingSetBytes:4096,privateBytes:8192});
const sample=(elapsedMs,processes)=>({elapsedMs,phase:'flood',collectionMs:1,processes});

test('CPU deltas use one-core units and never bridge missing samples',()=>{
  const snapshots=[sample(0,[row(1000,100)]),sample(5000,[row(6000,2600)]),sample(10000,[{role:'main',status:'exited'}]),sample(15000,[row(16000,3000)])];
  assert.deepEqual(roleSeries(snapshots,'main').map(entry=>entry.cpuOneCorePercent),[null,50,null]);
  assert.equal(summarize(snapshots).activeCoverageComplete,false);
});
test('empty, missing and decreasing process counters cannot manufacture CPU measurements',()=>{
  assert.equal(summarize([]).activeCoverageComplete,false);
  const snapshots=[sample(0,[row(1000,100)]),sample(5000,[row(1000,90)])];
  assert.equal(roleSeries(snapshots,'main')[1].cpuOneCorePercent,null);
  assert.equal(summarize(snapshots).roles[0].idlePrivateDeltaBytes,null);
  assert.equal(summarize(snapshots).memorySettlingQualified,false);
});
test('process identity changes redact counters and never publish raw IDs',()=>{
  const registry=new Map([[123,'main']]),identities=new Map();
  const first={pid:123,status:'present',identity:'111',sampledAtMs:1,cpuMs:0,workingSetBytes:4096,privateBytes:8192};
  validateRows([first],[123]);
  const redacted=redactRows([first],registry,identities);
  assert.equal(redacted[0].role,'main');assert(!('pid' in redacted[0]));assert(!('identity' in redacted[0]));
  assert.deepEqual(redactRows([{...first,identity:'222'}],registry,identities),[{role:'main',status:'identity-changed'}]);
});
test('foreign process samples and invalid counters are rejected at the sampler boundary',()=>{
  for(const rows of [[{pid:999,status:'exited'}],[{pid:123,status:'present',identity:'x'}],
    [{pid:123,status:'present',identity:'111',sampledAtMs:1,cpuMs:-1,workingSetBytes:0,privateBytes:0}],[]])assert.throws(()=>validateRows(rows,[123]));
});
test('expected producer exit permits idle coverage but a missing active role does not',()=>{
  const snapshots=Array.from({length:8},(_,index)=>sample(index*5000,requiredRoles.map(role=>({...row(index*5000,index*100),role}))));
  for(let index=0;index<8;index++)snapshots.push({elapsedMs:65000+index*5000,phase:'idle',collectionMs:1,
    processes:['main','renderer'].map(role=>({...row(65000+index*5000,1000+index*10),role,privateBytes:8192+index*1024}))});
  const complete=summarize(snapshots);
  assert.equal(complete.activeCoverageComplete,true);assert.equal(complete.idleCoverageComplete,true);
  assert.equal(complete.roles.find(process=>process.role==='main').idlePrivateDeltaBytes,7168);
  snapshots[3].processes[2]={role:'worker-0',status:'unavailable'};
  assert.equal(summarize(snapshots).activeCoverageComplete,false);
});

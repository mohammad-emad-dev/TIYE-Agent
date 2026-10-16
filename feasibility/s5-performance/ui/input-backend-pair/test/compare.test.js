'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{compare}=require('../compare');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-'+name+'.json')));
test('comparison preserves each ordinary population and its declared positive control',()=>{
  const pty=load('pty'),direct=load('direct'),before=JSON.stringify([pty,direct]),report=compare(pty,direct);
  assert.equal(report.profiles.pty.ordinary.count,34);assert.equal(report.profiles.direct.ordinary.count,34);
  assert.equal(report.profiles.pty.positiveControl.ordinal,7);assert.equal(report.profiles.direct.positiveControl.ordinal,7);
  assert.equal(report.causalAttribution,false);assert.equal(report.fullS5Qualified,false);assert.equal(JSON.stringify([pty,direct]),before);
  assert.deepEqual(report,JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../../output/s5-input-backend-pair/comparison.json'))));
});
test('comparison rejects altered hashes, topology, control, schedule and raw-child integrity',()=>{
  for(const corrupt of [
    e=>{e.sourceHashes['worker.cjs']='wrong';},e=>{e.buildHashes['dist/renderer.js']='wrong';},
    e=>{e.ptyMembers=5;},e=>{e.trace.probes[6].configuredDelayMs=0;},
    e=>{e.scheduler.plannedDueMs[0]+=1;},e=>{e.diagnostics.worker.backendExit.stdoutSha256='wrong';},
    e=>{e.trace.probes[0].transport='ipc';}
  ]){const direct=load('direct');corrupt(direct);assert.throws(()=>compare(load('pty'),direct));}
});

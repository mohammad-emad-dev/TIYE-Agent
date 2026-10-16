'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {check}=require('../check-evidence'),{analyze}=require('../analyze');
test('native capture is rejected for the recorded dispatch/input view race',()=>assert.throws(()=>check(),/renderer-input-view-mismatch/));
test('analyzer rejects latency arrays that disagree with main-clock probe stamps',()=>{
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-trace.json'),'utf8'));evidence.input.focus.latencies[0]+=1;assert.throws(()=>analyze(evidence));
});
test('recorded schedule rejects missed, missing, drifting deadlines and mismatched input views',()=>{
  const {checkSchedule}=require('../check-schedule');
  for(const corrupt of [
    evidence=>{evidence.scheduler.checks[0].checkedMs=10000;},
    evidence=>{evidence.scheduler.checks.pop();},
    evidence=>{evidence.scheduler.checks.at(-1).dueMs+=1;},
    evidence=>{const probe=evidence.trace.probes[0];probe.rendererInputView=probe.view==='grid'?'focus':'grid';}
  ]){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-trace.json'),'utf8'));
    // Isolate each corruption from the separately tested native view-label failure.
    evidence.trace.probes.forEach(probe=>{probe.rendererInputView=probe.view;});checkSchedule(evidence);corrupt(evidence);assert.throws(()=>checkSchedule(evidence));}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {foregroundAssessment}=require('../foreground-gate'),{profileFor}=require('../profiles');
function exposedCohort(){
  const state={focused:true,visible:true,minimized:false},probes=[];
  for(const [phase,view]of ['grid','focus'].entries())for(let index=0;index<12;index++){
    const dispatchedAtMs=2000+phase*30000+index*2000;
    probes.push({ordinal:probes.length+1,view,viewAtAck:view,dispatchedAtMs,acknowledgedAtMs:dispatchedAtMs+20,latencyMs:20,dispatch:{...state},ack:{...state}});
  }
  return {profile:profileFor('foreground'),focusMonitorControl:{scope:'after-measured-interval',main:{visible:false,focused:false},renderer:{visible:true,focused:false}},exposure:{samples:Array.from({length:1201},(_,seq)=>({seq,elapsedMs:seq*100,...state})),events:[]},probes,
    renderer:{exposure:{initial:state,final:state,focusLost:false,visibilityLost:false,events:[]},frames:{grid:[16,20],focus:[16,22]}},
    input:{grid:{planned:12,skipped:0,latencies:Array(12).fill(20)},focus:{planned:12,skipped:0,latencies:Array(12).fill(20)}},
    searches:[{documentVisible:true,queryMs:3,requestToRafMs:40}]};
}
test('complete exposure distinguishes a passed target from a measured slow ACK',()=>{
  const cohort=exposedCohort();assert.equal(foregroundAssessment(cohort).gridInputUnder100Ms,true);assert.equal(foregroundAssessment(cohort).focusInputUnder100Ms,true);
  cohort.probes[0].latencyMs=100;cohort.probes[0].acknowledgedAtMs=cohort.probes[0].dispatchedAtMs+100;cohort.input.grid.latencies[0]=100;
  assert.equal(foregroundAssessment(cohort).gridInputUnder100Ms,false);
});
test('focus loss, missing snapshots, invalid clocks and event-only blur never qualify exposure',()=>{
  const mutations=[
    cohort=>cohort.focusMonitorControl.renderer.focused=true,
    cohort=>cohort.exposure.samples[30].focused=false,
    cohort=>cohort.exposure.samples.splice(20,6),
    cohort=>cohort.exposure.samples[30].elapsedMs=NaN,
    cohort=>cohort.exposure.samples[30].elapsedMs=cohort.exposure.samples[29].elapsedMs,
    cohort=>cohort.exposure.samples.pop(),
    cohort=>cohort.exposure.events.push({seq:0,elapsedMs:3000,event:'blur',focused:true,visible:true,minimized:false}),
    cohort=>cohort.renderer.exposure.events.push({event:'blur',focused:true,visible:true}),
    cohort=>cohort.renderer.exposure.focusLost=true,
    cohort=>cohort.renderer.exposure.final.visible=false
  ];
  for(const mutate of mutations){const cohort=exposedCohort();mutate(cohort);const report=foregroundAssessment(cohort);assert.equal(report.exposureConfirmed,false);assert.equal(report.gridInputUnder100Ms,null);assert.equal(report.focusRafUnder500Ms,null);}
});
test('missing, uncorrelated or focus-straddling input remains unqualified',()=>{
  const mutations=[
    cohort=>cohort.input.grid.skipped=1,
    cohort=>cohort.input.grid.planned=11,
    cohort=>cohort.input.grid.latencies.pop(),
    cohort=>cohort.probes[0].ack.focused=false,
    cohort=>cohort.probes[0].viewAtAck='focus',
    cohort=>cohort.probes[0].acknowledgedAtMs=120001,
    cohort=>cohort.probes[0].latencyMs=NaN,
    cohort=>cohort.probes[0].ordinal=cohort.probes[1].ordinal,
    cohort=>cohort.probes[0].acknowledgedAtMs+=1
  ];
  for(const mutate of mutations){const cohort=exposedCohort();mutate(cohort);assert.equal(foregroundAssessment(cohort).gridInputUnder100Ms,null);}
});

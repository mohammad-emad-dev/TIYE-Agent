'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence,assessment}=require('../check-evidence');
const initial=require('../evidence-initial.json'),clone=()=>structuredClone(initial);

test('initial timing defects remain unqualified for visible UI performance',()=>{
  validateEvidence(initial);assert(initial.views[0].renderer.frameGaps.some(gap=>gap<0));
  assert.equal(initial.views[0].targets.frames,null);
  for(const view of initial.views)assert.equal(assessment(view).syntheticInputTarget,null);
});
test('missing terminal, output mismatch, short duration and invented passes are rejected',()=>{
  for(const mutate of [report=>report.views[0].stored.pop(),
    report=>{report.views[0].stored[0].sha256='0'.repeat(64);},
    report=>{report.views[0].stored[0].producer.elapsedMs=59999;},
    report=>{report.views[0].targets.rafGapsUnder500Ms=true;},
    report=>{report.fullS5Qualified=true;},report=>{report.views[0].injected++;}]){
    const report=clone();mutate(report);assert.throws(()=>validateEvidence(report));
  }
});
test('window exposure and complete input coverage both gate the visible target',()=>{
  const view=clone().views[0];Object.assign(view,{visible:true,visibleAtStart:true,hostVisibilityLost:false});
  assert.equal(assessment(view).syntheticInputTarget,true);
  view.hostVisibilityLost=true;assert.equal(assessment(view).syntheticInputTarget,null);
  view.hostVisibilityLost=false;view.hostInputUnder100Ms=null;assert.equal(assessment(view).syntheticInputTarget,null);
});

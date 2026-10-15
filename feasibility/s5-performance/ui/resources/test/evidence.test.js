'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence}=require('../check-evidence');
const initial=require('../evidence-initial.json');

test('initial exit-boundary coverage failure remains recorded without fabricated samples',()=>{
  validateEvidence(initial);
  for(const view of initial.views){
    assert.equal(view.resources.activeCoverageComplete,false);
    assert(view.resourceSamples.some(sample=>sample.phase==='flood'&&sample.processes.some(process=>process.status==='exited')));
  }
});
test('altered resource summaries, missing idle coverage and exposed process IDs are rejected',()=>{
  for(const mutate of [report=>{report.views[0].resources.activeCoverageComplete=true;},
    report=>{report.views[0].resourceSamples[0].processes[0].pid=123;},
    report=>{report.views[0].resourceSamples=[];},
    report=>{report.views[0].resources.memorySettlingQualified=true;}]){
    const report=structuredClone(initial);mutate(report);assert.throws(()=>validateEvidence(report));
  }
});

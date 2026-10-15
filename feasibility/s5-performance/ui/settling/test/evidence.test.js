'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence,assessment}=require('../check-evidence'),recorded=require('../evidence-settling.json');
test('recorded gate results, thresholds and hidden-input qualification cannot be rewritten',()=>{
  validateEvidence(recorded);
  assert.equal(assessment(recorded).exposureConfirmed,false);assert.equal(assessment(recorded).focusInputUnder100Ms,null);
  for(const mutate of [evidence=>{evidence.memoryAssessment.pass=false;},evidence=>{evidence.boundedMemorySettlingQualified=false;},
    evidence=>{evidence.memoryAssessment.criteria.maximumSlopeMiBPerMinute=100;},
    evidence=>{evidence.resources.find(sample=>sample.elapsedMs>=360000).processes.find(process=>process.role==='renderer').privateBytes+=9*1048576;}]){
    const evidence=structuredClone(recorded);mutate(evidence);assert.throws(()=>validateEvidence(evidence));
  }
});

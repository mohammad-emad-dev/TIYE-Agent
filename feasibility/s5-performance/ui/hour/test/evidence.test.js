'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence,assessment}=require('../check-evidence'),smoke=require('../evidence-smoke.json');
test('combined smoke cannot be promoted to hour or pass with altered output/feed/viewport evidence',()=>{
  validateEvidence(smoke);
  for(const mutate of [evidence=>{evidence.hourMixedWorkloadQualified=true;},evidence=>{evidence.stored[0].chain='0'.repeat(64);},
    evidence=>{evidence.feedIntegrity.count=49999;},evidence=>{evidence.searches[1].ids[0]=50000;},evidence=>{evidence.stored[0].producer.elapsedMs=89999;}]){
    const evidence=structuredClone(smoke);mutate(evidence);assert.throws(()=>validateEvidence(evidence));
  }
});
test('lost focus, missing process and hidden document remain incomplete rather than timing passes',()=>{
  const evidence=structuredClone(smoke);assert.equal(assessment(evidence).resourceActiveCoverage,true);
  evidence.resources.find(sample=>sample.phase==='mixed').processes=evidence.resources[0].processes.filter(process=>process.role!=='feed');
  assert.equal(assessment(evidence).resourceActiveCoverage,false);
  evidence.input.grid.skipped=1;assert.equal(assessment(evidence).gridInputUnder100Ms,null);
  evidence.renderer.visibilityLost=true;assert.equal(assessment(evidence).focusRafUnder500Ms,null);
});

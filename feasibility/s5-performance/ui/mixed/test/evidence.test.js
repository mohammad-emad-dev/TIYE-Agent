'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence}=require('../check-evidence'),evidence=require('../evidence.json');
test('altered database digest, hidden rows, wrong search IDs and hour promotion are refused',()=>{
  for(const mutate of [report=>{report.load.integrity.sha256='0'.repeat(64);},report=>{report.observations.search.ids[0]=1;},
    report=>{report.observations.tail.visible=false;},report=>{report.fullS5Qualified=true;},report=>{report.hourMixedWorkloadQualified=true;}]){
    const report=structuredClone(evidence);mutate(report);assert.throws(()=>validateEvidence(report));
  }
});

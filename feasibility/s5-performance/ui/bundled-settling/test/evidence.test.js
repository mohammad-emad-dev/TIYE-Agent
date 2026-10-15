'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {check}=require('../check-evidence'),{evaluateSettling}=require('../../settling/memory-gate'),{validateEvidence}=require('../../settling/check-evidence');
function capture(){return JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-settling.json'),'utf8'));}
test('bundled mixed workload preserves feed/output evidence and recomputes the unchanged memory criterion',()=>check());
test('missing retained-role data voids the tail gate instead of filtering the sample',()=>{
  const evidence=capture(),sample=evidence.resources.find(row=>row.elapsedMs>=360000&&row.elapsedMs<=480000);sample.processes=sample.processes.filter(row=>row.role!=='renderer');
  const result=evaluateSettling(evidence.resources,evidence.profile);assert.equal(result.pass,null);assert.equal(result.roles.find(row=>row.role==='renderer').reason,'missing-or-invalid-sample');
});
test('reported criterion tampering is rejected',()=>{
  const evidence=capture();evidence.memoryAssessment.criteria.maximumSlopeMiBPerMinute=100;assert.throws(()=>validateEvidence(evidence));
});
test('sustained retained-memory growth cannot become a passing bounded gate',()=>{
  const evidence=capture();for(const sample of evidence.resources)if(sample.elapsedMs>=360000&&sample.elapsedMs<=480000){const row=sample.processes.find(row=>row.role==='renderer');row.privateBytes=100*1048576+Math.round((sample.elapsedMs-360000)/60000*2*1048576);}
  const result=evaluateSettling(evidence.resources,evidence.profile);assert.equal(result.pass,false);assert.equal(result.roles.find(row=>row.role==='renderer').pass,false);
});

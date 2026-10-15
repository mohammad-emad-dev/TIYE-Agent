'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{validateRecordedEvidence}=require('../check-evidence');
test('recorded native evidence verifies while missing termination or changed raw sequence claims reject',()=>{
  const recorded=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-recovery.json')));validateRecordedEvidence(recorded);
  for(const mutate of [
    evidence=>delete evidence.terminals[0].signal,
    evidence=>delete evidence.database.killedWriter.exitCode,
    evidence=>evidence.terminals[0].records++,
    evidence=>evidence.database.expectedPrefixSha256=evidence.database.recoveredPrefix.sha256='a'.repeat(64)
  ]){const changed=structuredClone(recorded);mutate(changed);assert.throws(()=>validateRecordedEvidence(changed));}
});

'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {validateRecoveryEvidence}=require('./recovery-policy'),{sources}=require('./run'),{fixtureDigest,eventAt}=require('../mixed/fixture');
function validateRecordedEvidence(evidence){
validateRecoveryEvidence(evidence);
for(const termination of [evidence.database.killedWriter,...evidence.terminals]){
  assert(termination.exitCode===null||Number.isInteger(termination.exitCode));assert(termination.signal===null||typeof termination.signal==='string'&&termination.signal.length>0);
}
assert.equal(evidence.database.expectedFullSha256,fixtureDigest());const prefix=crypto.createHash('sha256');for(let id=1;id<=10000;id++)prefix.update(JSON.stringify(eventAt(id))+'\n');assert.equal(evidence.database.expectedPrefixSha256,prefix.digest('hex'));
assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());
for(const [name,digest]of Object.entries(evidence.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex'),digest,name);
for(const terminal of evidence.terminals){
  const bytes=fs.readFileSync(path.resolve(__dirname,'../../../../output/s5-recovery',`member-${terminal.member}-${terminal.generation}.log`));
  assert.equal(bytes.length,terminal.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),terminal.storedSha256);
  const text=bytes.toString('utf8'),sequences=[...text.matchAll(new RegExp(`REC member=${terminal.member} generation=${terminal.generation} seq=(\\d+)`,'g'))].map(match=>Number(match[1]));
  assert.equal(sequences.length,terminal.records);assert.equal(sequences.every((sequence,index)=>sequence===index),terminal.ordered);
  assert.equal(text.includes(`END member=${terminal.member} generation=${terminal.generation}`),terminal.ended);
}
}
if(require.main===module){validateRecordedEvidence(JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-recovery.json'))));
for(const folder of ['failed-attempt','failed-attempt-2']){
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,folder,'manifest.json')));assert.equal(manifest.successEvidenceWritten,false);assert.equal(manifest.runtimeRetained,true);
  for(const mapping of Object.values(manifest.sources)){assert.equal(path.basename(mapping.snapshot),mapping.snapshot);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,folder,mapping.snapshot))).digest('hex'),mapping.sha256);}
}
console.log('Verified: committed-prefix recovery, FTS rollback/resume, four PTY survivors, replacement generation, owned exit/cleanup and measured source hashes');
}
module.exports={validateRecordedEvidence};

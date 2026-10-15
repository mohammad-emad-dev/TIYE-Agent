'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{analyzeFailure}=require('./failure-analysis');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),publicRoot=path.resolve(__dirname,'../../../../output/s5-interaction');
function jsonLines(bytes){return bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);}
function check(){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'failure-evidence.json')));assert.equal(evidence.schema,'tiye-s5-interaction-failure-v1');assert.equal(evidence.exitCode,1);assert.equal(evidence.completedCohorts,0);
  for(const field of ['successEvidenceWritten','resizeScrollQualified','fullS5Qualified','productionEligible','coreProcessPresent','physicalWheelQualified','physicalPaintQualified','ownedCleanup','originalChunkJournalAvailable'])assert.equal(evidence[field],false);
  assert.equal(evidence.providerRequests,0);assert.equal(evidence.runtimeRetained,true);
  for(const [name,expected]of Object.entries(evidence.artifactHashes)){assert.equal(path.basename(name),name);const bytes=fs.readFileSync(path.join(publicRoot,name));assert.equal(bytes.length,expected.bytes);assert.equal(hash(bytes),expected.sha256,name);}
  const native=JSON.parse(fs.readFileSync(path.join(publicRoot,'failure.json'))),expected=Array.from({length:5},(_,member)=>jsonLines(fs.readFileSync(path.join(publicRoot,`expected-${member}.jsonl`))));
  const outcomes=analyzeFailure(native,expected);assert(outcomes.every(outcome=>!outcome.contentMatches&&outcome.missing.length===2&&outcome.altered.length>0));
  outcomes.forEach(outcome=>{const bytes=fs.readFileSync(path.join(publicRoot,`member-${outcome.member}.log`));assert.equal(bytes.length,native.lastObservation.top[outcome.member].bytes);
    outcome.missing.forEach(sequence=>assert(bytes.toString('utf8').includes(`REC m=${outcome.member} n=${String(sequence).padStart(4,'0')}`)));
  });
  for(let member=0;member<5;member++){const controls=jsonLines(fs.readFileSync(path.join(publicRoot,`control-${member}.jsonl`))),size=controls.filter(row=>row.kind==='size'&&row.token===1).at(-1);assert.equal(size.cols,60);assert.equal(size.rows,16);}
  for(const directory of ['failed-attempt','failed-attempt-2']){const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,directory,'manifest.json')));assert.equal(manifest.successEvidenceWritten,false);assert.equal(manifest.runtimeRetained,true);
    for(const mapping of Object.values(manifest.sources)){assert.equal(path.basename(mapping.snapshot),mapping.snapshot);assert.equal(hash(fs.readFileSync(path.join(__dirname,directory,mapping.snapshot))),mapping.sha256);}
    for(const [name,expected]of Object.entries(manifest.observations||{}))assert.equal(hash(fs.readFileSync(path.join(__dirname,directory,name))),expected.sha256);
  }
  const latest=JSON.parse(fs.readFileSync(path.join(__dirname,'failed-attempt-2/manifest.json')));
  for(const [name,mapping]of Object.entries(latest.sources))if(!name.startsWith('dist/')||process.argv.includes('--runtime'))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),mapping.sha256,name);
  console.log('Verified preserved FAILED interaction observation; resize/scroll qualification remains false '+JSON.stringify(outcomes));
}
if(require.main===module)check();
module.exports={check};

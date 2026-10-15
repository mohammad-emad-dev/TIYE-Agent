'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{analyzeFailure}=require('../interaction/failure-analysis');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),publicRoot=path.resolve(__dirname,'../../../../output/s5-interaction-windows');
function check(){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'failure-evidence.json'))),native=JSON.parse(fs.readFileSync(path.join(publicRoot,'failure.json')));
  assert.equal(evidence.exitCode,1);assert.equal(evidence.comparisonEligible,true);assert.equal(evidence.sameFixtureBytes,true);assert.equal(evidence.windowsPty.backend,'conpty');assert(Number.isInteger(evidence.windowsPty.buildNumber)&&evidence.windowsPty.buildNumber>=21376);
  for(const field of ['resizeScrollQualified','fullS5Qualified','productionEligible','coreProcessPresent','physicalWheelQualified','physicalPaintQualified','ownedCleanup'])assert.equal(evidence[field],false);
  native.lastObservation.top.forEach(snapshot=>assert.deepEqual(snapshot.windowsPty,evidence.windowsPty));
  assert(fs.readFileSync(path.join(__dirname,'fixture.js')).equals(fs.readFileSync(path.join(__dirname,'../interaction/fixture.js'))));
  const expected=Array.from({length:5},(_,member)=>fs.readFileSync(path.join(publicRoot,`expected-${member}.jsonl`),'utf8').trim().split('\n').map(JSON.parse)),outcomes=analyzeFailure(native,expected);
  assert.deepEqual(outcomes,evidence.outcomes);assert(outcomes.every(outcome=>outcome.contentMatches===false&&outcome.missing.length>0&&outcome.altered.length>0));
  for(const [folder,output]of [['failed-attempt',publicRoot],['invalid-copy-attempt',path.resolve(__dirname,'../../../../output/s5-interaction-diagnostics/invalid-copy')]]){
    const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,folder,'manifest.json')));assert.equal(manifest.exitCode,1);assert.equal(manifest.successEvidenceWritten,false);assert.equal(manifest.runtimeRetained,true);
    assert.equal(manifest.comparisonEligible,folder==='failed-attempt');
    for(const [name,mapping]of Object.entries(manifest.sources)){assert.equal(path.basename(mapping.snapshot),mapping.snapshot);const bytes=fs.readFileSync(path.join(__dirname,folder,mapping.snapshot));assert.equal(hash(bytes),mapping.sha256);
      if(folder==='failed-attempt'&&(!name.startsWith('dist/')||process.argv.includes('--runtime')))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),mapping.sha256,name);
    }
    for(const [name,expected]of Object.entries(manifest.artifacts)){assert.equal(path.basename(name),name);const bytes=fs.readFileSync(path.join(output,name));assert.equal(bytes.length,expected.bytes);assert.equal(hash(bytes),expected.sha256);}
  }
  console.log('Verified FAILED Windows-PTY option comparison with identical UTF-8 fixture; invalid-copy attempt excluded '+JSON.stringify(outcomes.map(({member,missing,altered})=>({member,missing,altered}))));
}
if(require.main===module)check();
module.exports={check};

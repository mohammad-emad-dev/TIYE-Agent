'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validateRecoveryEvidence}=require('../recovery/recovery-policy'),{loadedBackend}=require('../bundled-recovery/check-evidence'),{sources,binaries}=require('./run');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function check(runtime=false){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-recovery.json'),'utf8')),root=path.resolve(__dirname,'../../../../output/s5-bundled-faults');validateRecoveryEvidence(evidence);
  const prelaunch=JSON.parse(fs.readFileSync(path.join(root,'prelaunch.json'),'utf8'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.backendBinaryHashes,evidence.backendBinaryHashes);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.backendBinaryHashes).sort(),binaries.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(runtime?evidence.backendBinaryHashes:{})}))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  for(const terminal of evidence.terminals){
    const suffix=terminal.member+'-'+terminal.generation,bytes=fs.readFileSync(path.join(root,'member-'+suffix+'.log'));assert.equal(hash(bytes),terminal.storedSha256);assert.equal(hash(bytes),terminal.captureSha256);assert.equal(bytes.length,terminal.bytes);loadedBackend(path.join(root,'backend-'+suffix+'.json'));
    const sequences=Array.from(bytes.toString('utf8').matchAll(new RegExp(`REC member=${terminal.member} generation=${terminal.generation} seq=(\\d+)`,'g')),match=>Number(match[1]));assert.deepEqual(sequences,Array.from({length:terminal.records},(_,index)=>index));
    assert.equal(bytes.toString('utf8').includes(`END member=${terminal.member} generation=${terminal.generation}`),terminal.ended);
  }
  const failed=JSON.parse(fs.readFileSync(path.join(__dirname,'failed-attempt/manifest.json'),'utf8'));assert.equal(failed.completed,false);assert.equal(failed.nativeStructuredResultPersisted,false);assert.equal(failed.recoveryQualified,false);
  for(const {filename,sha256}of Object.values(failed.sourceSnapshots))assert.equal(hash(fs.readFileSync(path.join(__dirname,'failed-attempt',filename))),sha256);
  for(const [name,digest]of Object.entries(failed.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,'../s5-bundled-faults-attempt-1',name))),digest);
  const previous=fs.readFileSync(path.join(__dirname,'failed-attempt',failed.sourceSnapshots['run.js'].filename),'utf8');
  assert.equal(previous.replace("schema:'tiye-s5-bundled-faults-v1'","schema:'tiye-s5-recovery-v1'"),fs.readFileSync(path.join(__dirname,'run.js'),'utf8'));
  return {databaseProcessFaultQualified:true,workerIsolationQualified:true,roles:evidence.ownedProcessChecks.length,victimRecords:evidence.terminals.find(row=>row.role==='victim').records,ownedRuntimeCleanup:true,wholeProcessTreeCleanupQualified:false,fullS5Qualified:false};
}
if(require.main===module)console.log(JSON.stringify(check(process.argv.includes('--runtime'))));
module.exports={check};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {validateEvidence,assessment}=require('../settling/check-evidence'),{evaluateSettling,criteria}=require('../settling/memory-gate'),{loadedBackend}=require('../bundled-recovery/check-evidence'),{sources,builds}=require('./run');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function check(runtime=false){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-settling.json'),'utf8')),root=path.resolve(__dirname,'../../../../output/s5-bundled-settling');
  validateEvidence(evidence);assert.deepEqual(evidence.memoryAssessment,evaluateSettling(evidence.resources,evidence.profile));assert.deepEqual(evidence.memoryAssessment.criteria,criteria);
  assert.equal(evidence.memoryAssessment.windowStartMs,360000);assert.equal(evidence.memoryAssessment.windowEndMs,480000);
  assert(fs.readFileSync(path.join(__dirname,'profiles.js')).equals(fs.readFileSync(path.join(__dirname,'../settling/profiles.js'))));
  const prelaunch=JSON.parse(fs.readFileSync(path.join(root,'prelaunch.json'),'utf8'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(runtime?evidence.buildHashes:{})}))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  for(const [name,artifact]of Object.entries(evidence.artifacts)){
    const bytes=fs.readFileSync(path.join(root,name));assert.equal(hash(bytes),artifact.sha256,name);assert(['gzip','identity'].includes(artifact.encoding));const decoded=artifact.encoding==='gzip'?zlib.gunzipSync(bytes):bytes;assert.equal(hash(decoded),artifact.decodedSha256);assert.equal(decoded.length,artifact.decodedBytes);
  }
  for(let member=0;member<5;member++){
    loadedBackend(path.join(root,`backend-${member}.json`));const bytes=zlib.gunzipSync(fs.readFileSync(path.join(root,`member-${member}.log.gz`)));assert.equal(hash(bytes),evidence.stored[member].sha256);assert.equal(bytes.length,evidence.stored[member].bytes);
  }
  const targets=assessment(evidence);assert.equal(targets.resourceActiveCoverage,true);assert.equal(targets.resourceIdleCoverage,true);
  return {elapsedMs:evidence.elapsedMs,searches:evidence.searches.length,decodedBytes:evidence.stored.reduce((sum,member)=>sum+member.bytes,0),targets,memory:evidence.memoryAssessment,
    boundedMemorySettlingQualified:evidence.boundedMemorySettlingQualified,hourMixedWorkloadQualified:false,fullS5Qualified:false};
}
if(require.main===module)console.log(JSON.stringify(check(process.argv.includes('--runtime'))));
module.exports={check};

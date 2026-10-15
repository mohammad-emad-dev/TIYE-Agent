'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validateEvidence}=require('../renderer-recovery/evidence-policy'),{sources,builds}=require('./run');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function loadedBackend(filename){
  const backend=JSON.parse(fs.readFileSync(filename,'utf8'));assert.equal(backend.useConptyDll,true);assert(Number.isInteger(backend.workerPid)&&backend.workerPid>0);assert.equal(backend.modules.length,1);
  assert.equal(backend.modules[0].name.toLowerCase(),'conpty.dll');assert(backend.modules[0].filename.replaceAll('\\','/').toLowerCase().endsWith('/node-pty/prebuilds/win32-x64/conpty/conpty.dll'));
}
function check(runtime=false){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-renderer.json'),'utf8')),root=path.resolve(__dirname,'../../../../output/s5-bundled-recovery');
  const journal=JSON.parse(fs.readFileSync(path.join(root,'journal.json'),'utf8')),logs=validateEvidence(evidence,journal);
  logs.forEach((bytes,member)=>{assert(bytes.equals(fs.readFileSync(path.join(root,`member-${member}.log`))));loadedBackend(path.join(root,`backend-${member}.json`));});
  const prelaunch=JSON.parse(fs.readFileSync(path.join(root,'prelaunch.json'),'utf8'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(runtime?evidence.buildHashes:{})}))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  return {rendererRecoveryQualified:true,persistentRoles:evidence.survivingRoles.length,recordsPerMember:600,feedEvents:50000,restoredMs:evidence.restoredMs,ownedRuntimeCleanup:true,wholeProcessTreeCleanupQualified:false,fullS5Qualified:false};
}
if(require.main===module)console.log(JSON.stringify(check(process.argv.includes('--runtime'))));
module.exports={check,loadedBackend};

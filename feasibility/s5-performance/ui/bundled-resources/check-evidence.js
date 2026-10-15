'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {summarize,requiredRoles}=require('../resources/resource-metrics'),{distribution,evaluateTargets}=require('../flood/metrics'),{assessment}=require('../flood/check-evidence');
const {loadedBackend}=require('../bundled-recovery/check-evidence'),{sources,builds}=require('./run');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateView(view){
  assert.equal(view.coreProcessPresent,false);assert.equal(view.outputIntegrity,true);assert.equal(view.fullS5Qualified,false);assert.equal(view.productionEligible,false);assert(view.pilotElapsedMs>=120000);
  assert.deepEqual(view.resources,summarize(view.resourceSamples));assert.equal(view.resources.activeCoverageComplete,true);assert.equal(view.resources.idleCoverageComplete,true);
  let previous=-1;
  for(const sample of view.resourceSamples){
    assert(sample.elapsedMs>previous);previous=sample.elapsedMs;assert(Number.isFinite(sample.collectionMs)&&sample.collectionMs>=0);
    assert(['flood','transition','idle'].includes(sample.phase));const roles=new Set();
    for(const row of sample.processes){assert(!('pid'in row)&&!('identity'in row));assert(!roles.has(row.role));roles.add(row.role);assert(['present','exited','unavailable','identity-changed'].includes(row.status));if(row.status==='present')for(const field of ['sampledAtMs','cpuMs','workingSetBytes','privateBytes'])assert(Number.isFinite(row[field])&&row[field]>=0);}
    if(sample.phase==='flood'){assert(sample.elapsedMs+sample.collectionMs<60000);for(const role of requiredRoles)assert(sample.processes.some(row=>row.role===role&&row.status==='present'));}
    if(sample.phase==='idle'){assert(sample.elapsedMs>=65000);for(const role of ['main','renderer'])assert(sample.processes.some(row=>row.role===role&&row.status==='present'));}
    if(sample.elapsedMs+sample.collectionMs>=60000&&sample.elapsedMs<65000)assert.equal(sample.phase,'transition');
  }
  assert.deepEqual(view.targets,evaluateTargets(view));assert.deepEqual(view.hostDispatchToRenderAck,distribution(view.hostLatencies));assert.deepEqual(view.renderer.frameSummary,distribution(view.renderer.frameGaps));assert.deepEqual(view.renderer.inputSummary,distribution(view.renderer.inputLatencies));
  assert.equal(view.plannedInputs,view.focusSkipped+view.injected);assert(view.inputRequests<=view.injected);assert(view.hostLatencies.length<=view.inputRequests);assert.equal(view.renderer.inputEvents,view.inputRequests);assert.equal(view.renderer.inputEvents,view.renderer.inputLatencies.length+view.renderer.missingInputs);
  const complete=view.hostLatencies.length===view.injected&&view.injected===view.plannedInputs&&view.focusSkipped===0;assert.equal(view.hostInputCoverageComplete,complete);assert.equal(view.hostInputUnder100Ms,complete&&view.hostDispatchToRenderAck?view.hostDispatchToRenderAck.maxMs<100:null);
  return {view:view.view,elapsedMs:view.pilotElapsedMs,activeCoverage:true,idleCoverage:true,...assessment(view)};
}
function check(runtime=false){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence.json'),'utf8')),root=path.resolve(__dirname,'../../../../output/s5-bundled-resources');
  assert.equal(evidence.completed,true);assert.equal(evidence.unchanged,true);assert.equal(evidence.ownedCleanup,false);assert.equal(evidence.fullS5Qualified,false);assert.equal(evidence.productionEligible,false);
  assert.deepEqual(evidence.outcomes.map(row=>row.view),['grid','focus']);evidence.outcomes.forEach(row=>{assert.equal(row.code,0);assert.equal(row.timedOut,false);});
  const prelaunch=JSON.parse(fs.readFileSync(path.join(root,'prelaunch.json'),'utf8'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(runtime?evidence.buildHashes:{})}))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  for(const [name,artifact]of Object.entries(evidence.artifacts)){const bytes=fs.readFileSync(path.join(root,name));assert.equal(hash(bytes),artifact.sha256,name);const decoded=artifact.encoding==='gzip'?zlib.gunzipSync(bytes):bytes;assert.equal(hash(decoded),artifact.decodedSha256);assert.equal(decoded.length,artifact.decodedBytes);}
  const summaries=[];
  for(const viewName of ['grid','focus']){
    const view=JSON.parse(fs.readFileSync(path.join(root,viewName+'-result.json'),'utf8'));assert.equal(view.view,viewName);summaries.push(validateView(view));
    assert.deepEqual(view.stored.map(row=>row.member),[0,1,2,3,4]);assert.equal(view.renderer.members.length,5);
    for(const [member,stored]of view.stored.entries()){
      loadedBackend(path.join(root,`${viewName}-backend-${member}.json`));assert.equal(stored.workerExit,0);assert.equal(stored.terminalExit,0);assert(stored.producer.elapsedMs>=60000);assert(stored.producer.records>0);
      const decoded=zlib.gunzipSync(fs.readFileSync(path.join(root,`${viewName}-${member}.log.gz`)));assert.equal(hash(decoded),stored.sha256);assert.equal(decoded.length,stored.bytes);
      for(const field of ['member','bytes','chunks','sha256'])assert.equal(stored[field],view.renderer.members[member][field]);
    }
  }
  return summaries;
}
if(require.main===module)console.log(JSON.stringify(check(process.argv.includes('--runtime'))));
module.exports={check,validateView};

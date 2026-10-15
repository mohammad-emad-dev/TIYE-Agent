'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {distribution,evaluateTargets}=require('./metrics');
const sources=['metrics.js','producer.cjs','worker.cjs','preload.cjs','renderer.js','index.html','build.js','main.cjs','run.js','../worker-channel.js','../protocol.js','../toolchain.js'];
const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function verifyMember(stored,rendered){
  assert(Number.isInteger(stored.bytes)&&stored.bytes>0);assert(Number.isInteger(stored.chunks)&&stored.chunks>0);
  assert.match(stored.sha256,/^[a-f0-9]{64}$/);
  for(const field of ['member','bytes','chunks','sha256'])assert.equal(stored[field],rendered[field],field);
  assert.equal(stored.workerExit,0);assert.equal(stored.terminalExit,0);
  assert(Number.isInteger(stored.producer.records)&&stored.producer.records>0);
  assert(Number.isFinite(stored.producer.elapsedMs)&&stored.producer.elapsedMs>=60000);
  assert(Number.isInteger(stored.pauseCount)&&stored.pauseCount>=0);
}
function verifyView(view){
  assert.equal(typeof view.visible,'boolean');assert.equal(typeof view.renderer.visibilityLost,'boolean');
  assert.equal(view.outputIntegrity,true);assert.equal(view.hardwareAcceleration,false);
  assert.equal(view.fullS5Qualified,false);assert.equal(view.productionEligible,false);
  assert.deepEqual(view.stored.map(member=>member.member),[0,1,2,3,4]);
  assert.deepEqual(view.renderer.members.map(member=>member.member),[0,1,2,3,4]);
  view.stored.forEach((stored,index)=>verifyMember(stored,view.renderer.members[index]));
  for(const field of ['plannedInputs','focusSkipped','injected','inputRequests'])assert(Number.isInteger(view[field])&&view[field]>=0);
  assert.equal(view.plannedInputs,view.focusSkipped+view.injected);assert(view.inputRequests<=view.injected);
  assert(view.hostLatencies.length<=view.inputRequests);assert.equal(view.renderer.inputEvents,view.inputRequests);
  assert.equal(view.renderer.inputEvents,view.renderer.inputLatencies.length+view.renderer.missingInputs);
  for(const samples of [view.renderer.inputLatencies,view.hostLatencies])assert(samples.every(sample=>Number.isFinite(sample)&&sample>=0));
  assert(view.renderer.frameGaps.every(Number.isFinite));
  assert.deepEqual(view.targets,evaluateTargets(view));
  assert.deepEqual(view.renderer.frameSummary,distribution(view.renderer.frameGaps));
  assert.deepEqual(view.renderer.inputSummary,distribution(view.renderer.inputLatencies));
  assert.deepEqual(view.hostDispatchToRenderAck,distribution(view.hostLatencies));
  const complete=view.hostLatencies.length===view.injected&&view.injected===view.plannedInputs&&view.focusSkipped===0;
  assert.equal(view.hostInputCoverageComplete,complete);
  assert.equal(view.hostInputUnder100Ms,complete&&view.hostDispatchToRenderAck?view.hostDispatchToRenderAck.maxMs<100:null);
}
// A visible document alone did not prove native window exposure in the initial run.
function assessment(view){
  const exposure=view.visible===true&&view.visibleAtStart===true&&view.hostVisibilityLost===false&&!view.renderer.visibilityLost;
  return {exposureConfirmed:exposure,syntheticInputTarget:exposure?view.hostInputUnder100Ms:null,
    rafGapTarget:exposure?view.targets.rafGapsUnder500Ms:null,fullS5Qualified:false,productionEligible:false};
}
function validateEvidence(evidence){
  assert.equal(evidence.schema,'tiye-s5-visible-flood-v1');assert.equal(evidence.platform,'win32');
  assert.equal(evidence.ownedCleanup,true);assert.equal(evidence.providerRequests,0);
  assert.equal(evidence.fullS5Qualified,false);assert.equal(evidence.productionEligible,false);
  assert.deepEqual(evidence.views.map(view=>view.view),['grid','focus']);evidence.views.forEach(verifyView);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());
  assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const hash of [...Object.values(evidence.sourceHashes),...Object.values(evidence.buildHashes)])assert.match(hash,/^[a-f0-9]{64}$/);
}
function checkFiles(){
  for(const name of ['evidence-initial.json','evidence.json']){
    const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,name)));validateEvidence(evidence);
    for(const [source,hash]of Object.entries(evidence.sourceHashes)){
      const snapshot=name==='evidence-initial.json'&&['main.cjs','renderer.js','run.js'].includes(source);
      assert.equal(digest(fs.readFileSync(path.join(__dirname,snapshot?'snapshots/'+source:source))),hash,name+':'+source);
    }
    if(name==='evidence.json'&&process.argv.includes('--runtime'))for(const [build,hash]of Object.entries(evidence.buildHashes))assert.equal(digest(fs.readFileSync(path.join(__dirname,build))),hash,build);
    console.log(name,JSON.stringify(evidence.views.map(view=>({view:view.view,...assessment(view)}))));
  }
}
if(require.main===module)checkFiles();
module.exports={validateEvidence,assessment};

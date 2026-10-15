'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validateEvidence:validateFlood,assessment}=require('../flood/check-evidence');
const {summarize}=require('./resource-metrics');
const sources=['worker.cjs','renderer.js','build.js','main.cjs','run.js','sampler.js','sample-processes.ps1','resource-metrics.js','../flood/metrics.js','../flood/producer.cjs','../flood/preload.cjs','../flood/index.html','../worker-channel.js','../protocol.js','../toolchain.js'];
const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function verifySamples(view){
  assert(Number.isFinite(view.pilotElapsedMs)&&view.pilotElapsedMs>=120000);
  assert.equal(view.coreProcessPresent,false);assert(view.resourceSamples.length>=16);
  let previous=-1;
  for(const sample of view.resourceSamples){
    assert(sample.elapsedMs>=0&&sample.elapsedMs>previous);previous=sample.elapsedMs;
    assert(['flood','transition','idle'].includes(sample.phase));assert(Number.isFinite(sample.collectionMs)&&sample.collectionMs>=0);
    const roles=new Set();
    for(const process of sample.processes){
      assert(!('pid' in process)&&!('identity' in process));assert.equal(typeof process.role,'string');assert(!roles.has(process.role));roles.add(process.role);
      assert(['present','exited','unavailable','identity-changed'].includes(process.status));
      if(process.status==='present')for(const field of ['sampledAtMs','cpuMs','workingSetBytes','privateBytes'])assert(Number.isFinite(process[field])&&process[field]>=0);
    }
  }
  assert.deepEqual(view.resources,summarize(view.resourceSamples));
  if(view.resources.idleCoverageComplete)for(const sample of view.resourceSamples.filter(sample=>sample.phase==='idle')){
    for(const role of ['main','renderer'])assert(sample.processes.some(process=>process.role===role&&process.status==='present'));
  }
}
function validateEvidence(evidence){
  assert.equal(evidence.schema,'tiye-s5-resource-pilot-v1');
  // The inherited flood contract is checked using its own schema and hash-key inventory.
  const previous=require('../flood/evidence.json');
  validateFlood({...evidence,schema:previous.schema,sourceHashes:previous.sourceHashes});
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());
  assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const digest of [...Object.values(evidence.sourceHashes),...Object.values(evidence.buildHashes)])assert.match(digest,/^[a-f0-9]{64}$/);
  evidence.views.forEach(verifySamples);
}
function checkFiles(){
  for(const name of ['evidence-initial.json','evidence.json']){
    const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,name)));validateEvidence(evidence);
    if(name==='evidence.json')for(const view of evidence.views)for(const sample of view.resourceSamples){
      if(sample.phase==='flood')assert(sample.elapsedMs+sample.collectionMs<60000);
      if(sample.phase==='idle')assert(sample.elapsedMs>=65000);
      if(sample.elapsedMs+sample.collectionMs>=60000&&sample.elapsedMs<65000)assert.equal(sample.phase,'transition');
    }
    for(const [source,digest]of Object.entries(evidence.sourceHashes)){
      const resolved=name==='evidence-initial.json'&&source==='main.cjs'?'snapshots/main-initial.cjs':source;
      assert.equal(hash(fs.readFileSync(path.join(__dirname,resolved))),digest,name+':'+source);
    }
    if(name==='evidence.json'&&process.argv.includes('--runtime'))for(const [build,digest]of Object.entries(evidence.buildHashes))assert.equal(hash(fs.readFileSync(path.join(__dirname,build))),digest,build);
    console.log(name,JSON.stringify(evidence.views.map(view=>({view:view.view,samples:view.resourceSamples.length,activeCoverage:view.resources.activeCoverageComplete,idleCoverage:view.resources.idleCoverageComplete,...assessment(view)}))));
  }
}
if(require.main===module)checkFiles();
module.exports={validateEvidence};

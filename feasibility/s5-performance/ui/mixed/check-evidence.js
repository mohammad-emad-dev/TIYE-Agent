'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {EVENT_COUNT,eventAt,fixtureDigest}=require('./fixture'),{sourceNames,buildNames}=require('./run');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifyPage(page,expected,total){
  assert.deepEqual(page.ids,expected);assert.equal(page.total,total);assert.equal(page.domRows,expected.length);
  assert.equal(page.visible,expected.length>0);assert.equal(page.documentVisible,true);
  for(const name of ['queryMs','requestToRafMs'])assert(Number.isFinite(page[name])&&page[name]>=0);
  assert.equal(page.renderedText.length,expected.length);
  expected.forEach((id,index)=>assert(page.renderedText[index].endsWith(eventAt(id).text)));
}
function validateEvidence(evidence){
  assert.equal(evidence.schema,'tiye-s5-feed-native-v1');assert.equal(evidence.platform,'win32');assert.equal(evidence.ownedCleanup,true);
  for(const name of ['combinedPtyWorkload','hourMixedWorkloadQualified','memorySettlingQualified','fullS5Qualified','productionEligible'])assert.equal(evidence[name],false);
  assert.equal(evidence.providerRequests,0);assert.equal(evidence.visibleAtStart,true);assert.equal(evidence.visibleAtEnd,true);
  assert.deepEqual(evidence.load.integrity,{count:EVENT_COUNT,sha256:fixtureDigest(),sqlite:'ok',fts:'ok'});assert.equal(evidence.load.reopened,true);
  assert(Number.isFinite(evidence.load.insertedMs)&&evidence.load.insertedMs>=0);assert.equal(evidence.load.batchLatencies.length,50);
  assert(evidence.load.batchLatencies.every(latency=>Number.isFinite(latency)&&latency>=0));
  const first=Array.from({length:20},(_,index)=>index+1),observed=evidence.observations;
  verifyPage(observed.baseline,first,EVENT_COUNT);verifyPage(observed.tail,Array.from({length:20},(_,index)=>EVENT_COUNT-19+index),EVENT_COUNT);
  verifyPage(observed.search,Array.from({length:20},(_,index)=>(index+1)*997),50);verifyPage(observed.empty,[],0);verifyPage(observed.restored,first,EVENT_COUNT);
  if(observed.concurrentFinal){verifyPage(observed.concurrentFinal,first,EVENT_COUNT);assert.equal(observed.coalescedRequests,2);assert.equal(observed.observations,6);}else assert.equal(observed.observations,5);
}
function checkFiles(){
  for(const name of ['evidence-initial.json','evidence.json']){
    const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,name)));validateEvidence(evidence);
    const expectedSources=name==='evidence-initial.json'?sourceNames.filter(source=>source!=='protocol.js'):sourceNames;
    assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),expectedSources.slice().sort());
    assert.deepEqual(Object.keys(evidence.buildHashes).sort(),buildNames.slice().sort());
    for(const [source,hash]of Object.entries(evidence.sourceHashes)){
      const resolved=name==='evidence-initial.json'&&!source.startsWith('../')?'snapshots/'+source:source;
      assert.equal(digest(fs.readFileSync(path.join(__dirname,resolved))),hash,name+':'+source);
    }
    for(const [build,hash]of Object.entries(evidence.buildHashes)){
      assert.match(hash,/^[a-f0-9]{64}$/);
      if(name==='evidence.json'&&process.argv.includes('--runtime'))assert.equal(digest(fs.readFileSync(path.join(__dirname,build))),hash,build);
    }
    if(name==='evidence.json'){assert.equal(evidence.load.journalMode,'wal');assert(evidence.observations.concurrentFinal);}
    console.log(name+': 50,000 persisted rows, exact search IDs, bounded native viewport; hour unqualified');
  }
}
if(require.main===module)checkFiles();
module.exports={validateEvidence};

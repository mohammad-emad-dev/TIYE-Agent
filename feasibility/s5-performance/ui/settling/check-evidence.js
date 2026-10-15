'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {evaluateSettling}=require('./memory-gate');
const {profileFor}=require('./profiles'),{fixtureDigest,EVENT_COUNT}=require('../mixed/fixture'),{distribution}=require('../flood/metrics'),{roleSeries}=require('../resources/resource-metrics'),{sources,builds}=require('./run');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateEvidence(evidence){
  assert.equal(evidence.schema,'tiye-s5-combined-v1');assert.deepEqual(evidence.profile,profileFor(evidence.profile.name));
  assert.deepEqual(evidence.memoryAssessment,evaluateSettling(evidence.resources,evidence.profile));assert.equal(evidence.boundedMemorySettlingQualified,evidence.memoryAssessment.pass===true);
  const profile=evidence.profile;assert(Number.isFinite(evidence.elapsedMs)&&evidence.elapsedMs>=profile.mixedMs+profile.idleMs);assert.equal(evidence.combinedPtyWorkload,true);
  for(const flag of ['coreProcessPresent','memorySettlingQualified','fullS5Qualified','productionEligible'])assert.equal(evidence[flag],false);
  assert.equal(evidence.providerRequests,0);assert.equal(evidence.ownedCleanup,true);assert.equal(evidence.outputIntegrity,true);assert.equal(evidence.platform,'win32');
  assert.equal(evidence.hourMixedWorkloadQualified,profile.name==='hour');assert.equal(evidence.feedInfo.journalMode,'wal');assert.equal(evidence.feedInfo.count,0);
  assert.deepEqual(evidence.feedIntegrity,{count:EVENT_COUNT,sha256:fixtureDigest(),sqlite:'ok',fts:'ok',reopened:true});
  assert.deepEqual(evidence.stored.map(member=>member.member),[0,1,2,3,4]);assert.deepEqual(evidence.renderer.members.map(member=>member.member),[0,1,2,3,4]);
  evidence.stored.forEach((member,index)=>{
    assert.equal(member.workerExit,0);assert.equal(member.terminalExit,0);assert(member.producer.elapsedMs>=profile.mixedMs);assert(member.producer.records>0);
    assert.match(member.sha256,/^[a-f0-9]{64}$/);assert.match(member.chain,/^[a-f0-9]{64}$/);assert(member.bytes>0&&member.chunks>0);
    for(const field of ['member','bytes','chunks','chain'])assert.equal(member[field],evidence.renderer.members[index][field]);
  });
  let previous=-1,previousCount=-1;
  for(const entry of evidence.ingestion){assert(entry.elapsedMs>previous&&entry.count>=previousCount&&entry.count<=EVENT_COUNT);assert(Number.isFinite(entry.appendMs)&&entry.appendMs>=0);previous=entry.elapsedMs;previousCount=entry.count;}
  assert.equal(previousCount,EVENT_COUNT);assert(evidence.ingestion.length>profile.mixedMs/2000);assert(evidence.ingestion[0].count<EVENT_COUNT);assert(evidence.ingestion.at(-1).elapsedMs>=profile.mixedMs);
  for(const search of evidence.searches){
    assert(['grid','focus'].includes(search.view));assert(['needle','','absenttoken'].includes(search.query));assert(search.domRows<=20&&search.domRows===search.ids.length);
    assert.equal(search.total,search.query==='needle'?Math.floor(search.count/997):search.query===''?search.count:0);
    const ids=search.query==='needle'?Array.from({length:Math.min(20,search.total)},(_,index)=>(index+1)*997):search.query===''?Array.from({length:Math.min(20,search.count)},(_,index)=>Math.max(1,search.count-19)+index):[];
    assert.deepEqual(search.ids,ids);for(const field of ['queryMs','requestToRafMs'])assert(Number.isFinite(search[field])&&search[field]>=0);
  }
  assert(evidence.searches.length>profile.mixedMs/10000);assert(evidence.views.length>=Math.floor(profile.mixedMs/profile.viewMs));
  evidence.views.forEach((entry,index)=>assert.equal(entry.view,index%2===0?'grid':'focus'));
  for(const view of ['grid','focus']){
    const input=evidence.input[view];assert(Number.isInteger(input.planned)&&input.planned>0&&Number.isInteger(input.skipped)&&input.skipped>=0);
    assert(input.latencies.every(latency=>Number.isFinite(latency)&&latency>=0));assert(input.planned>=input.skipped+input.latencies.length);assert.deepEqual(evidence.metrics[view].input,distribution(input.latencies));
    assert.deepEqual(evidence.metrics[view].frames,distribution(evidence.renderer.frames[view]));assert(evidence.renderer.frames[view].length>100);
    assert(evidence.searches.some(search=>search.view===view));
  }
  assert.equal(evidence.input.grid.planned+evidence.input.focus.planned-evidence.input.grid.skipped-evidence.input.focus.skipped,evidence.injected);
  assert.equal(evidence.renderer.inputEvents,evidence.inputRequests);assert(evidence.inputRequests<=evidence.injected);
  assert.equal(evidence.input.grid.latencies.length+evidence.input.focus.latencies.length+evidence.missingHostAcks,evidence.injected);
  assert.deepEqual(evidence.metrics.searchDb,distribution(evidence.searches.map(search=>search.queryMs)));assert.deepEqual(evidence.metrics.searchRaf,distribution(evidence.searches.map(search=>search.requestToRafMs)));
  assert(evidence.resources.length>profile.mixedMs/20000);
  for(const sample of evidence.resources){assert(['mixed','idle','transition'].includes(sample.phase));assert(sample.elapsedMs>=0&&sample.collectionMs>=0);
    const roles=new Set();for(const process of sample.processes){assert(!('pid' in process)&&!('identity' in process));assert(!roles.has(process.role));roles.add(process.role);assert(['present','exited','unavailable','identity-changed'].includes(process.status));
      if(process.status==='present')for(const field of ['sampledAtMs','cpuMs','workingSetBytes','privateBytes'])assert(Number.isFinite(process[field])&&process[field]>=0);
    }
  }
  for(const role of evidence.metrics.resourceRoles)assert.deepEqual(role.series,roleSeries(evidence.resources,role.role));
}
function assessment(evidence){
  const exposed=evidence.visibleAtStart&&evidence.visibleAtEnd&&!evidence.visibilityLost&&!evidence.renderer.visibilityLost&&evidence.searches.every(search=>search.documentVisible);
  const required=['main','renderer','feed',...Array.from({length:5},(_,member)=>'worker-'+member),...Array.from({length:5},(_,member)=>'producer-'+member)];
  const active=evidence.resources.filter(sample=>sample.phase==='mixed'),idle=evidence.resources.filter(sample=>sample.phase==='idle');
  return {exposureConfirmed:exposed,resourceActiveCoverage:active.length>evidence.profile.mixedMs/20000&&active.every(sample=>required.every(role=>sample.processes.some(process=>process.role===role&&process.status==='present'))),
    resourceIdleCoverage:idle.length>=2&&idle.every(sample=>['main','renderer','feed'].every(role=>sample.processes.some(process=>process.role===role&&process.status==='present'))),
    gridInputUnder100Ms:inputTarget('grid'),focusInputUnder100Ms:inputTarget('focus'),gridRafUnder500Ms:frameTarget('grid'),focusRafUnder500Ms:frameTarget('focus'),
    searchDbUnder2000Ms:evidence.metrics.searchDb?.maxMs<2000,searchRafUnder2000Ms:exposed?evidence.metrics.searchRaf?.maxMs<2000:null};
  function inputTarget(view){const input=evidence.input[view],metrics=evidence.metrics[view].input;
    return exposed&&input.skipped===0&&input.latencies.length===input.planned&&metrics?metrics.maxMs<100:null;}
  function frameTarget(view){const frames=evidence.metrics[view].frames;return exposed&&frames?frames.maxMs<500:null;}
}
function checkFiles(){
  const names=['settling'];
  for(const name of names){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-'+name+'.json')));validateEvidence(evidence);
    assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
    for(const [source,digest]of Object.entries(evidence.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(__dirname,source))),digest,source);
    for(const [build,digest]of Object.entries(evidence.buildHashes)){assert.match(digest,/^[a-f0-9]{64}$/);if(process.argv.includes('--runtime'))assert.equal(hash(fs.readFileSync(path.join(__dirname,build))),digest,build);}
    console.log(name+': five PTYs, incremental feed, exact search pages, output hashes and measured-source bytes verified '+JSON.stringify({...assessment(evidence),boundedMemorySettlingQualified:evidence.boundedMemorySettlingQualified,memory:evidence.memoryAssessment}));
  }
}
if(require.main===module)checkFiles();
module.exports={validateEvidence,assessment};

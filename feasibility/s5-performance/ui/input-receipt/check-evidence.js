'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {profileFor}=require('./profiles'),{analyze}=require('./analyze'),{sources,builds}=require('./run'),{loadedBackend}=require('../bundled-recovery/check-evidence'),{fixtureDigest,eventAt}=require('../mixed/fixture'),{assessment}=require('../settling/check-evidence'),{distribution}=require('../flood/metrics');
const {checkSchedule}=require('./check-schedule'),{checkOverlap}=require('./check-overlap');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function check(name='pipe',runtime=false){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-'+name+'.json'),'utf8')),root=path.resolve(__dirname,'../../../../output/s5-input-receipt-'+name);
  assert.equal(evidence.schema,'tiye-s5-input-receipt-v1');assert.deepEqual(evidence.profile,profileFor(name));assert(evidence.elapsedMs>=190000);assert.equal(evidence.ownedCleanup,true);assert.equal(evidence.providerRequests,0);
  for(const field of ['boundedMemorySettlingQualified','memorySettlingQualified','hourMixedWorkloadQualified','fullS5Qualified','productionEligible','coreProcessPresent'])assert.equal(evidence[field],false);
  const prelaunch=JSON.parse(fs.readFileSync(path.join(root,'prelaunch.json'),'utf8'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(runtime?evidence.buildHashes:{})}))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  for(const [name,artifact]of Object.entries(evidence.artifacts)){const bytes=fs.readFileSync(path.join(root,name));assert.equal(hash(bytes),artifact.sha256);const decoded=artifact.encoding==='gzip'?zlib.gunzipSync(bytes):bytes;assert.equal(hash(decoded),artifact.decodedSha256);assert.equal(decoded.length,artifact.decodedBytes);}
  assert.deepEqual(evidence.feedIntegrity,{count:50000,sha256:fixtureDigest(),sqlite:'ok',fts:'ok',reopened:true});assert(evidence.ingestion.length>90);assert.equal(evidence.ingestion.at(-1).count,50000);assert(evidence.ingestion[0].count<50000);assert.equal(evidence.searches.length,36);
  for(const search of evidence.searches){assert(search.domRows<=20);assert.equal(search.domRows,search.ids.length);assert.equal(search.total,search.query==='needle'?Math.floor(search.count/997):search.query===''?search.count:0);
    const ids=search.query==='needle'?Array.from({length:Math.min(20,search.total)},(_,index)=>(index+1)*997):search.query===''?Array.from({length:Math.min(20,search.count)},(_,index)=>Math.max(1,search.count-19)+index):[];assert.deepEqual(search.ids,ids);assert(search.ids.every(id=>eventAt(id).id===id));}
  assert.equal(evidence.stored.length,5);assert.equal(evidence.renderer.members.length,5);
  for(const [member,stored]of evidence.stored.entries()){
    assert.equal(stored.member,member);assert.equal(stored.workerExit,0);assert.equal(stored.terminalExit,0);assert(stored.producer.elapsedMs>=180000);loadedBackend(path.join(root,`backend-${member}.json`));
    const bytes=zlib.gunzipSync(fs.readFileSync(path.join(root,`member-${member}.log.gz`)));assert.equal(hash(bytes),stored.sha256);assert.equal(bytes.length,stored.bytes);for(const field of ['member','bytes','chunks','chain'])assert.equal(stored[field],evidence.renderer.members[member][field]);
  }
  const trace=evidence.trace;assert.equal(trace.timerMs,20);assert.equal(trace.timerLatenessRecordedFromMs,20);assert.equal(trace.probes.length,evidence.injected);assert.equal(trace.skipped.length,evidence.input.grid.skipped+evidence.input.focus.skipped);
  const markerBytes=zlib.gunzipSync(fs.readFileSync(path.join(root,'member-0.log.gz'))),markers=Array.from(markerBytes.toString('utf8').matchAll(/S5_ACK_0_(\d+)\x1b8/g),match=>Number(match[1]));assert.deepEqual(markers,trace.probes.map(row=>row.ordinal));
  for(const probe of trace.probes){assert.equal(probe.transport,name);assert.equal(probe.workerTransport,name);assert(Number.isFinite(probe.workerNoticeMs)&&probe.workerNoticeMs>=probe.inputReceivedMs);
    assert(Number.isFinite(probe.controlSendStartMs)&&probe.controlSendStartMs>=probe.inputReceivedMs);
    assert(Number.isFinite(probe.controlSendCallbackMs)&&probe.controlSendCallbackMs>=probe.controlSendStartMs);
    assert(probe.controlSendStartMs<=probe.ackIngressMs);assert.equal(probe.worker.clock,'worker-monotonic');let previous=-1;
    for(const field of ['commandReadMs','writeStartMs','writeEndMs','ackMs']){assert(Number.isFinite(probe.worker[field])&&probe.worker[field]>=previous);previous=probe.worker[field];}assert(probe.renderer.chunkStages.some(stage=>stage.chunkOrdinal===probe.ackChunkOrdinal));}
  trace.probes.forEach((probe,index)=>assert.equal(probe.ordinal,index+1));assert.equal(evidence.renderer.inputEvents,evidence.inputRequests);assert.equal(evidence.inputRequests,evidence.injected);assert.equal(evidence.missingHostAcks,0);
  for(const view of ['grid','focus']){assert.equal(evidence.input[view].planned,evidence.input[view].skipped+evidence.input[view].latencies.length);assert.deepEqual(evidence.metrics[view].input,distribution(evidence.input[view].latencies));}
  trace.operations.forEach(span=>{assert.equal(span.status,'completed');assert(Number.isFinite(span.startMs)&&span.startMs>=0&&span.endMs>=span.startMs);});
  assert.deepEqual(evidence.diagnostics.producer,JSON.parse(fs.readFileSync(path.join(root,'s5-producer-0.json'))));assert.deepEqual(evidence.diagnostics.worker,JSON.parse(fs.readFileSync(path.join(root,'s5-worker-0.json'))));
  const scheduling=checkSchedule(evidence),overlap=checkOverlap(evidence),report=analyze(evidence);assert.equal(report.singleOutstandingVerified,true);assert.deepEqual(report,JSON.parse(fs.readFileSync(path.join(__dirname,'analysis-'+name+'.json'),'utf8')));return {receipts:report.receipts,ackPath:{producerRows:report.ackPath.producerRows,workerRows:report.ackPath.workerRows,producerLoopTicks:report.ackPath.producerLoopTicks,workerLoopTicks:report.ackPath.workerLoopTicks,producerLoopGaps:report.ackPath.producerLoopGaps,workerLoopGaps:report.ackPath.workerLoopGaps},scheduling,overlap,targets:assessment(evidence),planned:report.planned,completed:report.completed,completeMainStages:report.completeMainStages,rendererChunkStages:report.rendererChunkStages,over100:report.over100,fullS5Qualified:false};
}
if(require.main===module)console.log(JSON.stringify(check(process.argv[2],process.argv.includes('--runtime'))));
module.exports={check};

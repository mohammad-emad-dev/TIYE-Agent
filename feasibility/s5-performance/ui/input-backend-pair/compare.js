'use strict';
const assert=require('node:assert/strict'),{profileFor}=require('./profiles'),{analyze}=require('./analyze'),{checkSchedule}=require('./check-schedule'),{checkOverlap}=require('./check-overlap');
function compare(pty,direct){
  assert.deepEqual(pty.sourceHashes,direct.sourceHashes);assert(Object.keys(pty.sourceHashes).length>0);
  assert.deepEqual(pty.buildHashes,direct.buildHashes);assert(Object.keys(pty.buildHashes).length>0);
  const profiles={};
  for(const [name,evidence]of [['pty',pty],['direct',direct]]){
    assert.deepEqual(evidence.profile,profileFor(name));assert.equal(evidence.schema,'tiye-s5-input-backend-pair-v1');
    assert.equal(evidence.ptyMembers,name==='pty'?5:4);assert.equal(evidence.directPipeMembers,name==='direct'?1:0);assert.equal(evidence.combinedPtyWorkload,name==='pty');
    assert.equal(evidence.backendIsolationControl,true);assert.equal(evidence.fullS5Qualified,false);assert.equal(evidence.providerRequests,0);
    checkSchedule(evidence);checkOverlap(evidence);assert.equal(evidence.trace.skipped.length,0);
    assert.deepEqual(evidence.trace.probes.map(row=>row.ordinal),Array.from({length:35},(_,index)=>index+1));
    for(const row of evidence.trace.probes){assert.equal(row.transport,'pipe');assert.equal(row.workerTransport,'pipe');}
    assert.equal(evidence.feedIntegrity.count,50000);assert.deepEqual(evidence.feedIntegrity,pty.feedIntegrity);
    const report=analyze(evidence);assert.equal(report.completed,35);assert.equal(report.singleOutstandingVerified,true);
    const witness=evidence.diagnostics.worker.backendExit;
    if(name==='pty')assert.equal(witness,null);
    else assert.deepEqual(witness,{backend:'direct-pipe',exitCode:0,signal:null,stderrBytes:0,stdoutBytes:evidence.stored[0].bytes,stdoutSha256:evidence.stored[0].sha256});
    profiles[name]={ordinary:report.receipts.ordinaryOnly,positiveControl:report.receipts.positiveControl,all35Over100:report.over100,views:evidence.trace.probes.map(row=>({ordinal:row.ordinal,view:row.view})),rawChildWitnessPresent:name==='direct'};
  }
  return {schema:'tiye-s5-backend-pair-comparison-v1',order:['pty','direct'],completedCaptures:2,profiles,
    matchingScheduledViews:pty.trace.probes.filter((row,index)=>row.view===direct.trace.probes[index].view).length,
    sameExecutedSourcesAndBuilds:true,ordinaryThresholdMs:100,fixedOrder:true,randomized:false,statisticallyPaired:false,causalAttribution:false,historicalSpikeFixed:false,fullS5Qualified:false,
    decision:'Retain bundled ConPTY as experimental prototype backend; keep direct pipes diagnostic-only. End this diagnostic series, retain the unresolved five-PTY latency risk and return to the remaining Phase 0 readiness decision before product construction.'};
}
module.exports={compare};

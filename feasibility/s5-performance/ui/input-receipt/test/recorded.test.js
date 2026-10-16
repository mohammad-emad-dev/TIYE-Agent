'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {check}=require('../check-evidence'),{analyze}=require('../analyze');
test('native diagnostic reconciles probe stages, raw ACK ordinals and existing proxy targets',()=>check());
test('analyzer rejects latency arrays that disagree with main-clock probe stamps',()=>{
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-pipe.json'),'utf8'));evidence.input.focus.latencies[0]+=1;assert.throws(()=>analyze(evidence));
});
test('recorded schedule rejects missed, missing, drifting deadlines and mismatched input views',()=>{
  const {checkSchedule}=require('../check-schedule');
  for(const corrupt of [
    evidence=>{evidence.scheduler.checks[0].checkedMs=10000;},
    evidence=>{evidence.scheduler.checks.pop();},
    evidence=>{evidence.scheduler.checks.at(-1).dueMs+=1;},
    evidence=>{const probe=evidence.trace.probes[0];probe.rendererInputView=probe.view==='grid'?'focus':'grid';}
  ]){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-pipe.json'),'utf8'));corrupt(evidence);assert.throws(()=>checkSchedule(evidence));}
});
test('controlled overlap rejects missing holds, wrong joins, early release and premature page queries',()=>{
  const {checkOverlap}=require('../check-overlap');
  for(const corrupt of [
    evidence=>{evidence.searchBarrier.rows.pop();},
    evidence=>{evidence.searchBarrier.rows[1].slot=1;},
    evidence=>{evidence.searchBarrier.rows[0].releasedMs=evidence.searchBarrier.rows[0].completedMs-0.01;},
    evidence=>{evidence.trace.operations.filter(span=>span.kind==='feed-page')[1].startMs=evidence.searchBarrier.rows[0].armedMs;},
    evidence=>{evidence.searches[0].controlSlot=1;},
    evidence=>{delete evidence.trace.probes[0].ackIngressMs;}
  ]){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-pipe.json'),'utf8'));checkOverlap(evidence);corrupt(evidence);assert.throws(()=>checkOverlap(evidence));}
});
test('ACK-path inspection rejects missing rows, stage inversions and foreign clock labels',()=>{
  const {inspectAckPath}=require('../check-ack-path');
  for(const corrupt of [
    evidence=>{evidence.diagnostics.producer.ack.rows.pop();},
    evidence=>{evidence.diagnostics.producer.ack.rows[0].writeCallbackMs=null;},
    evidence=>{evidence.diagnostics.producer.ack.rows[1].ordinal=1;},
    evidence=>{evidence.diagnostics.worker.loop.domain='producer-monotonic';},
    evidence=>{evidence.trace.probes[0].worker.ackMs=evidence.trace.probes[0].worker.commandReadMs-1;}
  ]){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-pipe.json'),'utf8'));inspectAckPath(evidence);corrupt(evidence);assert.throws(()=>inspectAckPath(evidence));}
});
test('receipt validation rejects missing notices, stamp disagreement and erased positive-control delay',()=>{
  const {checkReceipts}=require('../check-receipts');
  for(const corrupt of [
    evidence=>{delete evidence.trace.probes[0].commandReceiptMs;},
    evidence=>{evidence.trace.probes[0].receiptCommandReadMs+=1;},
    evidence=>{evidence.trace.probes[6].configuredDelayMs=0;},
    evidence=>{evidence.trace.probes[6].worker.writeStartMs=evidence.trace.probes[6].worker.commandReadMs+119;},
    evidence=>{evidence.trace.probes[0].worker.receiptSendReturnedMs=evidence.trace.probes[0].worker.writeStartMs+1;}
  ]){const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-pipe.json'),'utf8'));checkReceipts(evidence);corrupt(evidence);assert.throws(()=>checkReceipts(evidence));}
});

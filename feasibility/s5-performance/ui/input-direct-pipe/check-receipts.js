'use strict';
const assert=require('node:assert/strict'),{distribution}=require('../flood/metrics');
function checkReceipts(evidence){
  const {profile,trace}=evidence;assert.equal(profile.injectedDelayOrdinal,7);assert.equal(profile.injectedDelayMs,120);assert.equal(trace.clock,'main-monotonic');assert.equal(trace.probes.length,35);
  const rows=trace.probes.map(probe=>{
    const expected=probe.ordinal===profile.injectedDelayOrdinal?profile.injectedDelayMs:0;
    assert.equal(probe.configuredDelayMs,expected);assert(Number.isFinite(probe.commandReceiptMs)&&probe.commandReceiptMs>=probe.controlSendStartMs);assert.equal(probe.receiptCommandReadMs,probe.worker.commandReadMs);assert(Number.isFinite(probe.worker.receiptSendReturnedMs)&&probe.worker.commandReadMs<=probe.worker.receiptSendReturnedMs&&probe.worker.receiptSendReturnedMs<=probe.worker.writeStartMs);
    const workerPreWriteMs=probe.worker.writeStartMs-probe.worker.commandReadMs;assert(Number.isFinite(workerPreWriteMs)&&workerPreWriteMs>=expected);
    const beforeAck=probe.commandReceiptMs<=probe.ackIngressMs;
    return {ordinal:probe.ordinal,injected:expected>0,configuredDelayMs:expected,workerPreWriteMs,mainSendToReceiptNoticeMs:probe.commandReceiptMs-probe.controlSendStartMs,receiptNoticeBeforeAck:beforeAck,mainReceiptNoticeToAckMs:beforeAck?probe.ackIngressMs-probe.commandReceiptMs:null,mainTotalMs:probe.renderedReceivedMs-probe.dispatchMs};
  });
  const ordinary=rows.filter(row=>!row.injected),control=rows.find(row=>row.injected);assert.equal(ordinary.length,34);assert(control.mainTotalMs>100,'positive-control-not-visible-in-application-proxy');
  return {receiptCount:35,matchedWorkerCommandStamps:35,positiveControl:{ordinal:7,configuredDelayMs:120,workerPreWriteMs:control.workerPreWriteMs,mainTotalMs:control.mainTotalMs,criterionMet:true},all35Over100:rows.filter(row=>row.mainTotalMs>100).map(row=>row.ordinal),ordinaryOnly:{count:34,over100:ordinary.filter(row=>row.mainTotalMs>100).map(row=>row.ordinal),latencies:distribution(ordinary.map(row=>row.mainTotalMs))},rows};
}
module.exports={checkReceipts};

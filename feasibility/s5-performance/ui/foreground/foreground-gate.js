'use strict';
const criteria=Object.freeze({sampleMaxGapMs:500,minimumPlannedPerView:12,inputMaxMs:100,rafMaxMs:500,searchMaxMs:2000});
const finite=number=>Number.isFinite(number)&&number>=0;
const focused=state=>state?.focused===true&&state.visible===true;
function mainCoverage(exposure,mixedMs){
  const samples=exposure?.samples,events=exposure?.events;
  if(!Array.isArray(samples)||samples.length<2||!Array.isArray(events))return false;
  if(samples[0].elapsedMs!==0||samples.at(-1).elapsedMs<mixedMs)return false;
  if(!samples.every((sample,index)=>sample.seq===index&&finite(sample.elapsedMs)&&focused(sample)&&sample.minimized===false&&
    (index===0||sample.elapsedMs>samples[index-1].elapsedMs&&sample.elapsedMs-samples[index-1].elapsedMs<=criteria.sampleMaxGapMs)))return false;
  return events.every((event,index)=>event.seq===index&&finite(event.elapsedMs)&&event.elapsedMs<=samples.at(-1).elapsedMs&&focused(event)&&event.minimized===false&&
    ['focus','show','restore'].includes(event.event)&&(index===0||event.elapsedMs>=events[index-1].elapsedMs));
}
function rendererCoverage(exposure){
  return focused(exposure?.initial)&&focused(exposure?.final)&&exposure.focusLost===false&&exposure.visibilityLost===false&&
    Array.isArray(exposure.events)&&exposure.events.every(event=>focused(event)&&['focus','visibilitychange'].includes(event.event));
}
function probeCoverage(evidence,view){
  const input=evidence.input?.[view],probes=evidence.probes;
  if(!input||!Array.isArray(probes)||!Number.isInteger(input.planned)||input.planned<criteria.minimumPlannedPerView||input.skipped!==0)return false;
  if(!Array.isArray(input.latencies)||input.latencies.length!==input.planned||!input.latencies.every(finite))return false;
  const selected=probes.filter(probe=>probe.view===view);
  if(selected.length!==input.planned||new Set(probes.map(probe=>probe.ordinal)).size!==probes.length)return false;
  return selected.every(probe=>Number.isInteger(probe.ordinal)&&probe.ordinal>0&&finite(probe.dispatchedAtMs)&&finite(probe.acknowledgedAtMs)&&
    probe.dispatchedAtMs<probe.acknowledgedAtMs&&probe.acknowledgedAtMs<=evidence.profile.mixedMs&&probe.viewAtAck===view&&
    focused(probe.dispatch)&&probe.dispatch.minimized===false&&focused(probe.ack)&&probe.ack.minimized===false&&finite(probe.latencyMs)&&
    Math.abs(probe.acknowledgedAtMs-probe.dispatchedAtMs-probe.latencyMs)<0.000001)&&
    selected.every((probe,index)=>probe.latencyMs===input.latencies[index]);
}
function maximumTarget(samples,limit){return Array.isArray(samples)&&samples.length>0&&samples.every(finite)?Math.max(...samples)<limit:null;}
function foregroundAssessment(evidence){
  const control=evidence.focusMonitorControl,controlConfirmed=control?.scope==='after-measured-interval'&&control.main?.visible===false&&control.main.focused===false&&control.renderer?.focused===false;
  const exposed=controlConfirmed&&mainCoverage(evidence.exposure,evidence.profile.mixedMs)&&rendererCoverage(evidence.renderer.exposure);
  const inputTarget=view=>exposed&&probeCoverage(evidence,view)?maximumTarget(evidence.input[view].latencies,criteria.inputMaxMs):null;
  const frameTarget=view=>exposed?maximumTarget(evidence.renderer.frames[view],criteria.rafMaxMs):null;
  const searchTarget=evidence.searches.every(search=>search.documentVisible===true);
  return {criteria,controlConfirmed,exposureConfirmed:exposed,gridInputUnder100Ms:inputTarget('grid'),focusInputUnder100Ms:inputTarget('focus'),
    gridRafUnder500Ms:frameTarget('grid'),focusRafUnder500Ms:frameTarget('focus'),
    searchDbUnder2000Ms:maximumTarget(evidence.searches.map(search=>search.queryMs),criteria.searchMaxMs),
    searchRafUnder2000Ms:exposed&&searchTarget?maximumTarget(evidence.searches.map(search=>search.requestToRafMs),criteria.searchMaxMs):null};
}
module.exports={foregroundAssessment};

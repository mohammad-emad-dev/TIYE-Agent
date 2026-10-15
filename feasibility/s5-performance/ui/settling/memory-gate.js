'use strict';
const MiB=1048576;
const criteria=Object.freeze({scope:'provisional bounded private-memory settling; not leak-free proof',roles:Object.freeze(['main','renderer','feed']),
  tailMs:120000,minimumSamples:10,minimumSpanMs:100000,maximumGapMs:15000,maximumSlopeMiBPerMinute:1,maximumRangeMiB:8});
function evaluateRole(window,role){
  const points=[];
  for(const sample of window){
    const rows=sample.processes.filter(process=>process.role===role);
    if(sample.phase!=='idle'||rows.length!==1||rows[0].status!=='present'||!Number.isFinite(rows[0].privateBytes)||rows[0].privateBytes<0)return {role,pass:null,reason:'missing-or-invalid-sample'};
    points.push({ms:sample.elapsedMs,bytes:rows[0].privateBytes});
  }
  const spanMs=points.length>1?points.at(-1).ms-points[0].ms:0;
  const maxGapMs=points.length>1?Math.max(...points.slice(1).map((point,index)=>point.ms-points[index].ms)):null;
  if(points.length<criteria.minimumSamples||spanMs<criteria.minimumSpanMs||maxGapMs>criteria.maximumGapMs)return {role,pass:null,reason:'incomplete-window',samples:points.length,spanMs,maxGapMs};
  const xs=points.map(point=>(point.ms-points[0].ms)/60000),ys=points.map(point=>(point.bytes-points[0].bytes)/MiB);
  const meanX=xs.reduce((sum,x)=>sum+x,0)/xs.length,meanY=ys.reduce((sum,y)=>sum+y,0)/ys.length;
  const slopeMiBPerMinute=xs.reduce((sum,x,index)=>sum+(x-meanX)*(ys[index]-meanY),0)/xs.reduce((sum,x)=>sum+(x-meanX)**2,0),rangeMiB=(Math.max(...points.map(point=>point.bytes))-Math.min(...points.map(point=>point.bytes)))/MiB;
  return {role,pass:slopeMiBPerMinute<=criteria.maximumSlopeMiBPerMinute&&rangeMiB<=criteria.maximumRangeMiB,samples:points.length,spanMs,maxGapMs,slopeMiBPerMinute,rangeMiB,firstPrivateMiB:points[0].bytes/MiB,lastPrivateMiB:points.at(-1).bytes/MiB};
}
function evaluateSettling(samples,profile){
  const windowStartMs=profile.mixedMs+profile.idleMs-criteria.tailMs,windowEndMs=profile.mixedMs+profile.idleMs;
  if(!Number.isFinite(windowStartMs)||windowStartMs<profile.mixedMs||!Array.isArray(samples)||samples.some((sample,index)=>!Number.isFinite(sample.elapsedMs)||sample.elapsedMs<0||(index>0&&sample.elapsedMs<=samples[index-1].elapsedMs)))return {criteria,windowStartMs,windowEndMs,pass:null,reason:'invalid-timeline',roles:[]};
  const window=samples.filter(sample=>sample.elapsedMs>=windowStartMs&&sample.elapsedMs<=windowEndMs),roles=criteria.roles.map(role=>evaluateRole(window,role));
  return {criteria,windowStartMs,windowEndMs,roles,pass:roles.some(role=>role.pass===null)?null:roles.every(role=>role.pass===true)};
}
module.exports={criteria,evaluateSettling};

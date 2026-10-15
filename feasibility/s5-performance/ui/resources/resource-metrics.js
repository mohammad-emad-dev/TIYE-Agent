'use strict';
const requiredRoles=['main','renderer',...Array.from({length:5},(_,member)=>'worker-'+member),...Array.from({length:5},(_,member)=>'producer-'+member)];
function roleSeries(samples,role){
  const series=[];let previous=null;
  for(const sample of samples){
    const row=sample.processes.find(process=>process.role===role);
    if(!row||row.status!=='present'){previous=null;continue;}
    const elapsed=previous?row.sampledAtMs-previous.sampledAtMs:0,cpu=previous?row.cpuMs-previous.cpuMs:0;
    series.push({elapsedMs:sample.elapsedMs,phase:sample.phase,workingSetBytes:row.workingSetBytes,privateBytes:row.privateBytes,
      cpuOneCorePercent:previous&&elapsed>0&&cpu>=0?cpu/elapsed*100:null});
    previous=row;
  }
  return series;
}
function summarize(samples){
  const roles=[...new Set(samples.flatMap(sample=>sample.processes.map(process=>process.role)))];
  const summaries=roles.map(role=>{
    const series=roleSeries(samples,role),cpus=series.map(row=>row.cpuOneCorePercent).filter(cpu=>cpu!==null),idle=series.filter(row=>row.phase==='idle');
    return {role,presentSamples:series.length,activeSamples:series.filter(row=>row.phase==='flood').length,idleSamples:idle.length,
      peakWorkingSetBytes:series.length?Math.max(...series.map(row=>row.workingSetBytes)):null,
      peakPrivateBytes:series.length?Math.max(...series.map(row=>row.privateBytes)):null,
      peakCpuOneCorePercent:cpus.length?Math.max(...cpus):null,
      idlePrivateDeltaBytes:idle.length>=2?idle[idle.length-1].privateBytes-idle[0].privateBytes:null};
  });
  return {roles:summaries,activeCoverageComplete:requiredRoles.every(role=>{
    const summary=summaries.find(process=>process.role===role);
    return summary&&summary.activeSamples>=8&&samples.filter(sample=>sample.phase==='flood').every(sample=>sample.processes.some(process=>process.role===role&&process.status==='present'));
  }),idleCoverageComplete:['main','renderer'].every(role=>summaries.some(summary=>summary.role===role&&summary.idleSamples>=8)),
    memorySettlingQualified:false,hourMixedWorkloadQualified:false,fullS5Qualified:false,productionEligible:false};
}
module.exports={requiredRoles,roleSeries,summarize};

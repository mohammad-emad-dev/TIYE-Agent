'use strict';
function distribution(samples) {
  if(!samples.length||samples.some(sample=>!Number.isFinite(sample)||sample<0))return null;
  const sorted=samples.slice().sort((a,b)=>a-b),pick=percent=>sorted[Math.max(0,Math.ceil(sorted.length*percent)-1)];
  return {count:sorted.length,medianMs:pick(.5),p95Ms:pick(.95),maxMs:sorted[sorted.length-1],over50Ms:sorted.filter(value=>value>50).length,over500Ms:sorted.filter(value=>value>500).length};
}
function evaluateTargets(observation) {
  const complete=observation.plannedInputs>0&&observation.plannedInputs===observation.renderer.inputLatencies.length&&observation.focusSkipped===0&&observation.renderer.missingInputs===0&&observation.renderer.visibilityLost===false;
  const input=distribution(observation.renderer.inputLatencies),frames=distribution(observation.renderer.frameGaps);
  return {inputMetric:'synthetic xterm onData to ACK in visible row during xterm onRender; no hardware/display scanout measurement',
    frameMetric:'requestAnimationFrame scheduling gaps during 60-second window; not GPU FPS',
    input,frames,inputCoverageComplete:complete,
    inputUnder100Ms:complete&&input?input.maxMs<100:null,
    rafGapsUnder500Ms:frames&&frames.count>=100&&!observation.renderer.visibilityLost?frames.maxMs<500:null,
    fullS5Qualified:false,productionEligible:false};
}
module.exports={distribution,evaluateTargets};

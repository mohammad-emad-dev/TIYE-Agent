'use strict';
// Classification describes timing co-occurrence, without identifying a cause.
function classifyOverlap(probe,span){
  if(!probe||!span)return 'unknown-data';
  if(!probe.clock||probe.clock!==span.clock)return 'unknown-clock';
  for(const interval of [probe,span])if(!Number.isFinite(interval.startMs)||(interval.endMs!=null&&(!Number.isFinite(interval.endMs)||interval.endMs<interval.startMs)))return 'unknown-data';
  if(probe.endMs==null||span.endMs==null)return 'not-finished';
  if(span.endMs<probe.startMs)return 'before';if(span.startMs>probe.endMs)return 'after';
  if(span.endMs===probe.startMs||span.startMs===probe.endMs)return 'touch';return 'overlap';
}
module.exports={classifyOverlap};

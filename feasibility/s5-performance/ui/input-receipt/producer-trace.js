'use strict';
const assert=require('node:assert/strict');
function createProducerTrace({clock,write}){
  const rows=[];let previous=-1;
  function stamp(){const now=clock();assert(Number.isFinite(now)&&now>=0&&now>=previous,'producer-clock-regressed');previous=now;return now;}
  return {
    ack(ordinal,text,inputReceivedMs){
      assert(Number.isInteger(ordinal)&&ordinal===rows.length+1&&ordinal<=35,'producer-probe-order');
      assert(Number.isFinite(inputReceivedMs)&&inputReceivedMs>=0&&inputReceivedMs>=previous);previous=inputReceivedMs;
      const row={ordinal,inputReceivedMs,writeStartMs:null,writeReturnMs:null,writeCallbackMs:null,writeAccepted:null};rows.push(row);row.writeStartMs=stamp();
      row.writeAccepted=write(text,error=>{if(error)throw error;assert.equal(row.writeCallbackMs,null);row.writeCallbackMs=stamp();});
      assert.equal(typeof row.writeAccepted,'boolean');row.writeReturnMs=stamp();
    },
    snapshot(){for(const row of rows){let prior=-1;for(const field of ['inputReceivedMs','writeStartMs','writeReturnMs','writeCallbackMs']){assert(Number.isFinite(row[field])&&row[field]>=prior,'producer-ack-incomplete');prior=row[field];}}return structuredClone({clock:'producer-monotonic',rows});}
  };
}
module.exports={createProducerTrace};

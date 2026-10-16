'use strict';
const assert=require('node:assert/strict');
function createWorkerTrace(member,clock,emit){
  assert(Number.isInteger(member)&&member>=0&&member<5);
  let pending=null,lastOrdinal=0,tail='';
  function stamp(){const value=clock();assert(Number.isFinite(value)&&value>=0);return value;}
  function current(ordinal){assert(pending&&pending.ordinal===ordinal,'unknown-worker-probe');return pending;}
  function stage(ordinal,field,prior){const row=current(ordinal);assert.equal(row[field],undefined);assert(Number.isFinite(row[prior]));row[field]=stamp();assert(row[field]>=row[prior],'worker-clock-regressed');}
  return {
    command(ordinal){assert.equal(member,0);assert(!pending,'overlapping-worker-probe');assert(Number.isInteger(ordinal)&&ordinal===lastOrdinal+1&&ordinal<=50);pending={ordinal,commandReadMs:stamp()};emit({event:'probe-command-received',clock:'worker-monotonic',ordinal,commandReadMs:pending.commandReadMs});pending.receiptSendReturnedMs=stamp();},
    writeStart(ordinal){stage(ordinal,'writeStartMs','commandReadMs');},
    writeEnd(ordinal){stage(ordinal,'writeEndMs','writeStartMs');},
    ingress(text){
      if(member!==0)return;assert.equal(typeof text,'string');const ackMs=stamp(),joined=tail+text;let consumed=0;
      for(const match of joined.matchAll(/S5_ACK_0_(\d+)\x1b8/g)){
        const ordinal=Number(match[1]),row=current(ordinal);assert(Number.isFinite(row.writeEndMs)&&ackMs>=row.writeEndMs,'ack-before-write-end');
        const packet={event:'probe-worker-timing',clock:'worker-monotonic',...row,ackMs};lastOrdinal=ordinal;pending=null;
        consumed=match.index+match[0].length;emit(packet);
      }
      tail=joined.slice(consumed).slice(-512);
    }
  };
}
module.exports={createWorkerTrace};

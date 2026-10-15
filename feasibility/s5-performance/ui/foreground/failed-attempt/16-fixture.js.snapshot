'use strict';
const {createHash}=require('node:crypto');
const EVENT_COUNT=50000;
function eventAt(id){
  if(!Number.isInteger(id)||id<1||id>EVENT_COUNT)throw Error('invalid-fixture-id');
  return {id,at:id*20,member:(id-1)%5,kind:['message','task','terminal'][(id-1)%3],
    text:`public event ${id} العربية 日本語 ${id%997===0?'needle':'routine'}`};
}
function fixtureDigest(){const digest=createHash('sha256');for(let id=1;id<=EVENT_COUNT;id++)digest.update(JSON.stringify(eventAt(id))+'\n');return digest.digest('hex');}
module.exports={EVENT_COUNT,eventAt,fixtureDigest};

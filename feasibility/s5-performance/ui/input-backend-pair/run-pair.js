'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),protocol=require('./protocol.json');
const destination=path.resolve(__dirname,'../../../../output/s5-input-backend-pair');
assert.deepEqual(protocol.order,['pty','direct']);assert.equal(protocol.maximumNativeAttempts,2);assert.equal(protocol.retries,0);
for(const name of protocol.order){assert(!fs.existsSync(path.join(__dirname,'evidence-'+name+'.json')));assert(!fs.existsSync(path.resolve(__dirname,'../../../../output/s5-input-backend-pair-'+name)));}
fs.mkdirSync(destination);const ledger={schema:'tiye-s5-backend-pair-attempts-v1',protocol,attempts:[],status:'running'};
const persist=()=>fs.writeFileSync(path.join(destination,'attempts.json'),JSON.stringify(ledger,null,2)+'\n');persist();
for(const name of protocol.order){
  const attempt={profile:name,startedAt:new Date().toISOString(),status:'running'};ledger.attempts.push(attempt);persist();
  const child=spawnSync(process.execPath,[path.join(__dirname,'run.js'),name],{stdio:'inherit',windowsHide:true});
  Object.assign(attempt,{endedAt:new Date().toISOString(),exitCode:child.status,signal:child.signal,error:child.error?.message??null,status:child.status===0?'completed':'failed'});persist();
}
ledger.status=ledger.attempts.every(row=>row.status==='completed')?'completed':'incomplete';persist();if(ledger.status!=='completed')process.exitCode=1;

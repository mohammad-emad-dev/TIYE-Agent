'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{check}=require('./check-evidence'),{compare}=require('./compare'),protocol=require('./protocol.json');
function checkPair(runtime=false){
  const root=path.resolve(__dirname,'../../../../output/s5-input-backend-pair'),ledger=JSON.parse(fs.readFileSync(path.join(root,'attempts.json')));
  assert.deepEqual(ledger.protocol,protocol);assert.equal(ledger.status,'completed');assert.equal(ledger.attempts.length,2);
  assert.deepEqual(ledger.attempts.map(row=>row.profile),protocol.order);
  for(const row of ledger.attempts){assert.equal(row.status,'completed');assert.equal(row.exitCode,0);assert.equal(row.signal,null);assert.equal(row.error,null);}
  const checked=Object.fromEntries(protocol.order.map(name=>[name,check(name,runtime)]));
  const report=compare(...protocol.order.map(name=>JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-'+name+'.json')))));
  assert.deepEqual(report,JSON.parse(fs.readFileSync(path.join(root,'comparison.json'))));return {checked,report};
}
if(require.main===module){const {report}=checkPair(process.argv.includes('--runtime'));console.log(JSON.stringify(report,null,2));}
module.exports={checkPair};

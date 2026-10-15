'use strict';
const assert=require('node:assert/strict');
const digest=/^[a-f0-9]{64}$/;
const roles=['writer','recovery-reader',...Array.from({length:5},(_,member)=>[`worker-${member}-0`,`producer-${member}-0`]).flat(),'worker-0-1','producer-0-1'];
function abnormal(termination){return Number.isInteger(termination.exitCode)&&termination.exitCode!==0||typeof termination.signal==='string'&&termination.signal.length>0;}
function validateDatabase(database){
  assert.equal(database.committedBefore,10000);assert.equal(database.uncommittedCount,1000);assert.equal(database.writerVisible,11000);
  assert.equal(database.journalMode,'wal');assert.equal(database.synchronous,2);assert.equal(database.cacheSize,10);
  assert(Number.isFinite(database.walBeforeBytes)&&database.walBeforeBytes>=0);assert(Number.isFinite(database.walArmedBytes)&&database.walArmedBytes>database.walBeforeBytes);
  assert.equal(database.killedWriter.abnormal,true);assert(abnormal(database.killedWriter));
  for(const [state,count,expected]of [[database.recoveredPrefix,10000,database.expectedPrefixSha256],[database.final,50000,database.expectedFullSha256]]){
    assert.equal(state.count,count);assert.match(state.sha256,digest);assert.match(expected,digest);assert.equal(state.sha256,expected);assert.equal(state.sqlite,'ok');assert.equal(state.fts,'ok');
  }
  assert.equal(database.final.reopened,true);
  assert.deepEqual(database.prefixMatches,Array.from({length:10},(_,index)=>(index+1)*997));assert.equal(database.finalTotal,50);
  assert.deepEqual(database.finalMatches,Array.from({length:50},(_,index)=>(index+1)*997));
}
function validateTerminal(terminal,index){
  assert.equal(terminal.member,index===5?0:index);assert.equal(terminal.generation,index===5?1:0);assert.equal(terminal.role,index===0?'victim':index===5?'replacement':'survivor');
  assert.equal(terminal.expectedRecords,300);assert.equal(terminal.ordered,true);assert(Number.isInteger(terminal.bytes)&&terminal.bytes>0);
  assert.match(terminal.captureSha256,digest);assert.match(terminal.storedSha256,digest);assert.equal(terminal.captureSha256,terminal.storedSha256);
  assert(!('pid' in terminal)&&!('identity' in terminal));
  if(index===0){assert(Number.isInteger(terminal.records)&&terminal.records>=10&&terminal.records<300);assert.equal(terminal.ended,false);assert(abnormal(terminal));}
  else{assert.equal(terminal.records,300);assert.equal(terminal.ended,true);assert.equal(terminal.exitCode,0);assert.equal(terminal.signal,null);}
}
function validateRecoveryEvidence(evidence){
  assert.equal(evidence.schema,'tiye-s5-recovery-v1');assert.equal(evidence.platform,'win32');assert.equal(evidence.providerRequests,0);
  for(const field of ['fullS5Qualified','productionEligible','coreProcessPresent'])assert.equal(evidence[field],false);
  for(const field of ['ownedCleanup','ownedProcessesGone','outputIntegrity'])assert.equal(evidence[field],true);
  validateDatabase(evidence.database);assert.equal(evidence.terminals.length,6);evidence.terminals.forEach(validateTerminal);
  assert.equal(evidence.beforeFaultRecords.length,5);evidence.beforeFaultRecords.forEach(count=>assert(Number.isInteger(count)&&count>=10&&count<300));
  assert.equal(evidence.ownedProcessChecks.length,roles.length);assert.deepEqual(evidence.ownedProcessChecks.map(row=>row.role).sort(),roles.slice().sort());
  for(const row of evidence.ownedProcessChecks){assert.deepEqual(Object.keys(row).sort(),['role','status']);assert(['exited','original-exited-pid-reused'].includes(row.status));}
}
module.exports={validateRecoveryEvidence};

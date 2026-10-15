'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{validateRecoveryEvidence}=require('../recovery-policy');
function cohort(){
  const prefix='a'.repeat(64),full='b'.repeat(64),state=(count,sha256)=>({count,sha256,sqlite:'ok',fts:'ok'});
  return {schema:'tiye-s5-recovery-v1',platform:'win32',providerRequests:0,fullS5Qualified:false,productionEligible:false,coreProcessPresent:false,outputIntegrity:true,ownedCleanup:true,ownedProcessesGone:true,
    database:{committedBefore:10000,uncommittedCount:1000,writerVisible:11000,journalMode:'wal',synchronous:2,cacheSize:10,walBeforeBytes:1000,walArmedBytes:4000,killedWriter:{abnormal:true,exitCode:1,signal:null},
      recoveredPrefix:state(10000,prefix),expectedPrefixSha256:prefix,final:{...state(50000,full),reopened:true},expectedFullSha256:full,
      prefixMatches:Array.from({length:10},(_,index)=>(index+1)*997),finalMatches:Array.from({length:50},(_,index)=>(index+1)*997),finalTotal:50},
    terminals:Array.from({length:6},(_,index)=>({member:index===5?0:index,generation:index===5?1:0,role:index===0?'victim':index===5?'replacement':'survivor',records:index===0?30:300,expectedRecords:300,ordered:true,
      ended:index!==0,exitCode:index===0?1:0,signal:null,bytes:500,captureSha256:full,storedSha256:full})),beforeFaultRecords:[20,20,20,20,20],
    ownedProcessChecks:['writer','recovery-reader',...Array.from({length:5},(_,member)=>[`worker-${member}-0`,`producer-${member}-0`]).flat(),'worker-0-1','producer-0-1'].map(role=>({role,status:'exited'}))};
}
test('complete recovery accepts only matched committed state and complete unaffected generations',()=>{validateRecoveryEvidence(cohort());});
test('uncommitted tail, missing WAL spill, normal writer exit and damaged FTS cannot qualify',()=>{
  for(const mutate of [
    evidence=>evidence.database.recoveredPrefix.count=11000,
    evidence=>evidence.database.recoveredPrefix.sha256='c'.repeat(64),
    evidence=>evidence.database.walArmedBytes=evidence.database.walBeforeBytes,
    evidence=>evidence.database.killedWriter.exitCode=0,
    evidence=>evidence.database.finalMatches.pop(),
    evidence=>evidence.database.final.fts='corrupt',
    evidence=>evidence.database.synchronous=1
  ]){const evidence=cohort();mutate(evidence);assert.throws(()=>validateRecoveryEvidence(evidence));}
});
test('missing survivor records, duplicated generation, unknown victim exit and capture drift reject',()=>{
  for(const mutate of [
    evidence=>evidence.terminals[1].records=299,
    evidence=>evidence.terminals[5].generation=0,
    evidence=>evidence.terminals[0].exitCode=null,
    evidence=>evidence.terminals[0].records=300,
    evidence=>evidence.terminals[2].storedSha256='c'.repeat(64),
    evidence=>evidence.terminals[3].ordered=false,
    evidence=>evidence.beforeFaultRecords[2]=9
  ]){const evidence=cohort();mutate(evidence);assert.throws(()=>validateRecoveryEvidence(evidence));}
});
test('missing or duplicate process observations and unsupported qualification flags reject',()=>{
  for(const mutate of [
    evidence=>evidence.ownedProcessChecks.pop(),
    evidence=>evidence.ownedProcessChecks[1].role='writer',
    evidence=>evidence.ownedProcessChecks[0].status='present',
    evidence=>evidence.ownedProcessChecks[0].pid=12,
    evidence=>delete evidence.ownedProcessesGone,
    evidence=>evidence.fullS5Qualified=true
  ]){const evidence=cohort();mutate(evidence);assert.throws(()=>validateRecoveryEvidence(evidence));}
});

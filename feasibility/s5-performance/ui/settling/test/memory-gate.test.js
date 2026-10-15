'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {criteria,evaluateSettling}=require('../memory-gate'),{profileFor}=require('../profiles');
const profile=profileFor('settling');
function samples(step=100000){return Array.from({length:12},(_,index)=>({elapsedMs:360000+index*10000,phase:'idle',processes:criteria.roles.map(role=>({role,status:'present',privateBytes:100*1048576+index*step}))}));}
test('fixed tail OLS and range distinguish low growth, continued growth and unstable spikes',()=>{
  const stable=evaluateSettling(samples(),profile);assert.equal(stable.pass,true);assert(Math.abs(stable.roles[0].slopeMiBPerMinute-600000/1048576)<1e-10);
  assert.equal(evaluateSettling(samples(400000),profile).pass,false);
  const spike=samples(0);spike[5].processes[0].privateBytes+=9*1048576;assert.equal(evaluateSettling(spike,profile).pass,false);
});
test('missing/reused role samples, insufficient span and invalid counters remain unqualified',()=>{
  for(const mutate of [rows=>{rows[4].processes[0].status='identity-changed';},rows=>{rows[4].processes.pop();},rows=>rows.splice(6),
    rows=>{rows[1].processes[1].privateBytes=-1;},rows=>{rows[1].processes[1].privateBytes=NaN;},rows=>{rows[1].elapsedMs=rows[0].elapsedMs;}]){
    const rows=samples();mutate(rows);assert.equal(evaluateSettling(rows,profile).pass,null);
  }
});
test('the chosen tail window excludes earlier growth without discarding an in-window gap',()=>{
  const rows=samples(0);rows.unshift({elapsedMs:350000,phase:'idle',processes:criteria.roles.map(role=>({role,status:'present',privateBytes:500*1048576}))});
  assert.equal(evaluateSettling(rows,profile).pass,true);
  rows.splice(5,1);assert.equal(evaluateSettling(rows,profile).pass,null);
  assert.throws(()=>{criteria.maximumSlopeMiBPerMinute=100;});assert.throws(()=>profileFor('hour'));
});

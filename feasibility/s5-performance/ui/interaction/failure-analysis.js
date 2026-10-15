'use strict';
const assert=require('node:assert/strict'),{phases,recordAt}=require('./fixture');
function compareRecords(member,expectedCount,observed){
  const present=new Set(),duplicates=[],altered=[],unrecognized=[];
  for(const text of observed){const match=text.match(new RegExp(`^REC m=${member} n=(\\d+) `));
    if(!match){unrecognized.push(text);continue;}const sequence=Number(match[1]);if(present.has(sequence))duplicates.push(sequence);present.add(sequence);
    if(text!==recordAt(member,sequence))altered.push(sequence);
  }
  const missing=Array.from({length:expectedCount},(_,sequence)=>sequence).filter(sequence=>!present.has(sequence));
  const unexpected=[...present].filter(sequence=>sequence>=expectedCount);
  const ordered=observed.every((text,index)=>text===recordAt(member,index));
  return {member,expectedCount,observedCount:observed.length,missing,altered,duplicates,unexpected,unrecognizedCount:unrecognized.length,ordered,
    contentMatches:ordered&&missing.length===0&&altered.length===0&&duplicates.length===0&&unexpected.length===0&&unrecognized.length===0&&observed.length===expectedCount};
}
function analyzeFailure(native,expectedFiles){
  const observation=native.lastObservation;assert.equal(observation.index,1);assert.deepEqual(observation.plan,phases[1]);assert.equal(observation.top.length,5);assert.equal(observation.heldCounts.length,5);
  return observation.top.map((snapshot,member)=>{
    assert.equal(snapshot.member,member);assert.equal(snapshot.cols,60);assert.equal(snapshot.rows,16);assert.equal(snapshot.bufferType,'normal');assert.equal(snapshot.viewportY,0);
    const count=observation.heldCounts[member],rows=expectedFiles[member];assert.equal(rows.length,count);rows.forEach((row,sequence)=>assert.deepEqual(row,{sequence,text:recordAt(member,sequence)}));
    return compareRecords(member,count,snapshot.records);
  });
}
module.exports={analyzeFailure,compareRecords};

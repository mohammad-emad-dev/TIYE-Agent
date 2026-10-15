'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {compareRecords}=require('../interaction/failure-analysis'),{recordAt,phases}=require('./fixture');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=filename=>JSON.parse(fs.readFileSync(filename,'utf8'));
const lines=filename=>fs.readFileSync(filename,'utf8').trimEnd().split('\n').map(JSON.parse);
function verify(directory,withBoundary=false,runtime=false){
  const root=path.resolve(directory,'../../../../output',withBoundary?'s5-interaction-paused-boundary':'s5-interaction-paused');
  const evidence=read(path.join(directory,'evidence.json'));
  assert.equal(evidence.outcome.code,1);assert.equal(evidence.outcome.timedOut,false);
  for(const field of ['nativeCompleted','ownedCleanup','activeResizeQualified','fullS5Qualified','productionEligible'])assert.equal(evidence[field],false);
  assert.equal(evidence.sourceUnchanged,true);assert.equal(evidence.runtimeRetained,true);
  const prelaunch=read(path.join(root,'prelaunch.json'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert(Date.parse(prelaunch.recordedBeforeLaunch)<Date.parse(evidence.recordedAt));
  for(const [name,digest]of Object.entries(evidence.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,name))),digest,name);
  for(const [name,digest]of Object.entries(evidence.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(directory,name))),digest,name);
  if(runtime)for(const [name,digest]of Object.entries(evidence.buildHashes))assert.equal(hash(fs.readFileSync(path.join(directory,name))),digest,name);
  assert(fs.readFileSync(path.join(directory,'fixture.js')).equals(fs.readFileSync(path.join(__dirname,'../interaction/fixture.js'))));
  const checkpoints=lines(path.join(root,'checkpoints.jsonl')),failure=read(path.join(root,'failure.json')),journal=read(path.join(root,'journal.json'));
  assert.equal(checkpoints.length,withBoundary?7:5);assert.deepEqual(failure.lastObservation,checkpoints.at(-1));assert.equal(failure.lastObservation.stage,'after-held-resize');assert.equal(failure.lastObservation.index,1);
  const expected=Array.from({length:5},(_,member)=>lines(path.join(root,`expected-${member}.jsonl`)));
  expected.forEach((records,member)=>records.forEach((row,sequence)=>assert.deepEqual(row,{sequence,text:recordAt(member,sequence)})));
  const summary=[];
  for(const checkpoint of checkpoints){
    assert.deepEqual(checkpoint.plan,phases[checkpoint.index]);
    const resumed=checkpoint.stage==='after-resume',states=resumed?checkpoint.afterLive:checkpoint.top,counts=resumed?checkpoint.liveCounts:checkpoint.heldCounts;
    const comparisons=states.map((state,member)=>{
      assert.equal(state.member,member);assert.equal(state.bufferType,'normal');
      const geometry=checkpoint.stage==='before-resize'?phases[Math.max(0,checkpoint.index-1)]:checkpoint.plan;
      assert.equal(state.cols,geometry.cols);assert.equal(state.rows,geometry.rows);
      assert.equal(state.windowsPty.backend,'conpty');assert(state.windowsPty.buildNumber>=21376);
      const chunks=journal[member].chunks.slice(0,state.chunks);assert.equal(chunks.length,state.chunks);
      let chain=Buffer.alloc(32);for(const text of chunks)chain=crypto.createHash('sha256').update(chain).update(Buffer.from(text)).digest();
      assert.equal(state.bytes,Buffer.byteLength(chunks.join('')));assert.equal(state.chain,chain.toString('hex'));
      return compareRecords(member,counts[member],state.records);
    });
    if(checkpoint.index===1&&checkpoint.stage==='after-held-resize')assert(comparisons.every(row=>!row.contentMatches&&row.altered.length>0));
    else assert(comparisons.every(row=>row.contentMatches));
    summary.push({index:checkpoint.index,stage:checkpoint.stage,comparisons});
  }
  const before=checkpoints.find(row=>row.index===1&&row.stage==='before-resize'),after=checkpoints.at(-1);
  assert.deepEqual(before.heldCounts,after.heldCounts);assert.deepEqual(after.heldCounts,expected.map(rows=>rows.length));
  after.sizes.forEach(report=>{assert.equal(report.cols,60);assert.equal(report.rows,16);});
  journal.forEach(({member,chunks},index)=>{
    assert.equal(member,index);assert(Buffer.from(chunks.join('')).equals(fs.readFileSync(path.join(root,`member-${member}.log`))));
    assert.equal(failure.ledger.acked[index],chunks.length);assert.equal(failure.ledger.sent[index],chunks.length);
    const controls=lines(path.join(root,`control-${member}.jsonl`));
    assert.equal(controls.find(row=>row.kind==='hold'&&row.token===101).count,before.heldCounts[member]);
    assert.equal(controls.find(row=>row.kind==='hold'&&row.token===201).count,after.heldCounts[member]);
    const finalState=after.top[member];assert.equal(finalState.chunks,chunks.length);assert.equal(finalState.bytes,Buffer.byteLength(chunks.join('')));
  });
  return summary;
}
if(require.main===module){
  const all=[verify(__dirname,false,process.argv.includes('--runtime')),verify(path.join(__dirname,'../interaction-paused-boundary'),true,process.argv.includes('--runtime'))];
  console.log(JSON.stringify({verifiedFailureEvidence:true,nativeAttempts:2,fullS5Qualified:false,checkpoints:all.map(rows=>rows.length),final:all.map(rows=>rows.at(-1).comparisons)}));
}
module.exports={verify};

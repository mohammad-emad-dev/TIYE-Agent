'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {recordAt,phases}=require('./fixture');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=filename=>JSON.parse(fs.readFileSync(filename,'utf8'));
const lines=filename=>fs.readFileSync(filename,'utf8').trimEnd().split('\n').map(JSON.parse);
function exact(states,counts){assert.equal(states.length,5);states.forEach((state,member)=>{
  assert.equal(state.member,member);assert.equal(state.bufferType,'normal');assert.equal(state.windowsPty.backend,'conpty');assert(state.windowsPty.buildNumber>=21376);
  assert.deepEqual(state.records,Array.from({length:counts[member]},(_,sequence)=>recordAt(member,sequence)));
});}
function verify(directory,options){
  const root=path.resolve(directory,'../../../../output',options.output),evidence=read(path.join(directory,'evidence.json')),native=read(path.join(root,'result.json'));
  assert.equal(evidence.outcome.code,0);assert.equal(evidence.outcome.timedOut,false);assert.equal(evidence.sourceUnchanged,true);assert.equal(evidence.nativeCompleted,true);assert.equal(evidence.activeResizeQualified,options.active);
  for(const field of ['ownedCleanup','fullS5Qualified','productionEligible'])assert.equal(evidence[field],false);
  assert.equal(native.providerRequests,0);assert.equal(native.fullS5Qualified,false);assert.equal(native.productionEligible,false);
  for(const [name,digest]of Object.entries(evidence.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,name))),digest,name);
  for(const [name,digest]of Object.entries(evidence.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(directory,name))),digest,name);
  if(options.runtime)for(const [name,digest]of Object.entries(evidence.buildHashes))assert.equal(hash(fs.readFileSync(path.join(directory,name))),digest,name);
  const prelaunch=read(path.join(root,'prelaunch.json'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);
  assert(fs.readFileSync(path.join(directory,'fixture.js')).equals(fs.readFileSync(path.join(__dirname,'../interaction/fixture.js'))));
  const journal=read(path.join(root,'journal.json')),expected=Array.from({length:5},(_,member)=>lines(path.join(root,`expected-${member}.jsonl`)));
  const receiptPrefixes=journal.map(({member,chunks},index)=>{
    assert.equal(member,index);assert(Buffer.from(chunks.join('')).equals(fs.readFileSync(path.join(root,`member-${member}.log`))));
    let bytes=0,chain=Buffer.alloc(32);const prefixes=[{bytes,chain:chain.toString('hex')}];
    for(const text of chunks){const chunk=Buffer.from(text);bytes+=chunk.length;chain=crypto.createHash('sha256').update(chain).update(chunk).digest();prefixes.push({bytes,chain:chain.toString('hex')});}return prefixes;
  });
  function receipts(states){states.forEach((state,member)=>{const prefix=receiptPrefixes[member][state.chunks];assert(prefix);assert.equal(state.bytes,prefix.bytes);assert.equal(state.chain,prefix.chain);});}
  for(let member=0;member<5;member++){
    expected[member].forEach((row,sequence)=>assert.deepEqual(row,{sequence,text:recordAt(member,sequence)}));
    const backend=read(path.join(root,`backend-${member}.json`));assert.equal(backend.useConptyDll,true);assert(Number.isInteger(backend.workerPid)&&backend.workerPid>0);
    assert.equal(backend.modules.length,1);assert.equal(backend.modules[0].name.toLowerCase(),'conpty.dll');
    const recordedPath=backend.modules[0].filename.replaceAll('\\','/').toLowerCase();assert(recordedPath.endsWith('/node-pty/prebuilds/win32-x64/conpty/conpty.dll'));
    assert(evidence.buildHashes['../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll']);
  }
  assert.equal(native.observations.length,5);
  for(const [index,observation]of native.observations.entries()){
    assert.equal(observation.index,index);assert.deepEqual(observation.plan,phases[index]);
    assert.equal(observation.sizes.length,5);observation.sizes.forEach(size=>{assert.equal(size.cols,phases[index].cols);assert.equal(size.rows,phases[index].rows);});
    observation.heldCounts.forEach((count,member)=>options.active?assert(count>=observation.beforeCounts[member]+15):assert.equal(count,observation.beforeCounts[member]));
    observation.liveCounts.forEach((count,member)=>assert(count>=observation.heldCounts[member]+10));
    for(const [name,counts]of [['top',observation.heldCounts],['afterLive',observation.liveCounts],['middle',observation.liveCounts],['bottom',observation.liveCounts]]){
      const states=observation[name];exact(states,counts);receipts(states);states.forEach(state=>{assert.equal(state.cols,phases[index].cols);assert.equal(state.rows,phases[index].rows);});
    }
    observation.top.forEach((state,member)=>{const live=observation.afterLive[member];assert.equal(state.viewportY,0);assert(state.baseY>7);assert.equal(live.viewportY,0);assert.equal(live.topLine,state.topLine);assert(live.baseY>state.baseY);assert.equal(observation.middle[member].viewportY,7);assert.equal(observation.middle[member].topLine,live.line7);assert.equal(observation.bottom[member].viewportY,observation.bottom[member].baseY);});
  }
  const checkpoints=lines(path.join(root,'checkpoints.jsonl'));assert.equal(checkpoints.length,options.active?10:20);
  for(const checkpoint of checkpoints){const resumed=checkpoint.stage==='after-resume',states=resumed?checkpoint.afterLive:checkpoint.top,counts=resumed?checkpoint.liveCounts:checkpoint.heldCounts;exact(states,counts);receipts(states);}
  exact(native.final,expected.map(rows=>rows.length));receipts(native.final);
  assert.equal(native.childExitChecks.length,10);assert.deepEqual(native.childExitChecks.map(row=>row.role).sort(),Array.from({length:5},(_,index)=>['worker-'+index,'producer-'+index]).flat().sort());assert(native.childExitChecks.every(row=>row.status==='exited'));
  native.stored.forEach((stored,member)=>{
    assert.equal(stored.member,member);assert.equal(stored.records,expected[member].length);assert.equal(stored.workerExit,0);assert.equal(stored.terminalExit,0);
    assert.equal(stored.sha256,hash(fs.readFileSync(path.join(root,`member-${member}.log`))));
    const state=native.final[member];assert.equal(stored.bytes,state.bytes);assert.equal(stored.chunks,state.chunks);assert.equal(stored.chain,state.chain);assert.equal(native.ledger.acked[member],state.chunks);assert.equal(native.ledger.sent[member],state.chunks);
  });
  return {active:options.active,phases:5,records:expected.map(rows=>rows.length),ownedCleanup:false,fullS5Qualified:false};
}
function verifyBoth(runtime=false){
  assert.deepEqual(require('./diagnose-replay').diagnose(),read(path.join(__dirname,'record-differences.json')));
  return [verify(__dirname,{output:'s5-interaction-conpty',active:false,runtime}),verify(path.join(__dirname,'../interaction-conpty-active'),{output:'s5-interaction-conpty-active',active:true,runtime})];
}
if(require.main===module)console.log(JSON.stringify(verifyBoth(process.argv.includes('--runtime'))));
module.exports={verifyBoth};

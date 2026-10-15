'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {compareRecords}=require('../interaction/failure-analysis'),{recordAt}=require('../interaction/fixture');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=filename=>JSON.parse(fs.readFileSync(filename,'utf8'));
function redrawSummary(text){
  const csi=Array.from(text.matchAll(/\x1b\[[0-?]*[ -/]*[@-~]/g),match=>({sequence:match[0],byteOffset:Buffer.byteLength(text.slice(0,match.index))}));
  const recordRuns=Array.from(text.matchAll(/(?:^|\r\n)(REC m=\d+ n=\d+ [^\r\n]*)(?=\r\n|$)/g),match=>({text:match[1],trailingAsciiSpaces:match[1].match(/ *$/)[0].length}));
  return {bytes:Buffer.byteLength(text),sha256:hash(Buffer.from(text)),csi,recordRuns};
}
function analyze(replay,input){
  const modes=['resize-before','first-chunk-before-resize','all-chunks-before-resize'];assert.equal(replay.observations.length,15);
  const seen=new Set(),comparisons=[];
  for(const observation of replay.observations){
    const {member,mode,cut,chunkCount,checkpoints}=observation,key=mode+':'+member;
    assert(modes.includes(mode));assert(Number.isInteger(member)&&member>=0&&member<5);assert(!seen.has(key));seen.add(key);
    const chunks=input.journal[member].chunks,count=input.before.heldCounts[member];
    assert.equal(cut,input.before.top[member].chunks);assert.equal(chunkCount,chunks.length);assert.equal(checkpoints.length,chunks.length-cut+2);
    assert.equal(checkpoints[0].stage,'prefix');assert.deepEqual(checkpoints[0].records,input.before.top[member].records);
    assert.equal(compareRecords(member,count,checkpoints[0].records).contentMatches,true);
    assert.equal(checkpoints[0].cols,100);assert.equal(checkpoints[0].rows,12);
    const received=checkpoints.filter(row=>row.stage==='chunk');assert.deepEqual(received.map(row=>row.ordinal),Array.from({length:chunks.length-cut},(_,index)=>cut+index));
    const expectedStages=['prefix',...received.map(()=> 'chunk')];
    expectedStages.splice(mode==='resize-before'?1:mode==='first-chunk-before-resize'?2:expectedStages.length,0,'local-resize');
    assert.deepEqual(checkpoints.map(row=>row.stage),expectedStages);
    const resize=checkpoints.filter(row=>row.stage==='local-resize');assert.equal(resize.length,1);assert.equal(resize[0].cols,60);assert.equal(resize[0].rows,16);
    const firstBad=checkpoints.find(row=>!compareRecords(member,count,row.records).contentMatches);
    assert(firstBad);assert.equal(firstBad.stage,'chunk');assert.equal(firstBad.ordinal,cut);
    const final=checkpoints.at(-1),comparison=compareRecords(member,count,final.records);
    assert.equal(final.cols,60);assert.equal(final.rows,16);assert.equal(comparison.contentMatches,false);assert.deepEqual(comparison.missing,[]);
    const redraw=redrawSummary(chunks[cut]);assert(chunks[cut].startsWith('\x1b[?25l\x1b[H'));assert.equal(redraw.recordRuns.length,4);
    assert(redraw.recordRuns.every(row=>row.trailingAsciiSpaces===4));
    if(mode==='resize-before'){
      assert.equal(compareRecords(member,count,resize[0].records).contentMatches,true);
      assert.deepEqual(final.records,input.after.top[member].records);assert.equal(comparison.altered.length,5);
    }else{
      assert.equal(comparison.altered.length,4);
      for(const sequence of comparison.altered)assert.equal(final.records[sequence],recordAt(member,sequence)+'    ');
    }
    comparisons.push({mode,member,firstBadOrdinal:firstBad.ordinal,...comparison,redraw});
  }
  return {schema:'tiye-s5-resize-replay-analysis-v1',replayCases:15,allNativeFailuresReproducedExactly:true,firstMismatchIsFirstRedrawChunk:true,
    orderingVariantsFixExactContents:false,rootCauseEstablished:false,activeResizeQualified:false,fullS5Qualified:false,comparisons};
}
function load(){
  const root=path.resolve(__dirname,'../../../../output'),capture=path.join(root,'s5-interaction-paused-boundary');
  const checkpoints=fs.readFileSync(path.join(capture,'checkpoints.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse);
  const input={before:checkpoints.find(row=>row.index===1&&row.stage==='before-resize'),after:checkpoints.at(-1),journal:read(path.join(capture,'journal.json'))};
  return {replay:read(path.join(root,'s5-interaction-replay/result.json')),input};
}
function verify(runtime=false){
  const root=path.resolve(__dirname,'../../../../output/s5-interaction-replay'),evidence=read(path.join(__dirname,'evidence.json'));
  assert.equal(evidence.outcome.code,0);assert.equal(evidence.outcome.timedOut,false);assert.equal(evidence.unchanged,true);
  for(const field of ['nativePtyLaunched','activeResizeQualified','fullS5Qualified','productionEligible','ownedCleanup'])assert.equal(evidence[field],false);
  for(const [name,digest]of Object.entries(evidence.artifacts))assert.equal(hash(fs.readFileSync(path.join(root,name))),digest,name);
  for(const [name,digest]of Object.entries(evidence.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  if(runtime)for(const [name,digest]of Object.entries(evidence.buildHashes))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,name);
  const prelaunch=read(path.join(root,'prelaunch.json'));assert.deepEqual(prelaunch.sourceHashes,evidence.sourceHashes);assert.deepEqual(prelaunch.buildHashes,evidence.buildHashes);assert.deepEqual(prelaunch.inputHashes,evidence.inputHashes);
  for(const [name,digest]of Object.entries(evidence.inputHashes))assert.equal(hash(fs.readFileSync(path.join(root,'../s5-interaction-paused-boundary',name))),digest);
  const {replay,input}=load(),summary=analyze(replay,input);assert.deepEqual(summary,read(path.join(__dirname,'analysis.json')));return summary;
}
if(require.main===module){const summary=verify(process.argv.includes('--runtime'));console.log(JSON.stringify({replayCases:summary.replayCases,allNativeFailuresReproducedExactly:true,orderingVariantsFixExactContents:false,fullS5Qualified:false}));}
module.exports={analyze,load,verify};

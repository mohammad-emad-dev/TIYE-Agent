'use strict';
const fs=require('node:fs'),path=require('node:path'),{createDecoder}=require('./protocol');
const {SqliteFeed}=require('./sqlite-feed'),{EVENT_COUNT,eventAt,fixtureDigest}=require('./fixture');
const root=process.argv[2];
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('owned-feed-root-required');
const filename=path.join(root,'feed.sqlite');
let store=new SqliteFeed(filename),loaded=false,closed=false,lastRequestId=0;
function loadFixture(){
  if(loaded||store.lastId!==0)throw Error('fixture-already-loaded');
  const started=performance.now(),batchLatencies=[];
  for(let first=1;first<=EVENT_COUNT;first+=1000){const batch=Array.from({length:1000},(_,offset)=>eventAt(first+offset)),batchStart=performance.now();store.append(batch);batchLatencies.push(performance.now()-batchStart);}
  const insertedMs=performance.now()-started,before=store.integrity();store.close();store=new SqliteFeed(filename);const after=store.integrity();
  if(before.count!==EVENT_COUNT||before.sha256!==fixtureDigest()||JSON.stringify(before)!==JSON.stringify(after)||after.sqlite!=='ok')throw Error('feed-integrity-mismatch');
  loaded=true;return {insertedMs,batchLatencies,integrity:after,reopened:true,journalMode:store.journalMode,node:process.version,sqlite:process.versions.sqlite};
}
function dispatch(request){
  if(!request||request.id!==lastRequestId+1||closed)throw Error('invalid-request');lastRequestId=request.id;
  if(request.action==='load')return loadFixture();
  if(request.action==='page'&&loaded){const started=performance.now(),page=store.page(request.page);return {...page,queryMs:performance.now()-started};}
  if(request.action==='close'){store.close();closed=true;return {closed:true};}
  throw Error('invalid-action');
}
const input=createDecoder(4096);
function respond(request){const payload=dispatch(request);process.stdout.write(JSON.stringify({id:request.id,payload})+'\n',()=>{if(closed)process.stdin.destroy();});}
process.stdin.on('data',chunk=>input.push(chunk).forEach(respond));
process.stdin.on('end',()=>{input.finish().forEach(respond);if(!closed)throw Error('missing-close-request');});

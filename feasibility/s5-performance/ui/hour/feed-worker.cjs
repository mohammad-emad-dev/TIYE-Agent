'use strict';
const fs=require('node:fs'),path=require('node:path'),{createDecoder}=require('../mixed/protocol');
const {SqliteFeed}=require('../mixed/sqlite-feed'),{eventAt,EVENT_COUNT,fixtureDigest}=require('../mixed/fixture');
const root=process.argv[2];if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('owned-root-required');
const filename=path.join(root,'feed.sqlite');let store=new SqliteFeed(filename),closed=false,lastId=0;
function dispatch(request){
  if(!request||request.id!==++lastId||closed)throw Error('invalid-request');
  if(request.action==='init'){if(store.lastId!==0)throw Error('nonempty-feed');return {count:0,journalMode:store.journalMode,node:process.version,sqlite:process.versions.sqlite};}
  if(request.action==='append'){
    const target=request.page?.target;if(!Number.isInteger(target)||target<store.lastId||target>EVENT_COUNT)throw Error('invalid-target');
    const start=performance.now();while(store.lastId<target){const first=store.lastId+1,count=Math.min(1000,target-store.lastId);store.append(Array.from({length:count},(_,index)=>eventAt(first+index)));}
    return {count:store.lastId,appendMs:performance.now()-start};
  }
  if(request.action==='page'){const start=performance.now(),page=store.page(request.page);return {...page,countAtQuery:store.lastId,queryMs:performance.now()-start};}
  if(request.action==='verify'){
    const before=store.integrity();store.close();store=new SqliteFeed(filename);const after=store.integrity();
    if(before.count!==EVENT_COUNT||before.sha256!==fixtureDigest()||JSON.stringify(before)!==JSON.stringify(after))throw Error('feed-integrity');
    return {...after,reopened:true};
  }
  if(request.action==='close'){store.close();closed=true;return {closed:true};}throw Error('invalid-action');
}
const decoder=createDecoder(4096);
function respond(request){const payload=dispatch(request);process.stdout.write(JSON.stringify({id:request.id,payload})+'\n',()=>{if(closed)process.stdin.destroy();});}
process.stdin.on('data',chunk=>decoder.push(chunk).forEach(respond));
process.stdin.on('end',()=>{decoder.finish().forEach(respond);if(!closed)throw Error('missing-close');});

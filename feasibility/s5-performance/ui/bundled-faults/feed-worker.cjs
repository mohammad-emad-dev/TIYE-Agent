'use strict';
const fs=require('node:fs'),path=require('node:path');
const {SqliteFeed}=require('../mixed/sqlite-feed'),{eventAt,fixtureDigest}=require('../mixed/fixture');
const root=process.argv[2];
if(!process.send||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('owned-root-required');
const filename=path.join(root,'feed.sqlite');let store=new SqliteFeed(filename);
function appendTo(target){while(store.lastId<target){const first=store.lastId+1,count=Math.min(1000,target-store.lastId);store.append(Array.from({length:count},(_,index)=>eventAt(first+index)));}}
function armWriter(){
  appendTo(10000);const prefix=store.integrity();store.db.exec('PRAGMA cache_size=10');
  const walBeforeBytes=fs.statSync(filename+'-wal').size;store.db.exec('BEGIN IMMEDIATE');
  for(let id=10001;id<=11000;id++){const event=eventAt(id);store.insert.run(event.id,event.at,event.member,event.kind,event.text);store.index.run(event.id,event.text);}
  return {committedBefore:10000,uncommittedCount:1000,writerVisible:store.db.prepare('SELECT count(*) AS count FROM events').get().count,
    journalMode:store.journalMode,synchronous:store.db.prepare('PRAGMA synchronous').get().synchronous,cacheSize:store.db.prepare('PRAGMA cache_size').get().cache_size,
    walBeforeBytes,walArmedBytes:fs.statSync(filename+'-wal').size,prefix};
}
function recover(){
  const recoveredPrefix=store.integrity(),prefixMatches=store.page({query:'needle',offset:0,limit:20}).rows.map(row=>row.id);appendTo(50000);const before=store.integrity();
  if(before.sha256!==fixtureDigest())throw Error('full-digest-mismatch');store.close();store=new SqliteFeed(filename);const after=store.integrity();
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('reopen-drift');const finalPage=store.page({query:'needle',offset:0,limit:50});store.close();
  return {recoveredPrefix,prefixMatches,finalMatches:finalPage.rows.map(row=>row.id),finalTotal:finalPage.total,final:{...after,reopened:true}};
}
let commanded=false;
process.on('message',command=>{
  if(commanded)throw Error('duplicate-command');commanded=true;
  if(command?.action==='arm')process.send({event:'armed',...armWriter()});
  else if(command?.action==='recover')process.send({event:'recovered',...recover()},()=>process.disconnect());
  else throw Error('invalid-action');
});
process.send({event:'ready'});

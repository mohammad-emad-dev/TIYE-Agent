'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SqliteFeed}=require('../sqlite-feed'),{eventAt,fixtureDigest}=require('../fixture'),{FeedClient}=require('../worker-client'),{createDecoder}=require('../protocol');
function ownedRoot(){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'tiye-feed-test-'));fs.writeFileSync(path.join(root,'.owner'),'feed-test',{flag:'wx'});return root;}
function removeRoot(root){
  assert.equal(fs.readFileSync(path.join(root,'.owner'),'utf8'),'feed-test');
  for(const name of fs.readdirSync(root)){
    assert(['.owner','feed.sqlite','feed.sqlite-wal','feed.sqlite-shm'].includes(name));const filename=path.join(root,name),stat=fs.lstatSync(filename);
    assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert(fs.realpathSync(filename).startsWith(root+path.sep));
  }
  for(const name of fs.readdirSync(root))fs.unlinkSync(path.join(root,name));fs.rmdirSync(root);
}
test('WAL rows and FTS survive real close/reopen with literal Unicode search and bounded pages',()=>{
  const root=ownedRoot();let store=new SqliteFeed(path.join(root,'feed.sqlite'));
  try{
    store.append(Array.from({length:40},(_,index)=>eventAt(index+1)));const before=store.integrity();store.close();store=new SqliteFeed(path.join(root,'feed.sqlite'));
    assert.equal(store.journalMode,'wal');assert.deepEqual(store.integrity(),before);
    assert.equal(store.page({query:'العربية',offset:0,limit:20}).total,40);
    assert.deepEqual(store.page({query:'',offset:38,limit:20}).rows.map(row=>row.id),[39,40]);
    for(const request of [{query:'" OR 1=1',offset:0,limit:20},{query:'routine',offset:-1,limit:20},{query:'routine',offset:0,limit:51}])assert.throws(()=>store.page(request));
    assert.equal(store.page({query:'routine OR absent',offset:0,limit:20}).total,0);
  }finally{store.close();removeRoot(root);}
});
test('a real SQL failure rolls back both rows and FTS without advancing append state',()=>{
  const root=ownedRoot(),store=new SqliteFeed(path.join(root,'feed.sqlite'));
  try{
    store.db.exec("CREATE TRIGGER refuse_second BEFORE INSERT ON events WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT,'injected-storage-failure'); END;");
    assert.throws(()=>store.append([eventAt(1),eventAt(2)]),/injected-storage-failure/);
    assert.equal(store.page({query:'routine',offset:0,limit:20}).total,0);assert.equal(store.integrity().count,0);
    store.db.exec('DROP TRIGGER refuse_second');store.append([eventAt(1),eventAt(2)]);assert.equal(store.integrity().count,2);
    assert.throws(()=>store.append([eventAt(2)]),/invalid-event/);assert.equal(store.integrity().count,2);
  }finally{store.close();removeRoot(root);}
});
test('UTF8 frames survive every byte split and oversized or truncated messages are refused',()=>{
  const bytes=Buffer.from(JSON.stringify({id:1,payload:{text:'العربية 日本語'}})+'\n');
  for(let split=0;split<=bytes.length;split++){
    const decoder=createDecoder(256),messages=[...decoder.push(bytes.subarray(0,split)),...decoder.push(bytes.subarray(split)),...decoder.finish()];
    assert.equal(messages[0].payload.text,'العربية 日本語');assert.equal(messages.length,1);
  }
  assert.throws(()=>createDecoder(4).push(Buffer.from('12345')),/oversized/);
  const truncated=createDecoder(256);truncated.push(Buffer.from('{"id":1'));assert.throws(()=>truncated.finish(),/truncated/);
});
test('real Node worker loads 50,000 records, correlates search and closes its database',async()=>{
  const root=ownedRoot(),client=new FeedClient(process.execPath,root);
  try{
    const loaded=await client.request('load');assert.equal(loaded.integrity.sha256,fixtureDigest());assert.equal(loaded.journalMode,'wal');
    const found=await client.request('page',{query:'needle',offset:48,limit:20});assert.equal(found.total,50);assert.deepEqual(found.rows.map(row=>row.id),[48853,49850]);
    await client.close();assert.equal(client.closed,true);
  }finally{if(!client.closed){client.worker.kill();await client.exit.catch(()=>{});}removeRoot(root);}
});
test('unexpected owned-worker exit rejects requests instead of fabricating empty results',async()=>{
  const root=ownedRoot(),client=new FeedClient(process.execPath,root);
  const pending=client.request('load');client.worker.kill();
  try{await assert.rejects(pending);await assert.rejects(client.exit);}finally{removeRoot(root);}
});

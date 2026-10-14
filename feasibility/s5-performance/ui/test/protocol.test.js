'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {isChunk,verifyMember}=require('../protocol');
test('foreign or oversized member chunks are refused',()=>{
  for(const packet of [{member:5,ordinal:0,text:'x'},{member:0,ordinal:-1,text:'x'},{member:0,ordinal:0,text:'x'.repeat(1048577)}]) assert.equal(isChunk(packet),false);
});
test('incomplete callbacks, lost chunks, mismatched hashes or foreign member cannot pass',()=>{
  const stored={member:0,exitCode:0,chunks:2,bytes:10,sha256:'synthetic-hash'};
  const renderer={member:0,pending:0,receivedChunks:2,bytes:10,sha256:'synthetic-hash',recordsFound:40};verifyMember(stored,renderer);
  for(const changed of [{pending:1},{receivedChunks:1},{sha256:'foreign'},{member:1},{recordsFound:39}]) assert.throws(()=>verifyMember(stored,{...renderer,...changed}));
});

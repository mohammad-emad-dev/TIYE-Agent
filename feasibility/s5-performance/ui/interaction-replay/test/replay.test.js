'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{analyze,load,verify}=require('../analyze');
test('captured redraw reproduces all five native failures and ordering variants retain padding',()=>verify());
test('replay evidence rejects a missing suffix chunk checkpoint',()=>{
  const {replay,input}=load();replay.observations[0].checkpoints.splice(2,1);assert.throws(()=>analyze(replay,input));
});
test('replay evidence rejects normalized record spaces',()=>{
  const {replay,input}=load(),records=replay.observations[0].checkpoints.at(-1).records;
  const index=records.findIndex(record=>record.endsWith('    '));assert(index>=0);records[index]=records[index].slice(0,-4);
  assert.throws(()=>analyze(replay,input));
});

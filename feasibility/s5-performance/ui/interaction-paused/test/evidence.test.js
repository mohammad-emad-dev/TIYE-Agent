'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {verify}=require('../check-evidence'),{recordAt}=require('../fixture'),{compareRecords}=require('../../interaction/failure-analysis');
test('paused control preserves exact pre-resize passes and five post-native failures',()=>verify(path.resolve(__dirname,'..')));
test('boundary control passes xterm-only resize before all five post-native failures',()=>verify(path.resolve(__dirname,'../../interaction-paused-boundary'),true));
test('exact comparator rejects missing, reordered, and whitespace-altered records',()=>{
  const records=Array.from({length:3},(_,index)=>recordAt(0,index));
  assert.equal(compareRecords(0,3,records).contentMatches,true);
  for(const candidate of [records.slice(1),[records[1],records[0],records[2]],[records[0]+' ',...records.slice(1)]])assert.equal(compareRecords(0,3,candidate).contentMatches,false);
});

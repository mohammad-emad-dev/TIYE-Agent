'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{analyzeFailure,compareRecords}=require('../failure-analysis'),{recordAt}=require('../fixture');
test('preserved native narrow resize remains a failure with two missing IDs and exact text mismatches per terminal',()=>{
  const root=path.resolve(__dirname,'../../../../../output/s5-interaction'),native=JSON.parse(fs.readFileSync(path.join(root,'failure.json')));
  const expected=Array.from({length:5},(_,member)=>fs.readFileSync(path.join(root,`expected-${member}.jsonl`),'utf8').trim().split('\n').map(JSON.parse));
  const outcomes=analyzeFailure(native,expected);assert.deepEqual(outcomes.map(outcome=>outcome.missing),[[88,89],[88,89],[88,89],[86,87],[87,88]]);
  assert(outcomes.every(outcome=>outcome.contentMatches===false&&outcome.altered.length>0));
});
test('padding changes, duplicate records and missing records cannot be normalized into a pass',()=>{
  const valid=[recordAt(0,0),recordAt(0,1),recordAt(0,2)];assert.equal(compareRecords(0,3,valid).contentMatches,true);
  for(const records of [[...valid.slice(0,2)], [...valid,valid[2]], [valid[0]+' ',...valid.slice(1)], [valid[1],valid[0],valid[2]], [valid[0],valid[2],recordAt(0,4)]])assert.equal(compareRecords(0,3,records).contentMatches,false);
});

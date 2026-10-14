'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWorkerDecoder}=require('../worker-channel');
test('Unicode survives every byte split and exit is correlated after complete frames',()=>{
  const expected=[{event:'chunk',text:'العربية 日本語 🌍'},{event:'exit',exitCode:0}];
  const bytes=Buffer.from(expected.map(message=>JSON.stringify(message)+'\n').join(''));
  for(let split=0;split<=bytes.length;split++) {
    const parser=createWorkerDecoder();const actual=[...parser.push(bytes.subarray(0,split)),...parser.push(bytes.subarray(split))];parser.finish();assert.deepEqual(actual,expected);
  }
});
test('duplicate exit, post-exit output, missing exit and truncated frames are refused',()=>{
  for(const trailing of [{event:'exit',exitCode:0},{event:'chunk',text:'late'}]) {
    const parser=createWorkerDecoder();parser.push(Buffer.from('{"event":"exit","exitCode":0}\n'));
    assert.throws(()=>parser.push(Buffer.from(JSON.stringify(trailing)+'\n')));
  }
  const parser=createWorkerDecoder();parser.push(Buffer.from('{"event":"chunk"'));assert.throws(()=>parser.finish());
  const missing=createWorkerDecoder();missing.push(Buffer.from('{"event":"chunk","text":"x"}\n'));assert.throws(()=>missing.finish());
});

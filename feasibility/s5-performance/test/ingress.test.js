'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { captureFive,verifyCapture }=require('../scripts/capture');
const { expectedOutput,outputRecord }=require('../scripts/workload');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
for(const mode of ['normal','rich']) test('five concurrent '+mode+' producers preserve every persisted byte with backpressure',async()=>{
  const capture=await captureFive(120,mode);
  assert.equal(capture.members.length,5);
  assert(capture.members.every(member=>member.pauseCount>0));
  assert.equal(new Set(capture.members.map(member=>member.sha256)).size,5);
});
test('capture verification refuses corrupted bytes, foreign member and failed producer',()=>{
  const bytes=Buffer.from(outputRecord(0,0,'normal'));
  const summary={member:0,...expectedOutput(0,1,'normal'),exitCode:0,stderrBytes:0};
  verifyCapture(summary,bytes,1,'normal');
  assert.throws(()=>verifyCapture(summary,Buffer.from('truncated'),1,'normal'));
  assert.throws(()=>verifyCapture({...summary,member:1},bytes,1,'normal'));
  assert.throws(()=>verifyCapture({...summary,exitCode:1},bytes,1,'normal'));
});
test('invalid workload boundaries refuse execution',async()=>{
  for(const [count,mode] of [[0,'normal'],[10001,'normal'],[10,'unknown']]) await assert.rejects(captureFive(count,mode),/invalid-synthetic-workload/);
});
test('capture cleanup preserves an independently owned sibling sentinel',async()=>{
  const parent=fs.realpathSync(os.tmpdir()),sibling=fs.mkdtempSync(path.join(parent,'tiye-s5-sibling-'));
  const sentinel=path.join(sibling,'public-sentinel');fs.writeFileSync(sentinel,'preserve public bytes',{flag:'wx'});
  try { await captureFive(20,'normal');assert.equal(fs.readFileSync(sentinel,'utf8'),'preserve public bytes'); }
  finally { assert.equal(path.dirname(fs.realpathSync(sibling)),parent);fs.unlinkSync(sentinel);fs.rmdirSync(sibling); }
});

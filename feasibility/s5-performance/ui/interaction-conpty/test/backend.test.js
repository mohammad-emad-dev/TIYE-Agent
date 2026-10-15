'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{verifyBoth}=require('../check-evidence'),{diffRecord}=require('../diff-record');
test('bundled backend preserves exact records across paused and active native resize phases',()=>verifyBoth());
test('Unicode record diagnostics use UTF16 offsets and do not normalize combining marks',()=>{
  const report=diffRecord('😀e\u0301','😀é');assert.equal(report.firstDiffOffset,2);assert.equal(report.expectedLength,4);assert.equal(report.actualLength,3);assert.equal(report.equal,false);
});
test('record diagnostics retain literal trailing spaces',()=>{
  const text='العربية 日本語 cafe\u0301',report=diffRecord(text,text+'    ');
  assert.equal(report.firstDiffOffset,text.length);assert.equal(report.actualTrailingSpaces,4);assert.equal(report.expectedTrailingSpaces,0);assert.equal(report.equal,false);assert.equal(diffRecord(text,text).equal,true);
});

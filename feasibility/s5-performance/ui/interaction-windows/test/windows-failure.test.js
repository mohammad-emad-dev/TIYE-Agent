'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{analyzeFailure}=require('../../interaction/failure-analysis');
test('supported Windows PTY metadata does not falsely qualify the preserved same-fixture resize failure',()=>{
  const root=path.resolve(__dirname,'../../../../../output/s5-interaction-windows'),native=JSON.parse(fs.readFileSync(path.join(root,'failure.json'))),expected=Array.from({length:5},(_,member)=>fs.readFileSync(path.join(root,`expected-${member}.jsonl`),'utf8').trim().split('\n').map(JSON.parse));
  assert(native.lastObservation.top.every(snapshot=>snapshot.windowsPty.backend==='conpty'&&snapshot.windowsPty.buildNumber>=21376));assert(analyzeFailure(native,expected).every(outcome=>outcome.contentMatches===false&&outcome.missing.length>0));
});

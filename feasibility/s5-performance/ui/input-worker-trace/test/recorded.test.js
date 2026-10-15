'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {check}=require('../check-evidence'),{analyze}=require('../analyze');
test('native diagnostic reconciles probe stages, raw ACK ordinals and existing proxy targets',()=>check());
test('analyzer rejects latency arrays that disagree with main-clock probe stamps',()=>{
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-trace.json'),'utf8'));evidence.input.focus.latencies[0]+=1;assert.throws(()=>analyze(evidence));
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateEvidence}=require('../check-evidence');
for(const [scenario,mutate]of [
  ['hidden callback receipt cannot establish keyboard latency',evidence=>{evidence.views[0].keyboardLatencyMeasured=true;}],
  ['missing hidden terminal cannot satisfy focus integrity',evidence=>{evidence.views[1].renderer.pop();}],
  ['failure cannot be promoted to full qualification',evidence=>{evidence.fullS5Qualified=true;}]
])test(scenario,()=>{const evidence=structuredClone(require('../evidence-workers-utf8.json'));mutate(evidence);assert.throws(()=>validateEvidence(evidence));});

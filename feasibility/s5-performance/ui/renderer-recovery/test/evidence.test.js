'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{validateEvidence}=require('../evidence-policy');
test('native replay requires intact journals, complete buffer contents and matching epoch receipt counts',()=>{
  const recorded=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-renderer.json'))),journals=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../../output/s5-renderer-recovery/journal.json')));
  validateEvidence(recorded,journals);
  for(const mutate of [
    (e,j)=>j[0].chunks.splice(2,1),
    e=>e.renderer.members[0].records.splice(2,1),
    e=>e.ledger.acked[1]--,
    e=>e.staleChallengeRejected=false,
    e=>e.gone.reason='killed'
  ]){const evidence=structuredClone(recorded),journal=structuredClone(journals);mutate(evidence,journal);assert.throws(()=>validateEvidence(evidence,journal));}
});
test('recovery cannot qualify without surviving identities, output after confirmed death, and persistent feed reconstruction',()=>{
  const recorded=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-renderer.json'))),journals=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../../output/s5-renderer-recovery/journal.json')));
  for(const mutate of [
    e=>e.survivingRoles[1].sameIdentity=false,
    e=>e.childExitChecks.pop(),
    e=>e.outageCounts[0]=e.goneCounts[0]+4,
    e=>e.pages[1].count=10000,
    e=>e.feedIntegrity.reopened=false,
    e=>e.physicalPaintQualified=true
  ]){const evidence=structuredClone(recorded);mutate(evidence);assert.throws(()=>validateEvidence(evidence,journals));}
});

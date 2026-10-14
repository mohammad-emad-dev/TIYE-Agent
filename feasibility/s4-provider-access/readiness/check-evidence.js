'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { assessDeclaration, fields } = require('./declaration');
const sources = ['declaration.js','cli.js','run-probe.js','../routes.json'];
function checkEvidence() {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname,'evidence.json')));
  assert.equal(evidence.schema,'tiye-s4-readiness-v1'); assert.equal(evidence.providerRequests,0);
  for(const flag of ['liveAuthenticationTested','fullS4Qualified','productionEligible']) assert.equal(evidence[flag],false);
  assert.deepEqual(evidence.operatorDeclaration,assessDeclaration({}));
  const expected = [['empty-declaration','missing-declaration',0],['invalid-json','invalid-json',1],['extra-field','invalid-declaration',1],['oversized-input','oversized-input',1],['partial-blocked-route','blocked-route',1],['partial-alias','unknown-route',1]];
  assert.equal(evidence.observations.length,expected.length);
  evidence.observations.forEach((observation,index)=>{
    const [scenario,category,exitCode]=expected[index];
    assert.equal(observation.scenario,scenario); assert.equal(observation.exitCode,exitCode); assert.equal(observation.stderrEmpty,true);
    const outcome = observation.outcome;
    assert.equal(outcome.category,category); assert.equal(outcome.liveEligible,false);
    assert.equal(outcome.state,index === 0 ? 'awaiting-account-declaration' : 'not-run');
    assert.equal(outcome.fullS4Qualified,false); assert.equal(outcome.productionEligible,false);
    assert(Object.keys(outcome).every(name=>['state','category','liveEligible','fullS4Qualified','productionEligible','missing'].includes(name)));
    if(index === 0) assert.deepEqual(outcome.missing,fields);
    else assert.equal(Object.hasOwn(outcome,'missing'),false);
  });
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());
  for(const name of sources) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex'),evidence.sourceHashes[name],name);
  console.log('Readiness synthetic evidence/source integrity verified; no native eligibility');
}
if(require.main===module) checkEvidence();

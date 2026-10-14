'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { assessDeclaration } = require('./declaration');
const cases = [
  ['empty-declaration','{}','missing-declaration',0],
  ['invalid-json','SYNTHETIC_SECRET','invalid-json',1],
  ['extra-field',JSON.stringify({token:'SYNTHETIC_SECRET'}),'invalid-declaration',1],
  ['oversized-input','SYNTHETIC_SECRET'.repeat(400),'oversized-input',1],
  ['partial-blocked-route',JSON.stringify({routeId:'google-direct-cli-oauth-service-reuse'}),'blocked-route',1],
  ['partial-alias',JSON.stringify({routeId:'Atria-Dawn-Preview'}),'unknown-route',1]
];
const observations = cases.map(([scenario,input,category,exitCode]) => {
  const child = spawnSync(process.execPath,[path.join(__dirname,'cli.js')],{input,encoding:'utf8',env:{},timeout:5000});
  assert.equal(child.status,exitCode); assert.equal(child.stderr,'');
  const outcome = JSON.parse(child.stdout); assert.equal(outcome.category,category); assert.equal(outcome.liveEligible,false);
  assert(!child.stdout.includes('SYNTHETIC_SECRET'));
  return {scenario,outcome,exitCode,stderrEmpty:true};
});
const sources = ['declaration.js','cli.js','run-probe.js','../routes.json'];
const evidence = {schema:'tiye-s4-readiness-v1',recordedAt:new Date().toISOString(),platform:process.platform,node:process.version,
  scope:'Public synthetic stdin assessment only; no provider CLI/auth/model request',observations,
  sourceHashes:Object.fromEntries(sources.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')])),
  operatorDeclaration:assessDeclaration({}),providerRequests:0,liveAuthenticationTested:false,fullS4Qualified:false,productionEligible:false};
fs.writeFileSync(path.join(__dirname,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log('Recorded six synthetic stdin cases; operator declaration remains pending');

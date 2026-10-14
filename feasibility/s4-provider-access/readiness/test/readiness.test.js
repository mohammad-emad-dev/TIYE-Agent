'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assessDeclaration, fields } = require('../declaration');
function syntheticDeclaration() {
  return { routeId:'openai-codex-cli',cli:'codex',providerId:'openai',modelId:'openai/synthetic-model',authMethod:'api-key',accountPlan:'synthetic-plan',accountCountry:'ZZ' };
}
for (const field of fields) test('missing ' + field + ' remains pending without launch', () => {
  const declaration = syntheticDeclaration(); delete declaration[field];
  const outcome = assessDeclaration(declaration);
  assert.equal(outcome.state, 'awaiting-account-declaration'); assert.deepEqual(outcome.missing, [field]);
});
for (const [scenario, mutate, category] of [
  ['alias', declaration => { declaration.routeId = 'Atria-Dawn-Preview'; }, 'unknown-route'],
  ['blocked reuse', declaration => { declaration.routeId = 'google-direct-cli-oauth-service-reuse'; }, 'blocked-route'],
  ['CLI mismatch', declaration => { declaration.cli = 'claude'; }, 'cli-route-mismatch'],
  ['auth mismatch', declaration => { declaration.authMethod = 'oauth'; }, 'auth-method-mismatch'],
  ['vendor mismatch', declaration => { declaration.providerId = 'atria'; }, 'provider-route-mismatch'],
  ['model alias', declaration => { declaration.modelId = 'Atria-Dawn-Preview'; }, 'invalid-identity-syntax'],
  ['extra secret field', declaration => { declaration.token = 'SYNTHETIC_SECRET'; }, 'invalid-declaration'],
  ['nested account', declaration => { declaration.accountPlan = { token:'SYNTHETIC_SECRET' }; }, 'invalid-declaration']
]) test(scenario + ' cannot establish readiness', () => {
  const declaration = syntheticDeclaration(); mutate(declaration);
  const outcome = assessDeclaration(declaration); assert.equal(outcome.category, category);
  assert(!JSON.stringify(outcome).includes('SYNTHETIC_SECRET')); assert.equal(outcome.liveEligible, false);
});
test('complete synthetic syntax cannot establish country eligibility or account entitlement', () => {
  const declaration = syntheticDeclaration(), outcome = assessDeclaration(declaration);
  assert.equal(outcome.state, 'awaiting-policy-and-native-qualification'); assert.equal(outcome.liveEligible, false);
  assert.equal(outcome.declarationSyntaxValidated, true);
  for (const name of ['modelId','providerId','accountPlan','accountCountry','authMethod']) assert(!Object.hasOwn(outcome, name));
});
test('inherited fields and getters cannot supply declaration values', () => {
  assert.equal(assessDeclaration(Object.create(syntheticDeclaration())).category, 'invalid-declaration');
  const declaration = {}; Object.defineProperty(declaration, 'routeId', { get() { throw Error('must not run'); } });
  assert.equal(assessDeclaration(declaration).category, 'invalid-declaration');
});
test('aggregator cannot establish actual provider permission', () => {
  const outcome = assessDeclaration({ ...syntheticDeclaration(), routeId:'opencode-provider-routing',cli:'opencode',authMethod:'provider-key' });
  assert.equal(outcome.category, 'provider-identity-unreviewed'); assert.equal(outcome.liveEligible, false);
});
for (const [routeId,category] of [['Atria-Dawn-Preview','unknown-route'],['google-direct-cli-oauth-service-reuse','blocked-route']]) test('partial ' + routeId + ' is refused before account completion',()=>{
  assert.equal(assessDeclaration({routeId}).category,category);
});
for (const [scenario, input, category, exitCode] of [
  ['missing account', '{}', 'missing-declaration', 0],
  ['malformed', 'SYNTHETIC_SECRET', 'invalid-json', 1],
  ['oversized', 'SYNTHETIC_SECRET'.repeat(400), 'oversized-input', 1],
  ['secret field', JSON.stringify({token:'SYNTHETIC_SECRET'}), 'invalid-declaration', 1],
  ['complete syntax', JSON.stringify(syntheticDeclaration()), 'route-policy-and-native-pending', 0]
]) test('actual stdin CLI projects ' + scenario + ' to fixed outcome', () => {
  const child = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.js')], { input, encoding:'utf8', env:{}, timeout:5000 });
  assert.equal(child.status, exitCode); assert.equal(child.stderr, '');
  const outcome = JSON.parse(child.stdout); assert.equal(outcome.category, category); assert.equal(outcome.liveEligible, false);
  assert(!/SYNTHETIC_SECRET|synthetic-plan|synthetic-model|ZZ/.test(child.stdout));
});

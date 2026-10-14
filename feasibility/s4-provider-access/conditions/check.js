const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
function validateReview(review, baseline) {
  assert.equal(review.schema, 'tiye-s4-account-conditions-v1');
  for (const flag of ['fullS4Qualified', 'productionEligible', 'liveAuthenticationTested', 'allIncorporatedPoliciesReviewed']) assert.equal(review[flag], false, flag);
  const sourceIds = new Set();
  const primaryHosts = new Set(['learn.chatgpt.com', 'openai.com', 'code.claude.com', 'www.anthropic.com', 'geminicli.com', 'developers.google.com', 'policies.google.com', 'one.google.com', 'ai.google.dev', 'cloud.google.com']);
  for (const source of review.sources) {
    assert(!sourceIds.has(source.id), 'duplicate citation');
    sourceIds.add(source.id);
    const url = new URL(source.url);
    assert(url.protocol === 'https:' && primaryHosts.has(url.hostname), 'primary citation required');
    assert.equal(source.reviewedOn, review.reviewedOn);
  }
  assert.deepEqual(review.routes.map(route => route.id).sort(), baseline.routes.map(route => route.id).sort());
  for (const route of review.routes) {
    assert.equal(route.classification, 'unreviewed');
    for (const flag of ['integrationEligible', 'contractAcceptanceEstablished', 'nativeAuthQualified']) assert.equal(route[flag], false, route.id + ':' + flag);
    assert(route.remaining.length > 0);
    assert(route.sourceIds.every(id => sourceIds.has(id)), 'unknown citation');
    if (route.id !== 'opencode-provider-routing') assert(route.sourceIds.length > 0, 'missing route citations');
  }
  const live = review.nativePlan.find(plan => plan.kind === 'live');
  assert.equal(live.state, 'planned-not-authorized-by-this-plan');
  const required = ['exact-cli-version-model', 'non-secret-account-route-declaration', 'applicable-region-and-agreement', 'route-policy-review', 'public-synthetic-input', 'official-auth-owned-by-user', 'owned-process-and-workspace', 'sanitized-evidence', 'native-approval-boundary'];
  assert.deepEqual(live.prerequisites.slice().sort(), required.slice().sort());
  for (const route of review.routes) assert.deepEqual(route.requiredPrerequisites.slice().sort(), required.slice().sort());
  assert.equal(review.nativePlan.find(plan => plan.kind === 'offline').modelRequests, 0);
}
function checkFiles() {
  const review = JSON.parse(fs.readFileSync(path.join(__dirname, 'review.json')));
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'routes.json')));
  validateReview(review, baseline);
  const seal = JSON.parse(fs.readFileSync(path.join(__dirname, 'seal.json')));
  const expected = ['README.md', 'check.js', 'package.json', 'review.json', 'test/conditions.test.js'];
  assert.deepEqual(Object.keys(seal.sha256).sort(), expected.sort(), 'seal coverage');
  for (const [name, digest] of Object.entries(seal.sha256)) {
    const bytes = fs.readFileSync(path.join(__dirname, name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), digest, name);
  }
  console.log('S4 conditions integrity passed; account applicability and native qualification pending');
}
if (require.main === module) checkFiles();
module.exports = { validateReview };

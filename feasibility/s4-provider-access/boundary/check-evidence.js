'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const prerequisites = require('../conditions/review.json').routes[0].requiredPrerequisites;
const sourceFiles = ['route-gate.js','owned-fake.js','fake-cli.js','run-probe.js','../routes.json','../conditions/review.json'];
function validateEvidence(evidence) {
  assert.equal(evidence.schema, 'tiye-s4-offline-boundary-v1');
  assert.equal(evidence.providerRequests, 0);
  for (const flag of ['liveAuthenticationTested','fullS4Qualified','productionEligible']) assert.equal(evidence[flag], false);
  for (const flag of ['liveRefused','aliasRefused','blockedRouteRefused','foreignHandleRefused','unexpectedContentPreserved','siblingPreserved','ownedCleanup','syntheticFieldsOmitted','offlineBoundaryQualified']) assert.equal(evidence[flag], true, flag);
  assert.deepEqual(evidence.missingChecks.slice().sort(), prerequisites.slice().sort());
  const expected = { success:'synthetic-task', auth:'auth', quota:'quota', model:'unsupported-model', invalid:'invalid-reply', foreign:'uncorrelated-reply', exit:'process-exit' };
  assert.deepEqual(Object.keys(evidence.outcomes).sort(), Object.keys(expected).sort());
  for (const [scenario, category] of Object.entries(expected)) {
    const outcome = evidence.outcomes[scenario];
    assert.equal(outcome.category, category); assert.equal(outcome.state, scenario === 'success' ? 'completed' : 'failed');
    assert(Object.keys(outcome).every(name => ['state','category','exitCode'].includes(name)), 'raw output field');
    if (['invalid','foreign'].includes(scenario)) assert.equal(Object.hasOwn(outcome, 'exitCode'), false);
    else assert.equal(outcome.exitCode, scenario === 'exit' ? 7 : 0);
  }
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(), sourceFiles.slice().sort());
}
function checkEvidence() {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence.json')));
  validateEvidence(evidence);
  for (const name of sourceFiles) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex'), evidence.sourceHashes[name], name);
  console.log('Offline boundary evidence and measured source hashes verified');
}
if (require.main === module) checkEvidence();
module.exports = { validateEvidence };

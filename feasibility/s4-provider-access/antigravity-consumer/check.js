'use strict';
const assert = require('node:assert/strict');
const route = require('./route.json');
assert.equal(route.classification, 'D');
for (const flag of ['integrationEligible','delegationEligible','nativeModelRequestRun','fullS4Qualified','productionEligible','personalAccountMetadataRetained']) assert.equal(route[flag], false);
assert.equal(route.modelIdObserved, 'gemini-3.8-flash-high');
assert.equal(route.cli, 'agy');
assert.equal(route.modelListExitCode, 0);
for (const source of route.sources) {
  const url = new URL(source.url);
  assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'antigravity.google');
}
assert(route.sources.some(source => source.id === 'agy-faq'));
assert(route.sources.some(source => source.id === 'agy-terms'));
console.log('Antigravity consumer wrapper blocked; public model identity resolved');

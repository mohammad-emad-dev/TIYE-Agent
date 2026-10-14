const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../scripts/check-research');
const root = path.resolve(__dirname, '..');
function data() {
  return ['sources.json', 'routes.json', 'evidence/cli-inventory.json'].map(name => JSON.parse(fs.readFileSync(path.join(root, name))));
}
test('official documentation does not promote a route to release qualification', () => {
  const args = data(); args[1].routes[0].integrationEligible = true;
  assert.throws(() => validate(...args));
});
test('direct OAuth reuse restriction cannot disappear', () => {
  const args = data(); args[1].blockedRoutes.pop();
  assert.throws(() => validate(...args));
});
test('delegation alias cannot supply vendor identity', () => {
  const args = data(); args[1].unresolvedAliases[0].actualVendor = 'Anthropic';
  assert.throws(() => validate(...args));
});
test('Agy cannot qualify Gemini CLI parity', () => {
  const args = data(); args[1].unresolvedAliases[2].geminiCliParityQualified = true;
  assert.throws(() => validate(...args));
});
test('route citations must point to recorded primary sources', () => {
  const args = data(); args[1].routes[0].sourceIds = ['invented-source'];
  assert.throws(() => validate(...args));
});

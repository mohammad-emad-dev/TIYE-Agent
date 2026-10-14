'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateEvidence } = require('../check-evidence');
for (const [scenario, mutate] of [
  ['provider failures cannot be promoted', evidence => { evidence.outcomes.quota.state = 'completed'; }],
  ['raw fields cannot enter retained evidence', evidence => { evidence.outcomes.success.token = 'synthetic'; }],
  ['exit-code field cannot retain arbitrary text', evidence => { evidence.outcomes.success.exitCode = 'synthetic secret'; }],
  ['cleanup proof cannot be omitted', evidence => { delete evidence.ownedCleanup; }]
]) test(scenario, () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evidence.json')));
  mutate(evidence); assert.throws(() => validateEvidence(evidence));
});

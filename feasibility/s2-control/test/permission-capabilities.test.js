'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessment } = require('../scripts/build-permission-capabilities');

test('capability assessment retains unknown and provider-blocked modes without promising OS enforcement', () => {
  const observed = {
    controls: require('../evidence/permission-controls-latest.json'),
    approvals: require('../evidence/approval-outcomes-latest.json'),
    inventory: require('../evidence/permission-options-latest.json'),
  };
  const classified = assessment(observed);
  assert.equal(classified.productionEligible, false);
  assert.equal(classified.fileAccess.none.observedStatus, 'unverified');
  assert.equal(classified.fileAccess.readOnly.observedStatus, 'partial');
  assert.equal(classified.terminal.off.observedStatus, 'blocked-for-tested-model');
  for (const mode of [...Object.values(classified.fileAccess), ...Object.values(classified.terminal)]) assert.equal(mode.productGuarantee, false);
  const failedControls = structuredClone(observed.controls);
  failedControls.runs[0].cli.permissionsConfirmed = false;
  assert.throws(() => assessment({ ...observed, controls: failedControls }), /gate failed/);
  const duplicate = structuredClone(observed.controls);
  duplicate.runs[1] = duplicate.runs[0];
  assert.throws(() => assessment({ ...observed, controls: duplicate }), /cohort incomplete/);
  assert.throws(() => assessment({ ...observed, controls: require('../evidence/permission-controls-first.json') }), /cohort incomplete/);
  assert.throws(() => assessment({ ...observed, inventory: { version: 'opencode v2.0.220' } }), /version mismatch/);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessment } = require('../scripts/build-permission-capabilities');

test('capability assessment retains unknown and provider-blocked modes without promising OS enforcement', () => {
  const observed = {
    controls: require('../evidence/versions/2.0.22/permission-controls-latest.json'),
    approvals: require('../evidence/versions/2.0.22/approval-outcomes-latest.json'),
    inventory: require('../evidence/versions/2.0.22/permission-options-latest.json'),
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
  assert.throws(() => assessment({ ...observed, inventory: { version: 'opencode v2.0.220' } }), /version requires review/);
});

test('mixed or drifted versions cannot qualify a new permission assessment or inherit historical shell-off status', () => {
  const controls = structuredClone(require('../evidence/versions/2.0.22/permission-controls-latest.json'));
  const approvals = structuredClone(require('../evidence/versions/2.0.22/approval-outcomes-latest.json'));
  const inventory = { version: 'opencode v2.0.28' };
  assert.throws(() => assessment({ controls, approvals, inventory }), /gate failed/);
  for (const run of [...controls.runs, ...approvals.runs]) { run.cli.version = '2.0.28'; run.cli.serviceVersionAfterCleanup = '2.0.28'; }
  const classified = assessment({ controls, approvals, inventory });
  assert.deepEqual(classified.testedVersions, ['2.0.28']);
  assert.equal(classified.terminal.off.observedStatus, 'unverified-for-tested-version');
  assert.equal(classified.terminal.off.providerCompatibility, 'not-revalidated');
  assert.deepEqual(classified.terminal.off.evidence, []);
  assert.equal(classified.terminal.off.historicalEvidence[0].version, '2.0.22');
  assert.equal(classified.productionEligible, false);
  for (const mode of [...Object.values(classified.fileAccess), ...Object.values(classified.terminal)]) assert.equal(mode.productGuarantee, false);
  approvals.runs[0].cli.serviceVersionAfterCleanup = '2.0.22';
  assert.throws(() => assessment({ controls, approvals, inventory }), /gate failed/);
  delete approvals.runs[0].cli.serviceVersionAfterCleanup;
  assert.throws(() => assessment({ controls, approvals, inventory }), /gate failed/);
});

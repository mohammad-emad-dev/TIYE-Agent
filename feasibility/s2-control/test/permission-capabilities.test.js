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

test('supplemental diagnostics keep blocked profiles distinct from targeted native denials', () => {
  const input = {
    controls: require('../evidence/versions/2.0.28/permission-controls-latest.json'),
    approvals: require('../evidence/versions/2.0.28/approval-outcomes-latest.json'),
    inventory: require('../evidence/versions/2.0.28/permission-options-latest.json'),
    deniedProfiles: require('../evidence/supplements/denied-profiles/c76bec928185266f07395d9d0c19cff7e019408855cac68c874067e4821d654f/2.0.28/denied-profiles.json'),
  };
  const candidate = assessment(input);
  assert.equal(candidate.terminal.off.observedStatus, 'blocked-for-tested-model');
  assert.equal(candidate.terminal.off.providerCompatibility, 'http-403-before-tool-execution');
  assert.equal(candidate.fileAccess.none.observedStatus, 'partial-native-controls');
  assert.deepEqual(candidate.fileAccess.none.observedControls, ['targeted-read-deny', 'targeted-glob-deny', 'targeted-grep-deny']);
  assert.equal(candidate.productionEligible, false);
  for (const mode of [...Object.values(candidate.fileAccess), ...Object.values(candidate.terminal)]) {
    assert.equal(mode.productGuarantee, false);
    assert.equal(mode.osEnforcement, 'not-established');
  }
  const mutations = [
    data => { data.runs[1] = data.runs[0]; },
    data => { data.expectedVersion = '2.0.22'; },
    data => { data.runs[0].passed = true; },
    data => { data.runs[0].cli.nativeDenialObserved = true; },
    data => { data.runs[0].cli.toolCalls = 1; },
    data => { data.runs[2].cli.completedQuiescent = false; },
    data => { data.runs[2].cli.noCanaryLeak = false; },
    data => { data.runs[2].cli.serviceVersionAfterCleanup = '2.0.22'; },
    data => { data.runs[2].cli.sessionRemoved = false; },
    data => { data.passed = true; },
    data => { data.selectedConfigsUnchanged = false; },
  ];
  for (const mutate of mutations) {
    const deniedProfiles = structuredClone(input.deniedProfiles); mutate(deniedProfiles);
    assert.throws(() => assessment({ ...input, deniedProfiles }), /Denied profile/);
  }
});

test('terminal UI qualification uses its own complete, version-bound cohort without inventing saved approvals or isolation', () => {
  const input = {
    controls: require('../evidence/versions/2.0.28/permission-controls-latest.json'),
    approvals: require('../evidence/versions/2.0.28/approval-outcomes-latest.json'),
    inventory: require('../evidence/versions/2.0.28/permission-options-latest.json'),
    terminalApprovals: require('../evidence/supplements/terminal-approvals/139d3d2c62ddf3a556578b62043e9b944bce9347cde9cf350a2f5eb77a7ee01e/2.0.28/terminal-approvals.json'),
  };
  const qualified = assessment(input);
  assert.deepEqual(qualified.terminal.ask.nativeTerminalUI.decisions, ['reject', 'once']);
  assert.equal(qualified.terminal.ask.nativeTerminalUI.observedStatus, 'bounded-native-decisions-passed');
  assert.equal(qualified.terminal.ask.productGuarantee, false);
  assert.equal(qualified.terminal.ask.osEnforcement, 'not-established');
  assert.equal(qualified.productionEligible, false);
  assert.equal(qualified.terminal.off.observedStatus, 'unverified-for-tested-version');
  const mutations = [
    measurement => { measurement.runs[1] = measurement.runs[0]; },
    measurement => { measurement.runs.pop(); },
    measurement => { measurement.expectedVersion = '2.0.22'; },
    measurement => { measurement.passed = false; },
    measurement => { measurement.selectedConfigsUnchanged = false; },
    measurement => { measurement.runs[0].cli.uiDecisionInputMatched = false; },
    measurement => { measurement.runs[0].cli.apiApprovalRepliesSent = 1; },
    measurement => { measurement.runs[1].cli.markerSamplesAtSecondApproval = 1; },
    measurement => { measurement.runs[1].cli.serviceVersionAfterCleanup = '2.0.22'; },
  ];
  for (const mutate of mutations) {
    const terminalApprovals = structuredClone(input.terminalApprovals); mutate(terminalApprovals);
    assert.throws(() => assessment({ ...input, terminalApprovals }), /Terminal approval/);
  }
});

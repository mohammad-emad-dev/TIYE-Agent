'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reliabilitySummary } = require('../scripts/reliability-summary');
const success = (_value, index) => ({ index: index + 1, roundTripPassed: true, cli: { initialCompletedAck: true, nudgeUsed: false } });
test('nine completed trials cannot satisfy the ten-trial gate', () => {
  const summary = reliabilitySummary({ runs: Array.from({ length: 9 }, success), selectedConfigsUnchanged: true });
  assert.equal(summary.complete, false);
  assert.equal(summary.reportingThresholdsMet, false);
});
test('a valid nudge recovery preserves the initial miss in the denominator', () => {
  const runs = Array.from({ length: 10 }, success);
  runs[9] = { ...runs[9], cli: { initialCompletedAck: false, nudgeUsed: true } };
  const summary = reliabilitySummary({ runs, selectedConfigsUnchanged: true });
  assert.equal(summary.initialReports, 9);
  assert.equal(summary.reportsWithinNudgeBudget, 10);
  assert.equal(summary.nudgedRecoveries, 1);
  assert.equal(summary.reportingThresholdsMet, true);
});
test('a reported task with failed cleanup does not count as success', () => {
  const runs = Array.from({ length: 10 }, success);
  runs[9].roundTripPassed = false;
  assert.equal(reliabilitySummary({ runs, selectedConfigsUnchanged: true }).reportingThresholdsMet, false);
});
test('config drift and stopped measurements cannot pass', () => {
  const runs = Array.from({ length: 10 }, success);
  for (const evidence of [{ runs, selectedConfigsUnchanged: false }, { runs, selectedConfigsUnchanged: true, stoppedReason: 'cleanup' }]) {
    assert.equal(reliabilitySummary(evidence).reportingThresholdsMet, false);
  }
});
test('ten unassisted successes do not invent an exercised nudge recovery', () => {
  const summary = reliabilitySummary({ runs: Array.from({ length: 10 }, success), selectedConfigsUnchanged: true });
  assert.equal(summary.reportingThresholdsMet, true);
  assert.equal(summary.nudgeAttempts, 0);
  assert.equal(summary.nudgedRecoveries, 0);
});
test('two initial omissions miss the initial threshold even if both recover', () => {
  const runs = Array.from({ length: 10 }, success);
  for (const index of [8, 9]) runs[index] = { ...runs[index], cli: { initialCompletedAck: false, nudgeUsed: true } };
  assert.equal(reliabilitySummary({ runs, selectedConfigsUnchanged: true }).reportingThresholdsMet, false);
});
test('a duplicate trial cannot turn nine unique trials into ten successes', () => {
  const runs = Array.from({ length: 10 }, success);
  runs[9] = runs[8];
  assert.equal(reliabilitySummary({ runs, selectedConfigsUnchanged: true }).reportingThresholdsMet, false);
});

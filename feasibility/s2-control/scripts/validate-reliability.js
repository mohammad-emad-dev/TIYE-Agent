'use strict';
// Review captured code before invoking this command. Invalid or interrupted
// validation must invalidate any older PASS before reading the new evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { reliabilitySummary } = require('./reliability-summary');
const evidenceDir = path.resolve(__dirname, '../evidence');
const validationPath = path.join(evidenceDir, 'reliability-validation.json');
const source = path.join(evidenceDir, 'reliability-latest.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function validateRun(run, expectedRoot = path.join(evidenceDir, 'reliability', `run-${String(run.index).padStart(2, '0')}`)) {
  if (!run.roundTripPassed || !run.taskFilesCaptured) return { index: run.index, passed: false, reason: 'Round trip or code capture failed' };
  const artifactRoot = path.resolve(evidenceDir, run.captureName);
  if (artifactRoot !== expectedRoot) throw new Error('Artifact path mismatch');
  const files = [path.join(artifactRoot, 'clamp.js'), path.join(artifactRoot, 'clamp.test.js'), path.join(__dirname, 'reliability-correctness-check.js')];
  const fingerprints = files.map(hash);
  const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', files[1], files[2]], { cwd: artifactRoot, env: { ...process.env, TIYE_T1_ARTIFACT_ROOT: artifactRoot }, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000, windowsHide: true });
  const testCount = Number(tests.stdout?.match(/^# tests (\d+)$/m)?.[1]);
  const skipped = Number(tests.stdout?.match(/^# skipped (\d+)$/m)?.[1]);
  const todo = Number(tests.stdout?.match(/^# todo (\d+)$/m)?.[1]);
  const unchanged = files.every((file, index) => hash(file) === fingerprints[index]);
  return { index: run.index, fingerprints, tests: testCount || 0, skipped, todo, testExitCode: tests.status, unchanged, passed: tests.status === 0 && testCount >= 11 && skipped === 0 && todo === 0 && unchanged };
}

function main() {
  fs.writeFileSync(validationPath, JSON.stringify({ passed: false, error: 'Validation did not finish' }, null, 2) + '\n');
  const evidence = JSON.parse(fs.readFileSync(source, 'utf8'));
  const summary = reliabilitySummary(evidence);
  if (!summary.complete) throw new Error('Complete ten-trial evidence required');
  const sourceHash = hash(source);
  const runs = evidence.runs.map(run => validateRun(run));
  const verifiedInitialReports = runs.filter(run => run.passed && evidence.runs.find(trial => trial.index === run.index).cli.initialCompletedAck).length;
  const verifiedReportsWithinBudget = runs.filter(run => run.passed).length;
  const unchanged = hash(source) === sourceHash;
  const validation = { recordedAt: new Date().toISOString(), scope: 'Ten identical terminal T1 trials on this member/model/Windows host; not full S2', sourceRecordedAt: evidence.recordedAt, sourceHash, runs, verifiedInitialReports, verifiedReportsWithinBudget, nudgeAttempts: summary.nudgeAttempts, nudgedRecoveryExercised: summary.nudgedRecoveries > 0, unchanged, passed: summary.reportingThresholdsMet && verifiedInitialReports >= 9 && verifiedReportsWithinBudget === 10 && unchanged };
  fs.writeFileSync(validationPath, JSON.stringify(validation, null, 2) + '\n');
  console.log(`[reliability-validation] ${validation.passed ? 'PASS' : 'FAIL'}; initial=${verifiedInitialReports}/10 budget=${verifiedReportsWithinBudget}/10; nudge attempts=${summary.nudgeAttempts}`);
  process.exitCode = validation.passed ? 0 : 1;
}
if (require.main === module) main();
module.exports = { validateRun };

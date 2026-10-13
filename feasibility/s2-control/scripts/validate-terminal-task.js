'use strict';
// Run only after reviewing the captured model-generated files. Hashes bind
// this validation to that exact round-trip evidence and those exact files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const evidenceDir = path.resolve(__dirname, '../evidence');
const validationPath = path.join(evidenceDir, 'terminal-task-validation.json');
// An interrupted or rejected validation must not leave an older PASS labeled
// as the current result.
fs.writeFileSync(validationPath, JSON.stringify({ recordedAt: new Date().toISOString(), passed: false, error: 'Validation did not finish' }, null, 2) + '\n');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = path.join(evidenceDir, 'terminal-task-latest.json');
const roundTrip = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!roundTrip.selectedConfigsUnchanged || roundTrip.runs.length !== 2 || !roundTrip.runs.every(run => run.roundTripPassed && run.taskFilesCaptured)) throw new Error('Verified terminal round trips required');
const files = ['t1-member-a/clamp.js', 't1-member-a/clamp.test.js', 't1-member-b/clamp.js', 't1-member-b/clamp.test.js', 't1-correctness.test.js'];
const fingerprints = Object.fromEntries(files.map(file => [file, hash(path.join(evidenceDir, file))]));
const sourceHash = hash(source);
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 't1-member-a/clamp.test.js', 't1-member-b/clamp.test.js', 't1-correctness.test.js'], { cwd: evidenceDir, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000, windowsHide: true });
const testCount = Number(tests.stdout?.match(/^# tests (\d+)$/m)?.[1]);
const unchanged = hash(source) === sourceHash && files.every(file => hash(path.join(evidenceDir, file)) === fingerprints[file]);
const validation = { recordedAt: new Date().toISOString(), scope: 'Two terminal T1 coding tasks and independent correctness; not S2.2 ten-run reliability', sourceRecordedAt: roundTrip.recordedAt, sourceHash, fingerprints, tests: testCount || 0, testExitCode: tests.status, unchanged, passed: tests.status === 0 && testCount === 22 && unchanged };
fs.writeFileSync(validationPath, JSON.stringify(validation, null, 2) + '\n');
console.log(`[task-validation] ${validation.passed ? 'PASS' : 'FAIL'} tests=${validation.tests}; evidence/terminal-task-validation.json`);
process.exitCode = validation.passed ? 0 : 1;

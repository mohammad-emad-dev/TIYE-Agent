'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { prompt } = require('./terminal-task');
const { PLANNED_RUNS, reliabilitySummary } = require('./reliability-summary');
const evidenceDir = path.resolve(__dirname, '../evidence');
const source = path.join(evidenceDir, 'reliability-latest.json');

async function main() {
  const beforeConfigs = configFingerprints();
  const evidence = { recordedAt: new Date().toISOString(), scope: 'Ten fresh terminal T1 sessions with identical wording and at most one conditional nudge; single member/model/host', member: 'member-a', model: 'opencode/muse-spark-1.3-contributor-free#xhigh', promptHash: crypto.createHash('sha256').update(prompt).digest('hex'), runs: [], selectedConfigsUnchanged: true, result: 'IN_PROGRESS' };
  fs.writeFileSync(path.join(evidenceDir, 'reliability-validation.json'), JSON.stringify({ passed: false, error: 'New measurement has not been independently validated' }, null, 2) + '\n');
  const save = () => { evidence.summary = reliabilitySummary(evidence); fs.writeFileSync(source, JSON.stringify(evidence, null, 2) + '\n'); };
  save();
  for (let index = 1; index <= PLANNED_RUNS; index++) {
    const captureName = `reliability/run-${String(index).padStart(2, '0')}`;
    console.log(`[reliability] starting ${index}/${PLANNED_RUNS}`);
    const run = await runMember('member-a', { terminalMode: true, serviceMode: true, captureName, allowNudge: true });
    evidence.runs.push({ index, captureName, ...run });
    evidence.selectedConfigsUnchanged = JSON.stringify(beforeConfigs) === JSON.stringify(configFingerprints());
    console.log(`[reliability] ${index}: initialReport=${run.cli?.initialCompletedAck === true} nudge=${run.cli?.nudgeUsed === true} roundTrip=${run.roundTripPassed}`);
    if (!run.fixtureStopped || !run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli.cleanup.jobVerified || !evidence.selectedConfigsUnchanged) evidence.stoppedReason = 'Infrastructure or cleanup unverified; further trials stopped';
    save();
    if (evidence.stoppedReason) break;
  }
  evidence.result = evidence.stoppedReason ? 'STOPPED' : 'AWAITING_CODE_REVIEW_AND_CORRECTNESS_TESTS';
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(`[reliability] ${evidence.summary.initialReports}/10 initial; ${evidence.summary.reportsWithinNudgeBudget}/10 within nudge budget; code validation pending`);
  process.exitCode = evidence.summary.reportingThresholdsMet ? 2 : 1;
}
main().catch(() => { console.error('[reliability] lifecycle failure; inspect saved evidence before resuming'); process.exitCode = 1; });

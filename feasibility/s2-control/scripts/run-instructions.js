'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { cases, questionCase, nudgeCase } = require('./instruction-cases');
const plans = cases.flatMap(task => [1, 2, 3].map(trial => ({ id: `${task.id}-${trial}`, task, trial }))).concat([{ id: questionCase.id, task: questionCase, trial: 1 }, { id: nudgeCase.id, task: nudgeCase, trial: 1 }]);
const evidenceDir = path.resolve(__dirname, '../evidence');
async function main() {
  const before = configFingerprints();
  const evidence = { recordedAt: new Date().toISOString(), scope: 'Three trials per instruction wording, one ask_leader task, and one induced-omission nudge control; separate from ten-run reliability', plans: plans.map(({ id, task, trial }) => ({ id, caseId: task.id, trial, promptHash: crypto.createHash('sha256').update(task.prompt).digest('hex') })), runs: [], selectedConfigsUnchanged: true, result: 'IN_PROGRESS' };
  const save = () => fs.writeFileSync(path.join(evidenceDir, 'instructions-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(evidenceDir, 'instructions-validation.json'), JSON.stringify({ passed: false, error: 'Measurement not yet validated' }, null, 2) + '\n');
  save();
  for (const plan of plans) {
    console.log(`[instructions] starting ${plan.id}`);
    const captureName = `instructions/${plan.id}`;
    const run = await runMember('member-a', { terminalMode: true, serviceMode: true, captureName, task: plan.task, allowNudge: plan.task === nudgeCase });
    evidence.runs.push({ id: plan.id, caseId: plan.task.id, index: evidence.runs.length + 1, captureName, ...run });
    evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
    console.log(`[instructions] ${plan.id}: roundTrip=${run.roundTripPassed} nudge=${run.cli?.nudgeUsed === true}`);
    if (!run.fixtureStopped || !run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli.cleanup.jobVerified || !evidence.selectedConfigsUnchanged) evidence.stoppedReason = 'Infrastructure or cleanup unverified; further trials stopped';
    save();
    if (evidence.stoppedReason) break;
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.result = evidence.stoppedReason ? 'STOPPED' : 'AWAITING_REVIEW_AND_VALIDATION';
  save();
  process.exitCode = evidence.stoppedReason ? 1 : 2;
}
main().catch(() => { console.error('[instructions] lifecycle failure; inspect saved evidence'); process.exitCode = 1; });

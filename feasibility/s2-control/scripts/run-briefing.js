'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { cases } = require('./briefing-cases');
const evidenceDir = path.resolve(__dirname, '../evidence');
async function main() {
  const before = configFingerprints();
  const evidence = { recordedAt: new Date().toISOString(), scope: 'First terminal briefing, one T1 task, then value-free recall query in three fresh sessions; short-session retention only', method: 'First typed terminal message; no persistent role config', plans: cases.map(task => ({ id: task.id, briefingHash: crypto.createHash('sha256').update(task.briefing.prompt).digest('hex'), recallHash: crypto.createHash('sha256').update(task.briefing.recallPrompt).digest('hex') })), runs: [], selectedConfigsUnchanged: true, result: 'IN_PROGRESS' };
  const save = () => fs.writeFileSync(path.join(evidenceDir, 'briefing-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(path.join(evidenceDir, 'briefing-validation.json'), JSON.stringify({ passed: false, error: 'Not yet validated' }, null, 2) + '\n');
  save();
  for (const task of cases) {
    console.log(`[briefing] starting ${task.id}`);
    const captureName = `briefing/${task.id}`;
    const run = await runMember('member-a', { terminalMode: true, serviceMode: true, captureName, task });
    evidence.runs.push({ id: task.id, index: evidence.runs.length + 1, captureName, ...run });
    evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
    console.log(`[briefing] ${task.id}: roundTrip=${run.roundTripPassed} recall=${run.cli?.recall?.matched === true}`);
    if (!run.fixtureStopped || !run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli.cleanup.jobVerified || !evidence.selectedConfigsUnchanged) evidence.stoppedReason = 'Infrastructure or cleanup unverified';
    save();
    if (evidence.stoppedReason) break;
  }
  evidence.result = evidence.stoppedReason ? 'STOPPED' : 'AWAITING_CODE_REVIEW_AND_VALIDATION';
  evidence.finishedAt = new Date().toISOString();
  save();
  process.exitCode = evidence.stoppedReason ? 1 : 2;
}
main().catch(() => { console.error('[briefing] lifecycle failure; inspect evidence'); process.exitCode = 1; });

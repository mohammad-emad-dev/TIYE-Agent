'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { permissionRunPassed } = require('./permission-evidence');

function validatedCases(measurement, expected) {
  if (!measurement?.passed || !measurement.selectedConfigsUnchanged || !Array.isArray(measurement.runs)
    || measurement.runs.length !== expected.length || new Set(measurement.runs.map(run => run.caseID)).size !== expected.length) throw new Error('capability evidence cohort incomplete');
  for (const caseID of expected) {
    const run = measurement.runs.find(candidate => candidate.caseID === caseID);
    if (!run?.passed || run.cli?.version !== '2.0.22' || !permissionRunPassed({ run, caseID })) throw new Error('capability evidence gate failed');
  }
}

function assessment({ controls, approvals, inventory }) {
  validatedCases(controls, ['allow-edit-control', 'auto-shell']);
  validatedCases(approvals, ['deny-edit', 'reject-shell', 'allow-once-shell']);
  if (typeof inventory?.version !== 'string' || !/(?:^|\s)v?2\.0\.22(?:\s|$)/.test(inventory.version)) throw new Error('capability inventory version mismatch');
  const shared = { osEnforcement: 'not-established', productGuarantee: false };
  const controlRef = '../evidence/permission-controls-latest.json';
  const approvalRef = '../evidence/approval-outcomes-latest.json';
  return {
    schemaVersion: 1, id: 'opencode', recordType: 'feasibility-permission-assessment', productionEligible: false,
    testedVersions: ['2.0.22'], environments: ['windows'],
    testedModel: { providerID: 'opencode', id: 'muse-spark-1.3-contributor-free', variant: 'xhigh' },
    delivery: 'Owned service session configured by API; prompts typed through Electron/xterm/node-pty; no --auto flag',
    fileAccess: {
      none: { ...shared, observedStatus: 'unverified', documentedNativeRules: ['read deny', 'edit deny', 'glob deny', 'grep deny'], providerCompatibility: 'unverified', evidence: [], limitation: 'No combined no-file-access profile tested; shell, plugins and other tools require separate controls' },
      readOnly: { ...shared, observedStatus: 'partial', documentedNativeRules: ['edit deny', 'plan agent with documented exception'], providerCompatibility: 'shell-ask profile ran', evidence: [approvalRef, '../evidence/permissions-latest.json'], limitation: 'Edit denial observed; no complete read-only profile or OS write containment proven. Approved shell commands can write files' },
      readWrite: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['edit allow'], providerCompatibility: 'observed-working', evidence: [controlRef, '../evidence/terminal-task-validation.json'], limitation: 'Paired allowed edit and earlier coding tasks; not arbitrary file access or a combined product profile' },
    },
    terminal: {
      off: { ...shared, observedStatus: 'blocked-for-tested-model', documentedNativeRules: ['shell deny'], providerCompatibility: 'historical-http-403-before-tool-execution', evidence: ['../evidence/tool-call-latest.json', '../RESULTS.md'], limitation: 'Rule is documented; denial enforcement cannot be inferred from a provider rejection. No recent shell-off retest or other model test' },
      ask: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['shell ask'], providerCompatibility: 'observed-working', evidence: [approvalRef, '../evidence/permissions-latest.json'], limitation: 'Pending request, reject and once observed through API; approval UI and persistent always decisions untested' },
      auto: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['shell allow', '--auto for non-denied requests'], providerCompatibility: 'observed-working', evidence: [controlRef], limitation: 'One exact harmless command under configured shell allow. --auto flag and unrestricted commands not exercised' },
    },
    fallback: { name: 'Separate worktree and ownership watcher', status: 'not-validated-in-S3', guarantee: 'detection, not OS containment' },
    remaining: ['Combined file/terminal profiles', 'File none', 'Guaranteed read-only isolation', 'Shell off compatibility', 'Approval UI and saved approvals', 'S2.5 error/crash/hang/resume signals', 'Other CLIs, models and WSL'],
  };
}

function main() {
  const root = path.resolve(__dirname, '..');
  const names = ['permission-controls-latest.json', 'approval-outcomes-latest.json', 'permission-options-latest.json'];
  const sources = names.map(name => fs.readFileSync(path.join(root, 'evidence', name)));
  const [controls, approvals, inventory] = sources.map(bytes => JSON.parse(bytes));
  const candidate = assessment({ controls, approvals, inventory });
  candidate.recordedAt = new Date().toISOString();
  candidate.evidenceHashes = Object.fromEntries(names.map((name, index) => [name, crypto.createHash('sha256').update(sources[index]).digest('hex')]));
  const target = path.join(root, 'capabilities/opencode-permissions.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(candidate, null, 2) + '\n');
  console.log('[capabilities] preliminary permission assessment; productionEligible=false');
}
if (require.main === module) main();
module.exports = { assessment };

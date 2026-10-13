'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { permissionRunPassed } = require('./permission-evidence');
const { reviewedVersion } = require('./reviewed-version');
const { sealedBytes } = require('./version-evidence');
const { deniedProfileMeasurementPassed } = require('./denied-profile-evidence');
const { terminalApprovalRunPassed } = require('./terminal-approval-evidence');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function validatedDeniedProfiles(measurement, version) {
  const expected = ['shell-off', 'file-deny-profile', 'targeted-read-deny', 'targeted-glob-deny', 'targeted-grep-deny'];
  if (version !== '2.0.28' || measurement?.expectedVersion !== version || !measurement.measurementComplete
    || !measurement.selectedConfigsUnchanged || measurement.stoppedReason || !Array.isArray(measurement.runs)
    || measurement.runs.length !== expected.length || new Set(measurement.runs.map(run => run.caseID)).size !== expected.length) throw new Error('Denied profile cohort incomplete or version mismatch');
  for (const caseID of expected) {
    const run = measurement.runs.find(candidate => candidate.caseID === caseID);
    if (!run?.measurementPassed || !deniedProfileMeasurementPassed(run) || !run.cli.completedQuiescent
      || ![run.profileHash, run.promptHash].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error('Denied profile measurement gate failed');
    const cli = run.cli;
    const native = cli.outcome === 'native-denial';
    const blocked = cli.outcome === 'provider-blocked';
    if (run.passed !== native || cli.nativeDenialObserved !== native || cli.providerBlockedObserved !== blocked
      || cli.toolCalls !== (native ? 1 : 0) || cli.expectedToolInputMatched !== native
      || (blocked ? cli.failure?.category !== 'provider.auth' || cli.failure?.httpStatus !== 403 : cli.failure !== null)) throw new Error('Denied profile outcome inconsistent');
  }
  const allNative = measurement.runs.every(run => run.passed);
  if (measurement.passed !== allNative || measurement.result !== (allNative ? 'PASS' : 'OBSERVED_WITH_LIMITS')) throw new Error('Denied profile aggregate inconsistent');
}

function validatedCases(measurement, expected, version) {
  if (!measurement?.passed || !measurement.selectedConfigsUnchanged || !Array.isArray(measurement.runs)
    || measurement.runs.length !== expected.length || new Set(measurement.runs.map(run => run.caseID)).size !== expected.length) throw new Error('capability evidence cohort incomplete');
  for (const caseID of expected) {
    const run = measurement.runs.find(candidate => candidate.caseID === caseID);
    if (!run?.passed || run.cli?.version !== version || (version === '2.0.28' && run.cli.serviceVersionAfterCleanup !== version)
      || !permissionRunPassed({ run, caseID })) throw new Error('capability evidence gate failed');
  }
}

function validatedTerminalApprovals(measurement, version) {
  const expected = ['reject-shell', 'allow-once-shell'];
  if (version !== '2.0.28' || measurement?.expectedVersion !== version || !measurement.passed || !measurement.selectedConfigsUnchanged
    || measurement.stoppedReason || !Array.isArray(measurement.runs) || measurement.runs.length !== expected.length
    || new Set(measurement.runs.map(run => run.caseID)).size !== expected.length) throw new Error('Terminal approval cohort incomplete or version mismatch');
  for (const caseID of expected) {
    const run = measurement.runs.find(candidate => candidate.caseID === caseID);
    if (!run?.passed || !terminalApprovalRunPassed(run)) throw new Error('Terminal approval evidence gate failed');
  }
}

function assessment({ controls, approvals, inventory, deniedProfiles, deniedProfilesHash, terminalApprovals, terminalApprovalsHash }) {
  const version = reviewedVersion(inventory?.version);
  validatedCases(controls, ['allow-edit-control', 'auto-shell'], version);
  validatedCases(approvals, ['deny-edit', 'reject-shell', 'allow-once-shell'], version);
  const shared = { osEnforcement: 'not-established', productGuarantee: false };
  const reference = `../evidence/versions/${version}/`;
  const controlRef = reference + 'permission-controls-latest.json';
  const approvalRef = reference + 'approval-outcomes-latest.json';
  const historicalOff = { version: '2.0.22', observedStatus: 'provider-rejected-before-tool-execution', evidence: ['../evidence/versions/2.0.22/tool-call-latest.json'] };
  const candidate = {
    schemaVersion: 1, id: 'opencode', recordType: 'feasibility-permission-assessment', productionEligible: false,
    testedVersions: [version], environments: ['windows'],
    testedModel: { providerID: 'opencode', id: 'muse-spark-1.3-contributor-free', variant: 'xhigh' },
    delivery: 'Owned service session configured by API; prompts typed through Electron/xterm/node-pty; no --auto flag',
    fileAccess: {
      none: { ...shared, observedStatus: 'unverified', documentedNativeRules: ['read deny', 'edit deny', 'glob deny', 'grep deny'], providerCompatibility: 'unverified', evidence: [], limitation: 'No combined no-file-access profile tested; shell, plugins and other tools require separate controls' },
      readOnly: { ...shared, observedStatus: 'partial', documentedNativeRules: ['edit deny'], providerCompatibility: 'shell-ask profile ran', evidence: [approvalRef], limitation: 'Edit denial observed; no complete read-only profile or OS write containment proven. Approved shell commands can write files' },
      readWrite: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['edit allow'], providerCompatibility: 'observed-working', evidence: [controlRef], limitation: 'Paired allowed edit only; coding reliability, arbitrary file access and combined product profiles require separate evidence' },
    },
    terminal: {
      off: { ...shared, observedStatus: version === '2.0.22' ? 'blocked-for-tested-model' : 'unverified-for-tested-version', documentedNativeRules: ['shell deny'],
        providerCompatibility: version === '2.0.22' ? 'historical-http-403-before-tool-execution' : 'not-revalidated',
        evidence: version === '2.0.22' ? historicalOff.evidence : [], historicalEvidence: [historicalOff],
        limitation: 'Historical provider rejection does not establish denial enforcement or shell-off compatibility on another version. No recent shell-off retest' },
      ask: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['shell ask'], providerCompatibility: 'observed-working', evidence: [approvalRef], limitation: 'Pending request, reject and once observed through API; approval UI and persistent always decisions untested' },
      auto: { ...shared, observedStatus: 'bounded-native-control-passed', documentedNativeRules: ['shell allow', '--auto for non-denied requests'], providerCompatibility: 'observed-working', evidence: [controlRef], limitation: 'One exact harmless command under configured shell allow. --auto flag and unrestricted commands not exercised' },
    },
    fallback: { name: 'Separate worktree and ownership watcher', status: 'not-validated-in-S3', guarantee: 'detection, not OS containment' },
    remaining: ['Combined file/terminal profiles', 'File none', 'Guaranteed read-only isolation', 'Shell off compatibility', 'Approval UI and saved approvals', 'S2.5 error/crash/hang/resume signals', 'Other CLIs, models and WSL'],
  };
  if (deniedProfiles) {
    validatedDeniedProfiles(deniedProfiles, version);
    if (deniedProfilesHash !== undefined && !/^[a-f0-9]{64}$/.test(deniedProfilesHash)) throw new Error('Supplemental hash invalid');
    const supplemental = deniedProfilesHash ? `../evidence/supplements/denied-profiles/${deniedProfilesHash}/${version}/denied-profiles.json` : '../evidence/denied-profiles-latest.json';
    const compatibility = run => run.cli.outcome === 'provider-blocked' ? 'http-403-before-tool-execution'
      : run.cli.outcome === 'native-denial' ? 'observed-native-denial' : 'response-without-tool-attempt';
    const shell = deniedProfiles.runs.find(run => run.caseID === 'shell-off');
    candidate.terminal.off = { ...candidate.terminal.off,
      observedStatus: shell.passed ? 'bounded-native-denial' : shell.cli.providerBlockedObserved ? 'blocked-for-tested-model' : 'unverified-for-tested-version',
      providerCompatibility: compatibility(shell), evidence: [supplemental],
      limitation: shell.passed ? 'One exact local command rejected; no general shell isolation established'
        : 'No shell tool attempt occurred. Provider failure or no attempt cannot establish native denial enforcement; shell-off compatibility remains open' };
    const fileProfile = deniedProfiles.runs.find(run => run.caseID === 'file-deny-profile');
    const targeted = deniedProfiles.runs.filter(run => run.caseID.startsWith('targeted-'));
    candidate.fileAccess.none = { ...candidate.fileAccess.none,
      observedStatus: targeted.some(run => run.passed) || fileProfile.passed ? 'partial-native-controls' : 'unverified',
      providerCompatibility: compatibility(fileProfile), evidence: [supplemental],
      observedControls: targeted.filter(run => run.passed).map(run => run.caseID),
      limitation: 'The combined read/edit/glob/grep deny profile did not qualify complete file none. Targeted denials apply only to the tested resources; shell, attachments, plugins and other access routes need separate controls' };
  }
  if (terminalApprovals) {
    validatedTerminalApprovals(terminalApprovals, version);
    if (terminalApprovalsHash !== undefined && !/^[a-f0-9]{64}$/.test(terminalApprovalsHash)) throw new Error('Terminal approval hash invalid');
    const terminalReference = terminalApprovalsHash ? `../evidence/supplements/terminal-approvals/${terminalApprovalsHash}/${version}/terminal-approvals.json` : '../evidence/terminal-approvals-latest.json';
    candidate.terminal.ask = { ...candidate.terminal.ask, evidence: [...candidate.terminal.ask.evidence, terminalReference],
      nativeTerminalUI: { observedStatus: 'bounded-native-decisions-passed', decisions: ['reject', 'once'],
        delivery: 'Programmatic Electron keyDown/keyUp through xterm.onData and node-pty; exact input bytes checked; parent observer prohibits API mutations',
        environment: 'OpenCode 2.0.28 observed palette and 120x38 terminal', evidence: [terminalReference] },
      limitation: 'API and native terminal reject/once observed for one exact command. Saved always decisions, other layouts/themes, foreground human interaction and accessibility remain untested' };
    candidate.remaining = candidate.remaining.map(item => item === 'Approval UI and saved approvals' ? 'Other approval UI layouts/themes and saved always approvals' : item);
  }
  return candidate;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const names = ['permission-controls-latest.json', 'approval-outcomes-latest.json', 'permission-options-latest.json'];
  const sources = names.map(name => fs.readFileSync(path.join(root, 'evidence', name)));
  const [controls, approvals, inventory] = sources.map(bytes => JSON.parse(bytes));
  const supplementalPath = path.join(root, 'evidence/denied-profiles-latest.json');
  const supplementalBytes = fs.existsSync(supplementalPath) ? fs.readFileSync(supplementalPath) : null;
  const deniedProfiles = supplementalBytes ? JSON.parse(supplementalBytes) : undefined;
  const terminalPath = path.join(root, 'evidence/terminal-approvals-latest.json');
  const terminalBytes = fs.existsSync(terminalPath) ? fs.readFileSync(terminalPath) : null;
  const terminalApprovals = terminalBytes ? JSON.parse(terminalBytes) : undefined;
  const candidate = assessment({ controls, approvals, inventory, deniedProfiles, deniedProfilesHash: supplementalBytes ? digest(supplementalBytes) : undefined,
    terminalApprovals, terminalApprovalsHash: terminalBytes ? digest(terminalBytes) : undefined });
  for (const [index, name] of names.entries()) {
    const archived = sealedBytes({ root: path.join(root, 'evidence/versions'), version: candidate.testedVersions[0], name });
    if (!archived.equals(sources[index])) throw new Error('Sealed evidence does not match current cohort');
  }
  if (supplementalBytes) {
    const hash = digest(supplementalBytes);
    const archived = sealedBytes({ root: path.join(root, 'evidence/supplements/denied-profiles', hash), version: candidate.testedVersions[0], name: 'denied-profiles.json' });
    if (!archived.equals(supplementalBytes)) throw new Error('Sealed supplemental evidence does not match current cohort');
  }
  if (terminalBytes) {
    const archived = sealedBytes({ root: path.join(root, 'evidence/supplements/terminal-approvals', digest(terminalBytes)), version: candidate.testedVersions[0], name: 'terminal-approvals.json' });
    if (!archived.equals(terminalBytes)) throw new Error('Sealed terminal approval evidence does not match current cohort');
  }
  candidate.recordedAt = new Date().toISOString();
  candidate.evidenceHashes = Object.fromEntries(names.map((name, index) => [name, crypto.createHash('sha256').update(sources[index]).digest('hex')]));
  if (supplementalBytes) candidate.evidenceHashes['denied-profiles.json'] = digest(supplementalBytes);
  if (terminalBytes) candidate.evidenceHashes['terminal-approvals.json'] = digest(terminalBytes);
  const target = path.join(root, 'capabilities/opencode-permissions.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(candidate, null, 2) + '\n');
  console.log('[capabilities] preliminary permission assessment; productionEligible=false');
}
if (require.main === module) main();
module.exports = { assessment };

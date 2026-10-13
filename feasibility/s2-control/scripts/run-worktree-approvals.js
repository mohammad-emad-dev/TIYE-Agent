'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { serviceApi, SERVICE_PERMISSIONS } = require('./service-cli');
const { closePrivate } = require('./persistent-cli');
const { taskDefinition, projectIdentity, savedRows, observePhase, chooseAlways, freshPhase, removeOwnedRules } = require('./run-saved-approvals');
const { ownedSavedRules } = require('./saved-approval-evidence');
const { worktreeLocationMatches, worktreeApprovalRunPassed } = require('./worktree-approval-evidence');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const controlCwd = path.resolve(__dirname, '../../..');

function git(cwd, args) {
  const response = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (response.status !== 0) throw new Error('owned worktree Git operation failed');
  return response.stdout.trim();
}

function ownedTemp(cwd, prefix) {
  const resolved = fs.realpathSync(cwd);
  if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith(prefix)) throw new Error('worktree temp boundary invalid');
  return resolved;
}

function registeredWorktrees(root) {
  return git(root, ['worktree', 'list', '--porcelain']).split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => path.resolve(line.slice(9)).toLowerCase());
}

function createWorktree(root, ownership) {
  ownership.root = ownedTemp(root, 'tiye-s2-model-');
  ownership.worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-worktree-scope-'));
  ownedTemp(ownership.worktree, 'tiye-s2-worktree-scope-');
  // Recovery coordinates are ignored Git metadata; no credential content is copied.
  fs.writeFileSync(path.join(controlCwd, '.git/s2-worktree-owned.json'), JSON.stringify({ root: ownership.root, worktree: ownership.worktree }));
  git(root, ['worktree', 'add', '--detach', ownership.worktree, 'HEAD']);
  ownership.registered = true;
  for (const name of ['protected.txt', 'opencode.json']) fs.copyFileSync(path.join(root, name), path.join(ownership.worktree, name));
  return ownership.worktree;
}

function gitTopology(ownership) {
  const rootCommon = fs.realpathSync(path.resolve(ownership.root, git(ownership.root, ['rev-parse', '--git-common-dir'])));
  const worktreeCommon = fs.realpathSync(path.resolve(ownership.worktree, git(ownership.worktree, ['rev-parse', '--git-common-dir'])));
  const registered = registeredWorktrees(ownership.root);
  return { gitCommonDirectoryMatched: rootCommon.toLowerCase() === worktreeCommon.toLowerCase() && rootCommon.toLowerCase() === path.join(ownership.root, '.git').toLowerCase(),
    gitHeadMatched: git(ownership.root, ['rev-parse', 'HEAD']) === git(ownership.worktree, ['rev-parse', 'HEAD']),
    registryMatched: registered.length === 2 && [ownership.root, ownership.worktree].every(cwd => registered.includes(path.resolve(cwd).toLowerCase())) };
}

async function nativeWorktreeIdentity(ownership, evidence) {
  const location = await serviceApi(controlCwd, 'GET', `/api/location?location[directory]=${encodeURIComponent(ownership.worktree)}`);
  if (!worktreeLocationMatches({ location, root: ownership.root, worktree: ownership.worktree })) throw new Error('native worktree location unqualified');
  evidence.worktreeLocationConfirmed = true;
  evidence.projectDirectoryIsRoot = path.resolve(location.project.directory).toLowerCase() === ownership.root.toLowerCase();
  return location.project.id;
}

async function checkWorktreeFiles(ownership, evidence) {
  const cwd = ownership.worktree;
  evidence.worktreeProtectedUnchanged = fs.readFileSync(path.join(cwd, 'protected.txt')).equals(fs.readFileSync(path.join(ownership.root, 'protected.txt')));
  const marker = path.join(cwd, 'approval-marker.txt');
  evidence.worktreeMarkerAfterCleanupMatched = evidence.sharedNativeProject ? fs.existsSync(marker) && fs.readFileSync(marker).equals(Buffer.from('approved')) : !fs.existsSync(marker);
  const changed = git(cwd, ['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/).map(line => line.slice(3)).sort();
  const expected = ['opencode.json', 'protected.txt', ...(evidence.sharedNativeProject ? ['approval-marker.txt'] : [])].sort();
  evidence.worktreeFileScopeMatched = JSON.stringify(changed) === JSON.stringify(expected);
}

async function removeWorktree(ownership, evidence) {
  if (!ownership.worktree) { ownership.worktreeRemoved = true; return; }
  const root = ownedTemp(ownership.root, 'tiye-s2-model-');
  const cwd = ownedTemp(ownership.worktree, 'tiye-s2-worktree-scope-');
  const sessions = (await serviceApi(controlCwd, 'GET', `/api/session?directory=${encodeURIComponent(cwd)}`)).data;
  if (!Array.isArray(sessions) || sessions.length) throw new Error('worktree sessions remain');
  await serviceApi(controlCwd, 'DELETE', `/api/debug/location?location[directory]=${encodeURIComponent(cwd)}`);
  const loaded = await serviceApi(controlCwd, 'GET', '/api/debug/location');
  if (!Array.isArray(loaded) || loaded.some(location => path.resolve(location.directory).toLowerCase() === cwd.toLowerCase())) throw new Error('worktree location remains');
  const registry = registeredWorktrees(root);
  if (ownership.registered) {
    if (registry.length !== 2 || !registry.includes(cwd.toLowerCase()) || !gitTopology(ownership).gitCommonDirectoryMatched) throw new Error('worktree removal ownership unverified');
    git(root, ['worktree', 'remove', '--force', cwd]);
  } else {
    if (registry.some(directory => directory !== root.toLowerCase())) throw new Error('unexpected worktree registry');
    fs.rmSync(cwd, { recursive: true, maxRetries: 10, retryDelay: 200 });
  }
  const remaining = registeredWorktrees(root);
  ownership.worktreeRemoved = !fs.existsSync(cwd) && remaining.length === 1 && remaining[0] === root.toLowerCase();
  evidence.worktreeRemoved = ownership.worktreeRemoved;
  evidence.gitRegistryClean = remaining.length === 1 && remaining[0] === root.toLowerCase();
  if (!ownership.worktreeRemoved) throw new Error('owned worktree remains');
}

async function observe(request, ownership) {
  const evidence = { parentPermissionReplies: 0, worktreePhases: [], savedRuleRemoved: false };
  try {
    ownership.projectID = await projectIdentity(request.cwd);
    createWorktree(request.cwd, ownership);
    const topology = gitTopology(ownership);
    Object.assign(evidence, topology);
    if (!topology.gitCommonDirectoryMatched || !topology.gitHeadMatched || !topology.registryMatched) throw new Error('Git worktree topology unverified');
    const worktreeID = await nativeWorktreeIdentity(ownership, evidence);
    evidence.sharedNativeProject = worktreeID === ownership.projectID;
    evidence.savedBaselinesEmpty = (await savedRows(ownership.projectID)).length === 0 && (await savedRows(worktreeID)).length === 0;
    if (!evidence.savedBaselinesEmpty) throw new Error('worktree saved baselines not empty');
    const pending = (await observePhase(request, { name: 'seed-pending', outcome: 'pending', marker: null })).snapshot.request;
    ownership.proposed = pending.save;
    if (!Array.isArray(ownership.proposed) || !ownership.proposed.length || ownership.proposed.some(pattern => typeof pattern !== 'string')) throw new Error('worktree proposed saved pattern invalid');
    await chooseAlways(request, pending, evidence, ownership);
    evidence.worktreePhases.push((await observePhase(request, { name: 'seed-always', outcome: 'completed', marker: 'approved' })).evidence);
    const rows = await savedRows(ownership.projectID);
    evidence.savedRuleOwned = ownedSavedRules({ rows, ...ownership });
    if (!evidence.savedRuleOwned) throw new Error('worktree saved rows unqualified');
    evidence.savedRuleCount = rows.length; evidence.proposedPatternHashes = ownership.proposed.map(hash);
    const identity = () => nativeWorktreeIdentity(ownership, evidence);
    const marker = evidence.sharedNativeProject ? 'approved' : null;
    evidence.worktreePhases.push(await freshPhase(ownership.worktree, worktreeID, { name: 'worktree-reuse', outcome: evidence.sharedNativeProject ? 'completed' : 'pending', marker, projectIdentity: identity }));
    evidence.savedRulePresentBeforeDeny = ownedSavedRules({ rows: await savedRows(ownership.projectID), ...ownership });
    if (!evidence.savedRulePresentBeforeDeny) throw new Error('worktree saved row disappeared');
    evidence.worktreePhases.push(await freshPhase(ownership.worktree, worktreeID, { name: 'worktree-deny', outcome: 'denied', marker, projectIdentity: identity }));
    await removeOwnedRules(ownership);
    evidence.worktreePhases.push(await freshPhase(ownership.worktree, worktreeID, { name: 'worktree-revoked', outcome: 'pending', marker, projectIdentity: identity }));
    evidence.worktreePhases.push(await freshPhase(request.cwd, ownership.projectID, { name: 'root-revoked', outcome: 'pending', marker: 'approved' }));
    if ((await savedRows(worktreeID)).length) throw new Error('worktree saved rows remain after revoke');
    await checkWorktreeFiles(ownership, evidence);
  } catch { evidence.error = 'worktree approval observation failed'; }
  finally {
    try { await removeOwnedRules(ownership); evidence.savedRuleRemoved = ownership.rulesRemoved || !ownership.approvalSent; }
    catch { evidence.error = 'worktree saved-rule cleanup failed'; }
    try { evidence.originalClientCleanup = await closePrivate(request.state); }
    catch { evidence.error = 'worktree original-client cleanup failed'; }
    try { await removeWorktree(ownership, evidence); }
    catch { evidence.error = 'worktree removal failed'; }
  }
  return evidence;
}

async function main() {
  const before = configFingerprints();
  if ((await serviceApi(controlCwd, 'GET', '/api/info')).version !== '2.0.28') throw new Error('worktree approvals require reviewed 2.0.28');
  const names = ['run-worktree-approvals.js', 'worktree-approval-evidence.js', 'run-saved-approvals.js', 'saved-approval-evidence.js', 'run-tool-probe.js', 'service-cli.js', 'terminal-client.js', 'terminal-main.js', 'terminal-renderer.js', 'terminal-preload.js', 'terminal-ui.js', 'terminal-approval-evidence.js', 'approval-evidence.js', 'persistent-cli.js', 'service-quiescence.js', 'recovery-evidence.js', 'terminal-task.js'];
  const measurement = { scope: 'Native saved-approval scope across one root and detached Git worktree, worktree deny and revocation in both locations; not per-member or OS containment qualification', recordedAt: new Date().toISOString(), expectedVersion: '2.0.28',
    sourceHashes: Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])) };
  const ownership = { approvalSent: false, rulesRemoved: false, worktreeRemoved: false };
  const task = { ...taskDefinition, kind: 'permission', caseID: 'worktree-always', permissions: SERVICE_PERMISSIONS, expectedMarker: 'approved',
    initialCommitMessage: `TIYE worktree approvals ${crypto.randomUUID()}`, verifyOwnedCleanup: () => (!ownership.approvalSent || ownership.rulesRemoved) && ownership.worktreeRemoved,
    observe: request => observe(request, ownership) };
  measurement.run = await runMember('member-a', { terminalMode: true, task });
  measurement.run.passed = worktreeApprovalRunPassed(measurement.run);
  measurement.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  measurement.passed = measurement.run.passed && measurement.selectedConfigsUnchanged;
  measurement.result = measurement.passed ? 'OBSERVED_SHARED_PROJECT_SCOPE' : 'PARTIAL_OR_FAILED';
  if (measurement.passed && !measurement.run.cli.sharedNativeProject) measurement.result = 'OBSERVED_SEPARATE_PROJECT_SCOPE';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/worktree-approvals-latest.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(`[worktree-approvals] ${measurement.result}`); process.exitCode = measurement.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[worktree-approvals] lifecycle failure'); process.exitCode = 1; });

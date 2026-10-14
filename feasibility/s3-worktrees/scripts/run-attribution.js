'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createWorktreeLifecycle, git } = require('./worktree-lifecycle');
const { initialize, rootState, removeTemp } = require('./run-basics');
const { attributionEnvironment, attributionGit, readCommit, commitMatches } = require('./attribution-git');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function attributionPassed(record) {
  return Boolean(!record.error && record.worktreesCreated === 3 && record.childCommitMatched && record.engineCommitMatched
    && record.rawCommitMissingTrailerRejected && record.duplicateTrailerRejected && record.authorOverrideRejected
    && record.memberCommitsPreserved && record.mergeParentsMatched && record.mergeIdentityMatched && record.mergedFilesMatched
    && record.originalRootUnchanged && record.worktreesRemoved === 3 && record.registryRootOnly && record.rootTempRemoved && record.baseTempRemoved
    && record.identities && commitMatches(record.childCommit,record.identities.a) && commitMatches(record.engineCommit,record.identities.b)
    && record.mergeCommits?.length === 2 && record.mergeCommits.every(commit=>commitMatches(commit,record.identities.engine)));
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-attribution-root-'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-attribution-worktrees-'));
  const record = { recordedAt: new Date().toISOString(), scope: 'Native Git metadata through a Node child and engine fixture, trailer rejection and non-fast-forward integration merges; no provider CLI attribution or anti-spoofing guarantee',
    platform: process.platform, node: process.version, git: git(root, ['--version']).output,
    sourceHashes: Object.fromEntries(['run-attribution.js','attribution-git.js','run-basics.js','worktree-lifecycle.js','../fixtures/member-commit.cjs'].map(name => [name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    nativeCliAttributionQualified: false, identityEnforced: false, fullS3Qualified: false, productionEligible: false, worktreesRemoved: 0 };
  let lifecycle, original;
  try {
    initialize(root,base); original = rootState(root);
    lifecycle = createWorktreeLifecycle({repository:root,base});
    const integration = lifecycle.create({name:'integration',branch:'codex/s3-attribution-integration'});
    const a = lifecycle.create({name:'member-a',branch:'codex/s3-attribution-a'});
    const b = lifecycle.create({name:'member-b',branch:'codex/s3-attribution-b'});
    record.worktreesCreated = lifecycle.owned().length;
    const sessionId = crypto.randomUUID();
    const identityA = {memberId:'member-a',memberName:'Fixture Member A',sessionId};
    const identityB = {memberId:'member-b',memberName:'Fixture Member B',sessionId};
    const engine = {memberId:'integration',memberName:'TIYE Fixture Integration',sessionId};
    record.identities = {a:identityA,b:identityB,engine};
    lifecycle.validate(a); fs.writeFileSync(path.join(a,'member-a.txt'),'attributed member a\n');
    const child = spawnSync(process.execPath,[path.resolve(__dirname,'../fixtures/member-commit.cjs'),'member-a.txt',sessionId],
      {cwd:a,env:attributionEnvironment(identityA),windowsHide:true,stdio:'ignore',timeout:45000});
    if (child.error || child.status !== 0) throw new Error('attribution child failed');
    const idA = git(a,['rev-parse','HEAD']).output;
    record.childCommit = readCommit(a,idA,identityA); record.childCommitMatched = commitMatches(record.childCommit,identityA);
    lifecycle.validate(b); fs.writeFileSync(path.join(b,'member-b.txt'),'attributed member b\n');
    attributionGit(b,['add','--','member-b.txt'],identityB);
    attributionGit(b,['commit','--quiet','-m','Fixture engine fallback','--trailer','Tiye-Session: '+sessionId],identityB);
    const idB = git(b,['rev-parse','HEAD']).output;
    record.engineCommit = readCommit(b,idB,identityB); record.engineCommitMatched = commitMatches(record.engineCommit,identityB);
    const initial = git(integration,['rev-parse','HEAD']).output;
    lifecycle.validate(integration);
    attributionGit(integration,['merge','--no-ff','-m',`Integrate fixture member A\n\nTiye-Session: ${sessionId}`,idA],engine);
    const firstMerge = git(integration,['rev-parse','HEAD']).output;
    attributionGit(integration,['merge','--no-ff','-m',`Integrate fixture member B\n\nTiye-Session: ${sessionId}`,idB],engine);
    const secondMerge = git(integration,['rev-parse','HEAD']).output;
    record.mergeCommits = [readCommit(integration,firstMerge,engine),readCommit(integration,secondMerge,engine)];
    record.mergeParentsMatched = JSON.stringify(record.mergeCommits.map(commit=>commit.parents)) === JSON.stringify([[initial,idA],[firstMerge,idB]]);
    record.mergeIdentityMatched = record.mergeCommits.every(commit=>commitMatches(commit,engine));
    for (const id of [idA,idB]) attributionGit(integration,['merge-base','--is-ancestor',id,secondMerge],engine);
    record.memberCommitsPreserved = JSON.stringify(readCommit(integration,idA,identityA))===JSON.stringify(record.childCommit)
      && JSON.stringify(readCommit(integration,idB,identityB))===JSON.stringify(record.engineCommit);
    record.mergedFilesMatched = fs.readFileSync(path.join(integration,'member-a.txt'),'utf8')==='attributed member a\n'
      && fs.readFileSync(path.join(integration,'member-b.txt'),'utf8')==='attributed member b\n';
    // Negative commits stay on the disposable member branch and are never merged.
    attributionGit(a,['commit','--allow-empty','--quiet','-m','Raw member commit without trailer'],identityA);
    record.rawCommit = readCommit(a,git(a,['rev-parse','HEAD']).output,identityA);
    record.rawCommitMissingTrailerRejected = record.rawCommit.sessions.length===0 && !commitMatches(record.rawCommit,identityA);
    attributionGit(a,['commit','--allow-empty','--quiet','-m',`Duplicate trailer\n\nTiye-Session: ${sessionId}\nTiye-Session: different-session`],identityA);
    record.duplicateCommit = readCommit(a,git(a,['rev-parse','HEAD']).output,identityA);
    record.duplicateTrailerRejected = record.duplicateCommit.sessions.length===2 && !commitMatches(record.duplicateCommit,identityA);
    attributionGit(a,['commit','--allow-empty','--quiet','--author','Different Fixture <different@tiye.local>','-m','Override member author','--trailer','Tiye-Session: '+sessionId],identityA);
    record.overrideCommit = readCommit(a,git(a,['rev-parse','HEAD']).output,identityA);
    record.authorOverrideRejected = record.overrideCommit.authorName==='Different Fixture' && !commitMatches(record.overrideCommit,identityA);
  } catch { record.error = 'attribution observation failed'; }
  finally {
    try {
      if (lifecycle) {
        for (const entry of lifecycle.owned().reverse()) { lifecycle.remove(entry.directory); record.worktreesRemoved++; }
        const entries = lifecycle.registry();
        record.registryRootOnly = entries.length===1 && path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();
      }
      if (!record.registryRootOnly) throw new Error('attribution registry cleanup unverified');
      record.originalRootUnchanged = original && JSON.stringify(rootState(root))===JSON.stringify(original);
      record.baseTempRemoved = removeTemp(base,'tiye-s3-attribution-worktrees-');
      record.rootTempRemoved = removeTemp(root,'tiye-s3-attribution-root-');
    } catch { record.error = 'attribution owned cleanup failed'; }
  }
  record.passed = attributionPassed(record); record.result = record.passed ? 'ATTRIBUTION_BASELINE_PASS_S3_PARTIAL' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname,'../evidence/attribution-latest.json'),JSON.stringify(record,null,2)+'\n');
  console.log('[s3-attribution] '+record.result); process.exitCode=record.passed?0:2;
}
if (require.main===module) main();
module.exports = {attributionPassed};

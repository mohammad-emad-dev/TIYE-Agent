'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createWorktreeLifecycle, git } = require('./worktree-lifecycle');
const { node, treeFiles, rootState, initialize, cleanupArtifacts, removeTemp } = require('./run-basics');
const { unlinkOwnedDependencyLink } = require('./dependency-link');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function install(directory, npmCli, cache) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--global=false', '--install-links', '--cache', cache],
    { cwd: directory, windowsHide: true, encoding: 'utf8', timeout: 45000, maxBuffer: 128000, env: { ...process.env, CI: 'true', npm_config_update_notifier: 'false' } });
  if (result.error || !Number.isInteger(result.status)) throw new Error('dependency install execution unverified');
  return { status: result.status, elapsedMs: Date.now() - started };
}

function dependencyState(directory) {
  const modules = path.join(directory, 'node_modules');
  return { manifest: hash(fs.readFileSync(path.join(directory, 'package.json'))),
    lock: fs.existsSync(path.join(directory, 'package-lock.json')) ? hash(fs.readFileSync(path.join(directory, 'package-lock.json'))) : null,
    files: fs.existsSync(modules) ? treeFiles(modules) : null };
}

function addDependency(directory) {
  const target = path.join(directory, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(target));
  manifest.dependencies['extra-helper'] = 'file:vendor/extra-helper';
  fs.writeFileSync(target, JSON.stringify(manifest) + '\n');
}

function dependenciesPassed(record) {
  return Boolean(!record.error && record.worktreesCreated === 4 && record.cacheConfiguredMatched && record.baselineInstallsPassed
    && record.privateModuleDirectoriesDistinct && record.sharedCacheMutationInstall?.status === 0 && record.extraDependencyWorksPrivately
    && record.privateDonorUnchanged && record.extraDependencyAbsentInDonor && record.junctionCreated && record.borrowedHelperWorks
    && record.junctionInstallObserved && ['link-replaced-with-private-install','shared-donor-mutated','install-failed-link-preserved','install-failed-link-replaced','link-preserved-donor-unchanged'].includes(record.junctionOutcome)
    && Number.isInteger(record.junctionMutationInstall?.status)
    && (record.junctionMutationInstall.status !== 0 || record.borrowerExtraDependencyWorks === true)
    && (record.junctionOutcome !== 'link-replaced-with-private-install' || (record.junctionMutationInstall.status === 0
      && record.borrowerPrivateAfterInstall === true && record.junctionStillPresentAfterInstall === false
      && record.donorChangedByLinkedInstall === false && record.extraDependencyVisibleInDonor === false
      && record.linkRemovalMethod === 'already-replaced-by-npm'))
    && record.junctionCleanupVerified && record.donorUnchangedByUnlink && record.originalRootUnchanged
    && record.worktreesRemoved === 4 && record.registryRootOnly && record.baseTempRemoved && record.rootTempRemoved);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-deps-root-'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-deps-worktrees-'));
  const record = { recordedAt: new Date().toISOString(), scope: 'Offline local shared npm cache versus writable node_modules junction, including one member dependency addition; no general performance or isolation guarantee',
    platform: process.platform, node: process.version, git: git(root,['--version']).output,
    sourceHashes: Object.fromEntries(['run-dependencies.js','dependency-link.js','worktree-lifecycle.js','run-basics.js'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    directSharedModulesIsolated: false, genericSharedDependenciesQualified: false, fullS3Qualified: false, productionEligible: false, worktreesRemoved: 0 };
  let lifecycle, original, donor, borrower;
  try {
    initialize(root,base);
    fs.mkdirSync(path.join(root,'vendor/extra-helper'));
    fs.writeFileSync(path.join(root,'vendor/extra-helper/package.json'),'{"name":"extra-helper","version":"1.0.0","main":"index.js"}\n');
    fs.writeFileSync(path.join(root,'vendor/extra-helper/index.js'),'module.exports = value => value * 2;\n');
    git(root,['add','--','vendor/extra-helper']); git(root,['commit','--quiet','-m','Fixture extra local package']);
    original = rootState(root);
    lifecycle = createWorktreeLifecycle({repository:root,base});
    donor = lifecycle.create({name:'cache-a',branch:'codex/s3-cache-a'});
    const privateB = lifecycle.create({name:'cache-b',branch:'codex/s3-cache-b'});
    borrower = lifecycle.create({name:'linked-c',branch:'codex/s3-linked-c'});
    const separateD = lifecycle.create({name:'separate-d',branch:'codex/s3-separate-d'});
    record.worktreesCreated = lifecycle.owned().length;
    const npmCli = path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    if (!fs.existsSync(npmCli)) throw new Error('dependency npm CLI unavailable');
    record.npm = node(donor,[npmCli,'--version']);
    const sharedCache = path.join(base,'shared-cache');
    record.cacheConfiguredMatched = path.resolve(node(donor,[npmCli,'config','get','cache','--cache',sharedCache])).toLowerCase() === path.resolve(sharedCache).toLowerCase();
    record.coldSharedCacheInstall = install(donor,npmCli,sharedCache);
    record.warmSharedCacheInstall = install(privateB,npmCli,sharedCache);
    record.separateCacheInstall = install(separateD,npmCli,path.join(base,'separate-cache'));
    record.baselineInstallsPassed = [record.coldSharedCacheInstall,record.warmSharedCacheInstall,record.separateCacheInstall].every(result=>result.status===0);
    if (!record.baselineInstallsPassed) throw new Error('baseline dependency install failed');
    for (const directory of [donor,privateB,separateD]) node(directory,['--test']);
    record.privateModuleDirectoriesDistinct = fs.realpathSync(path.join(donor,'node_modules')).toLowerCase() !== fs.realpathSync(path.join(privateB,'node_modules')).toLowerCase();
    record.baselineLogicalBytes = Object.fromEntries([['donor',donor],['privateB',privateB],['separateD',separateD]].map(([name,directory])=>[name,treeFiles(path.join(directory,'node_modules')).reduce((total,file)=>total+file.bytes,0)]));
    const baselineDonor = dependencyState(donor);
    addDependency(privateB); record.sharedCacheMutationInstall = install(privateB,npmCli,sharedCache);
    if (record.sharedCacheMutationInstall.status!==0) throw new Error('private dependency addition failed');
    node(privateB,['-e',"require('node:assert/strict').equal(require('./node_modules/extra-helper')(3),6)"]);
    record.extraDependencyWorksPrivately = true;
    record.privateDonorUnchanged = JSON.stringify(dependencyState(donor)) === JSON.stringify(baselineDonor);
    record.extraDependencyAbsentInDonor = !fs.existsSync(path.join(donor,'node_modules/extra-helper'));
    lifecycle.validate(donor); lifecycle.validate(borrower);
    fs.symlinkSync(path.join(donor,'node_modules'),path.join(borrower,'node_modules'),'junction');
    record.junctionCreated = fs.lstatSync(path.join(borrower,'node_modules')).isSymbolicLink()
      && fs.realpathSync(path.join(borrower,'node_modules')).toLowerCase() === fs.realpathSync(path.join(donor,'node_modules')).toLowerCase();
    node(borrower,['-e',"require('node:assert/strict').equal(require('./node_modules/local-helper')(2),3)"]);
    record.borrowedHelperWorks = true;
    const beforeLinkedInstall = dependencyState(donor);
    addDependency(borrower); record.junctionMutationInstall = install(borrower,npmCli,sharedCache);
    record.junctionInstallObserved = true;
    record.junctionStillPresentAfterInstall = fs.lstatSync(path.join(borrower,'node_modules'),{throwIfNoEntry:false})?.isSymbolicLink() === true;
    if (record.junctionMutationInstall.status === 0) {
      node(borrower,['-e',"require('node:assert/strict').equal(require('./node_modules/extra-helper')(3),6)"]);
      record.borrowerExtraDependencyWorks = true;
      if (!record.junctionStillPresentAfterInstall) {
        const modules = fs.realpathSync(path.join(borrower,'node_modules'));
        record.borrowerPrivateAfterInstall = path.dirname(modules).toLowerCase() === fs.realpathSync(borrower).toLowerCase();
        record.borrowerLogicalBytesAfterInstall = treeFiles(modules).reduce((total,file)=>total+file.bytes,0);
        if (!record.borrowerPrivateAfterInstall) throw new Error('replacement modules not private');
      }
    }
    record.donorChangedByLinkedInstall = JSON.stringify(dependencyState(donor)) !== JSON.stringify(beforeLinkedInstall);
    record.extraDependencyVisibleInDonor = fs.existsSync(path.join(donor,'node_modules/extra-helper'));
    record.junctionOutcome = record.donorChangedByLinkedInstall ? 'shared-donor-mutated'
      : record.junctionMutationInstall.status!==0 ? (record.junctionStillPresentAfterInstall?'install-failed-link-preserved':'install-failed-link-replaced')
      : record.junctionStillPresentAfterInstall ? 'link-preserved-donor-unchanged' : 'link-replaced-with-private-install';
    const afterLinkedInstall = dependencyState(donor);
    if (record.junctionStillPresentAfterInstall) unlinkOwnedDependencyLink({lifecycle,borrower,donor});
    record.linkRemovalMethod = record.junctionStillPresentAfterInstall ? 'verified-owned-unlink' : 'already-replaced-by-npm';
    record.junctionCleanupVerified = fs.lstatSync(path.join(borrower,'node_modules'),{throwIfNoEntry:false})?.isSymbolicLink() !== true;
    record.donorUnchangedByUnlink = JSON.stringify(dependencyState(donor)) === JSON.stringify(afterLinkedInstall);
    record.originalRootUnchanged = JSON.stringify(rootState(root)) === JSON.stringify(original);
  } catch { record.error = 'dependency comparison observation failed'; }
  finally {
    try {
      if (lifecycle) {
        if (borrower && donor && fs.lstatSync(path.join(borrower,'node_modules'),{throwIfNoEntry:false})?.isSymbolicLink()) unlinkOwnedDependencyLink({lifecycle,borrower,donor});
        for (const entry of lifecycle.owned().reverse()) {
          lifecycle.validate(entry.directory); cleanupArtifacts(lifecycle,entry.directory);
          git(entry.directory,['restore','--source=HEAD','--','package.json']);
          lifecycle.remove(entry.directory); record.worktreesRemoved++;
        }
        const registered = lifecycle.registry();
        record.registryRootOnly = registered.length===1 && path.resolve(registered[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();
      }
      if (!record.registryRootOnly) throw new Error('dependency registry cleanup unverified');
      if (original) record.originalRootUnchanged = JSON.stringify(rootState(root))===JSON.stringify(original);
      record.baseTempRemoved = removeTemp(base,'tiye-s3-deps-worktrees-'); record.rootTempRemoved = removeTemp(root,'tiye-s3-deps-root-');
    } catch { record.error = 'dependency owned cleanup failed'; }
  }
  record.passed = dependenciesPassed(record); record.result = record.passed?'COMPARISON_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';
  fs.mkdirSync(path.resolve(__dirname,'../evidence'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,'../evidence/dependencies-latest.json'),JSON.stringify(record,null,2)+'\n');
  console.log(`[s3-dependencies] ${record.result}`); process.exitCode=record.passed?0:2;
}
if(require.main===module)main().catch(()=>{console.error('[s3-dependencies] lifecycle failure');process.exitCode=1;});
module.exports={dependenciesPassed};

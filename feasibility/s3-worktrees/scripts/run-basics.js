'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createWorktreeLifecycle, git } = require('./worktree-lifecycle');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function node(cwd, args, timeout = 20000) {
  const result = spawnSync(process.execPath, args, { cwd, windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 128000,
    env: { ...process.env, CI: 'true', npm_config_update_notifier: 'false' } });
  if (result.error || result.status !== 0) throw new Error('fixture Node operation failed');
  return result.stdout.trim();
}

function treeFiles(directory) {
  const files = [];
  for (const name of fs.readdirSync(directory).sort()) {
    if (name === '.git') continue;
    const target = path.join(directory, name), stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error('fixture tree contains a link');
    if (stat.isDirectory()) files.push(...treeFiles(target).map(file => ({ ...file, name: name + '/' + file.name })));
    else if (stat.isFile()) files.push({ name, bytes: stat.size, hash: hash(fs.readFileSync(target)) });
    else throw new Error('fixture tree entry unsupported');
  }
  return files;
}

function rootState(root) {
  return { status: git(root, ['status', '--porcelain', '--untracked-files=all']).output,
    branch: git(root, ['symbolic-ref', 'HEAD']).output, head: git(root, ['rev-parse', 'HEAD']).output,
    files: treeFiles(root), index: hash(fs.readFileSync(path.join(root, '.git/index'))) };
}

function initialize(root, base) {
  fs.mkdirSync(path.join(root, 'vendor/local-helper'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test')); fs.mkdirSync(path.join(base, 'no-hooks'));
  const files = {
    'package.json': JSON.stringify({ name: 'tiye-s3-fixture', version: '1.0.0', private: true, dependencies: { 'local-helper': 'file:vendor/local-helper' } }) + '\n',
    '.gitattributes': '* text eol=lf\n', '.gitignore': 'node_modules/\n',
    'vendor/local-helper/package.json': '{"name":"local-helper","version":"1.0.0","main":"index.js"}\n',
    'vendor/local-helper/index.js': 'module.exports = value => value + 1;\n',
    'test/setup.test.cjs': "const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');test('local dependency and copied settings',()=>{assert.equal(require('local-helper')(2),3);if(fs.existsSync('local-settings.json'))assert.equal(JSON.parse(fs.readFileSync('local-settings.json')).mode,'fixture');});\n",
    'member-a.txt': 'original a\n', 'member-b.txt': 'original b\n', 'shared.txt': 'original shared\n',
  };
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, name), bytes);
  git(root, ['init', '--quiet', '-b', 'main']);
  git(root, ['config', 'core.hooksPath', path.join(base, 'no-hooks')]);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.name', 'TIYE Fixture']); git(root, ['config', 'user.email', 'fixture@local']);
  git(root, ['add', '--', ...Object.keys(files)]);
  git(root, ['commit', '--quiet', '-m', 'Initial worktree fixture ' + crypto.randomUUID()]);
  fs.writeFileSync(path.join(root, 'local-settings.json'), '{"mode":"fixture"}\n');
}

function writer(directory, name, content) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../fixtures/member-write.cjs'), name, content], { cwd: directory, windowsHide: true, stdio: 'ignore' });
    let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 10000);
    child.once('error', () => { failed = true; });
    child.once('close', code => { clearTimeout(timer); code === 0 && !failed ? resolve() : reject(new Error('fixture writer failed')); });
  });
}

function commit(directory, name) {
  git(directory, ['add', '--', name]); git(directory, ['commit', '--quiet', '-m', 'Fixture edit ' + name]);
}

function cleanupArtifacts(lifecycle, directory) {
  lifecycle.validate(directory);
  for (const name of ['node_modules', 'package-lock.json', 'local-settings.json']) {
    const target = path.join(directory, name);
    if (!fs.existsSync(target)) continue;
    const resolved = fs.realpathSync(target), root = fs.realpathSync(directory);
    if (fs.lstatSync(target).isSymbolicLink() || path.dirname(resolved).toLowerCase() !== root.toLowerCase()) throw new Error('fixture artifact boundary invalid');
    if (fs.lstatSync(target).isDirectory()) treeFiles(target); // Reject nested links before recursive deletion.
    fs.rmSync(resolved, { recursive: fs.lstatSync(target).isDirectory() });
  }
}

function removeTemp(directory, prefix) {
  const resolved = fs.realpathSync(directory);
  if (fs.lstatSync(directory).isSymbolicLink() || path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase()
    || !path.basename(resolved).startsWith(prefix)) throw new Error('owned S3 temp boundary invalid');
  fs.rmSync(resolved, { recursive: true });
  return !fs.existsSync(resolved);
}

function basicsPassed(record) {
  return Boolean(!record.error && record.worktreesCreated === 3 && record.commonGitMatched && record.worktreesOutsideRoot && record.setupPassed
    && record.settingsCopied && record.settingsTestPassed && record.parallelWritersCompleted && record.differentFilesMerged
    && record.conflictExit === 1 && JSON.stringify(record.conflictFiles) === JSON.stringify(['shared.txt']) && record.conflictAbortRestored
    && record.originalRootUnchanged && record.worktreesRemoved === 3 && record.registryRootOnly && record.rootTempRemoved && record.baseTempRemoved);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-root-'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-worktrees-'));
  const record = { scope: 'S3.1 baseline with one offline local dependency, copied fixture settings, concurrent Node writers and Git merge/conflict cleanup; shared dependencies and full S3 remain open',
    recordedAt: new Date().toISOString(), platform: process.platform, node: process.version, git: git(root, ['--version']).output,
    sourceHashes: Object.fromEntries(['run-basics.js','worktree-lifecycle.js','../fixtures/member-write.cjs'].map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))])),
    sharedDependenciesQualified: false, fullS3Qualified: false, productionEligible: false, worktreesRemoved: 0 };
  let lifecycle, original, integration;
  try {
    initialize(root, base); original = rootState(root);
    lifecycle = createWorktreeLifecycle({ repository: root, base });
    const started = Date.now();
    integration = lifecycle.create({ name: 'integration', branch: 'codex/s3-integration' });
    const a = lifecycle.create({ name: 'member-a', branch: 'codex/s3-member-a' });
    const b = lifecycle.create({ name: 'member-b', branch: 'codex/s3-member-b' });
    record.creationMs = Date.now() - started; record.worktreesCreated = lifecycle.owned().length;
    record.commonGitMatched = [integration,a,b].every(directory => git(directory, ['rev-parse','--path-format=absolute','--git-common-dir']).output === git(root, ['rev-parse','--path-format=absolute','--git-common-dir']).output);
    record.worktreesOutsideRoot = [integration,a,b].every(directory => !path.resolve(directory).toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep));
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!fs.existsSync(npmCli)) throw new Error('local npm CLI unavailable');
    record.npm = node(a, [npmCli, '--version']);
    const setupStarted = Date.now();
    node(a, [npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--global=false', '--install-links', '--cache', path.join(base,'cache')], 45000);
    node(a, ['--test']); record.setupMs = Date.now() - setupStarted; record.setupPassed = true; record.setupUnder60Seconds = record.setupMs < 60000;
    record.memberInstalledBytes = treeFiles(path.join(a, 'node_modules')).reduce((total,file) => total + file.bytes, 0);
    fs.copyFileSync(path.join(root,'local-settings.json'), path.join(a,'local-settings.json'));
    record.settingsCopied = fs.readFileSync(path.join(root,'local-settings.json')).equals(fs.readFileSync(path.join(a,'local-settings.json')));
    node(a, ['--test']); record.settingsTestPassed = true;
    const writers = await Promise.allSettled([writer(a,'member-a.txt','member a edit'),writer(b,'member-b.txt','member b edit')]);
    record.parallelWritersCompleted = writers.every(result => result.status === 'fulfilled');
    if (!record.parallelWritersCompleted) throw new Error('parallel fixture writers failed');
    commit(a,'member-a.txt'); commit(b,'member-b.txt');
    git(integration,['merge','--no-edit','codex/s3-member-a']); git(integration,['merge','--no-edit','codex/s3-member-b']);
    record.differentFilesMerged = fs.readFileSync(path.join(integration,'member-a.txt'),'utf8') === 'member a edit\n' && fs.readFileSync(path.join(integration,'member-b.txt'),'utf8') === 'member b edit\n';
    await writer(a,'shared.txt','member a shared'); await writer(b,'shared.txt','member b shared');
    commit(a,'shared.txt'); commit(b,'shared.txt'); git(integration,['merge','--no-edit','codex/s3-member-a']);
    const beforeConflict = { head: git(integration,['rev-parse','HEAD']).output, tree: treeFiles(integration), index: git(integration,['write-tree']).output };
    record.conflictExit = git(integration,['merge','--no-edit','codex/s3-member-b'],[1]).status;
    record.conflictFiles = git(integration,['diff','--name-only','--diff-filter=U']).output.split(/\r?\n/).filter(Boolean);
    git(integration,['merge','--abort']);
    record.conflictAbortRestored = git(integration,['rev-parse','HEAD']).output === beforeConflict.head && JSON.stringify(treeFiles(integration)) === JSON.stringify(beforeConflict.tree)
      && git(integration,['write-tree']).output === beforeConflict.index && git(integration,['status','--porcelain']).output === '';
    record.originalRootUnchanged = JSON.stringify(rootState(root)) === JSON.stringify(original);
  } catch { record.error = 'S3 baseline fixture failed'; }
  finally {
    try {
      if (lifecycle) {
        for (const entry of lifecycle.owned().reverse()) {
          lifecycle.validate(entry.directory);
          if (git(entry.directory,['diff','--name-only','--diff-filter=U']).output) git(entry.directory,['merge','--abort']);
          cleanupArtifacts(lifecycle,entry.directory); lifecycle.remove(entry.directory); record.worktreesRemoved++;
        }
        const registered = lifecycle.registry();
        record.registryRootOnly = registered.length === 1 && path.resolve(registered[0].directory).toLowerCase() === fs.realpathSync(root).toLowerCase();
      }
      if (!record.registryRootOnly) throw new Error('S3 registry cleanup unverified');
      if (original) record.originalRootUnchanged = JSON.stringify(rootState(root)) === JSON.stringify(original);
      record.baseTempRemoved = removeTemp(base,'tiye-s3-worktrees-'); record.rootTempRemoved = removeTemp(root,'tiye-s3-root-');
    } catch { record.error = 'S3 owned cleanup failed'; }
  }
  record.passed = basicsPassed(record); record.result = record.passed ? 'BASELINE_PASS_S3_PARTIAL' : 'PARTIAL_OR_FAILED';
  fs.mkdirSync(path.resolve(__dirname,'../evidence'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname,'../evidence/basics-latest.json'),JSON.stringify(record,null,2)+'\n');
  console.log(`[s3-basics] ${record.result}`); process.exitCode = record.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[s3-basics] lifecycle failure'); process.exitCode=1; });
module.exports = { basicsPassed };

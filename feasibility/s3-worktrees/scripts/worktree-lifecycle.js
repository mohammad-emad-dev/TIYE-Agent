'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const key = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);

function git(cwd, args, allowed = [0]) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[name];
  const result = spawnSync('git', args, { cwd, env, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 128000 });
  if (result.error || !allowed.includes(result.status)) throw new Error('fixture Git operation failed');
  return { status: result.status, output: result.stdout.trim() };
}

function registry(repository) {
  return git(repository, ['worktree', 'list', '--porcelain', '-z']).output.split('\0\0').filter(Boolean).map(record => {
    const values = record.split('\0');
    return { directory: values.find(value => value.startsWith('worktree '))?.slice(9), branch: values.find(value => value.startsWith('branch '))?.slice(7),
      locked: values.some(value => value.startsWith('locked')) };
  });
}

function createWorktreeLifecycle({ repository, base }) {
  if (!path.isAbsolute(repository) || !path.isAbsolute(base)) throw new Error('worktree roots must be absolute');
  const root = fs.realpathSync(repository), parent = fs.realpathSync(base);
  if (key(root) === key(parent) || key(parent).startsWith(key(root) + path.sep)) throw new Error('worktree base must be outside project');
  if (fs.lstatSync(base).isSymbolicLink() || fs.lstatSync(repository).isSymbolicLink()) throw new Error('worktree roots cannot be links');
  const common = fs.realpathSync(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).output);
  if (key(common) !== key(path.join(root, '.git'))) throw new Error('worktree source must be the main Git root');
  const entries = new Map();

  function validateRoots() {
    if (fs.lstatSync(base).isSymbolicLink() || fs.lstatSync(repository).isSymbolicLink()
      || key(fs.realpathSync(base)) !== key(parent) || key(fs.realpathSync(repository)) !== key(root)) throw new Error('worktree root identity changed');
  }

  function validate(directory) {
    validateRoots();
    const target = path.resolve(directory), entry = entries.get(key(target));
    if (!entry || !path.isAbsolute(directory) || key(path.dirname(target)) !== key(parent) || key(fs.realpathSync(base)) !== key(parent)
      || fs.lstatSync(target).isSymbolicLink() || key(fs.realpathSync(target)) !== key(target)) throw new Error('owned worktree boundary unverified');
    const registered = registry(root).filter(value => value.directory && key(path.resolve(value.directory)) === key(target));
    if (registered.length !== 1 || registered[0].branch !== 'refs/heads/' + entry.branch || registered[0].locked
      || key(fs.realpathSync(git(target, ['rev-parse', '--path-format=absolute', '--git-common-dir']).output)) !== key(common)) throw new Error('owned worktree registration unverified');
    return { ...entry };
  }

  function create({ name, branch, ref = 'HEAD' }) {
    validateRoots();
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || typeof branch !== 'string' || !branch.startsWith('codex/')
      || typeof ref !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw new Error('fixture worktree selection invalid');
    git(root, ['check-ref-format', '--branch', branch]);
    const directory = path.join(parent, name);
    if (fs.existsSync(directory) || registry(root).some(value => value.directory && key(path.resolve(value.directory)) === key(directory))) throw new Error('worktree target already exists');
    const selected = git(root, ['rev-parse', '--verify', ref + '^{commit}']).output;
    git(root, ['worktree', 'add', '-b', branch, directory, selected]);
    // Record immediately after add so validation/cleanup can fail without losing ownership.
    entries.set(key(directory), { directory, branch });
    validate(directory);
    return directory;
  }

  function remove(directory) {
    const entry = validate(directory);
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'index.lock']) {
      if (fs.existsSync(git(entry.directory, ['rev-parse', '--path-format=absolute', '--git-path', name]).output)) throw new Error('owned worktree Git operation still active');
    }
    if (git(entry.directory, ['status', '--porcelain', '--untracked-files=all', '--ignored']).output) throw new Error('owned worktree still contains changes or artifacts');
    git(root, ['worktree', 'remove', entry.directory]);
    if (fs.existsSync(entry.directory) || registry(root).some(value => value.directory && key(path.resolve(value.directory)) === key(entry.directory))) throw new Error('owned worktree removal unverified');
    entries.delete(key(entry.directory));
  }

  return { create, validate, remove, owned: () => [...entries.values()].map(entry => ({ ...entry })), registry: () => registry(root) };
}

module.exports = { createWorktreeLifecycle, git };

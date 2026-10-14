'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorktreeLifecycle, git } = require('../scripts/worktree-lifecycle');

test('lifecycle refuses escaped selections, foreign removal and dirty owned worktrees', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s3-test-'));
  const repository = path.join(base, 'root'), slots = path.join(base, 'slots');
  fs.mkdirSync(repository); fs.mkdirSync(slots);
  git(repository, ['init', '--quiet', '-b', 'main']);
  git(repository, ['config', 'core.hooksPath', path.join(base, 'no-hooks')]);
  git(repository, ['config', 'user.name', 'TIYE Fixture']);
  git(repository, ['config', 'user.email', 'fixture@local']);
  fs.writeFileSync(path.join(repository, 'file.txt'), 'original\n'); git(repository, ['add', 'file.txt']);
  git(repository, ['-c', 'user.name=TIYE Fixture', '-c', 'user.email=fixture@local', 'commit', '--quiet', '-m', 'Fixture']);
  const lifecycle = createWorktreeLifecycle({ repository, base: slots });
  let directory;
  try {
    for (const name of ['../escape', 'nested/member', '.', 'C:\\escape']) assert.throws(() => lifecycle.create({ name, branch: 'codex/member' }));
    assert.throws(() => lifecycle.remove(repository));
    fs.mkdirSync(path.join(slots, 'existing')); assert.throws(() => lifecycle.create({ name: 'existing', branch: 'codex/existing' }));
    directory = lifecycle.create({ name: 'member', branch: 'codex/member' });
    fs.writeFileSync(path.join(directory, 'file.txt'), 'uncommitted\n');
    assert.throws(() => lifecycle.remove(directory)); assert.equal(fs.readFileSync(path.join(directory, 'file.txt'), 'utf8'), 'uncommitted\n');
    git(directory, ['restore', '--', 'file.txt']);
    git(directory, ['branch', '-m', 'codex/reassigned']);
    assert.throws(() => lifecycle.remove(directory));
    git(directory, ['branch', '-m', 'codex/member']);
    git(repository, ['switch', '--quiet', '-c', 'codex/empty-peer']);
    git(repository, ['-c', 'user.name=TIYE Fixture', '-c', 'user.email=fixture@local', 'commit', '--allow-empty', '--quiet', '-m', 'Empty peer']);
    git(repository, ['switch', '--quiet', 'main']);
    git(directory, ['merge', '--no-edit', '--no-commit', '--no-ff', 'codex/empty-peer']);
    assert.equal(git(directory, ['status', '--porcelain']).output, '');
    assert.throws(() => lifecycle.remove(directory));
    git(directory, ['merge', '--abort']);
    lifecycle.remove(directory); directory = undefined;
    assert.equal(lifecycle.registry().length, 1);
  } finally {
    if (directory) { git(directory, ['restore', '--', 'file.txt']); lifecycle.remove(directory); }
    const resolved = fs.realpathSync(base);
    if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-s3-test-')
      || lifecycle.owned().length !== 0 || lifecycle.registry().length !== 1) throw new Error('test temp cleanup unverified');
    fs.rmSync(resolved, { recursive: true });
  }
});

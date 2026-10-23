'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

function verifyRoot(root, mode = 'Verify') {
  const child = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'private-root.ps1'), '-Root', root, '-Mode', mode],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  assert.equal(child.stdout.trim(), 'PRIVATE_ROOT_VERIFIED');
}
function privateRoot(t) {
  const root = path.join(os.tmpdir(), 'tiye-core-' + randomUUID());
  verifyRoot(root, 'Create');
  t.after(() => {
    assert.equal(path.dirname(root).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.match(path.basename(root), /^tiye-core-[0-9a-f-]{36}$/);
    assert(!fs.lstatSync(root).isSymbolicLink());
    fs.rmSync(root, { recursive: true });
  });
  return root;
}
function command(overrides = {}) {
  return { type: 'task.create', version: 1, commandId: randomUUID(), taskId: randomUUID(), title: 'Test task', ...overrides };
}
function bytes(command) { return Buffer.from(JSON.stringify(command)); }
module.exports = { privateRoot, verifyRoot, command, bytes };

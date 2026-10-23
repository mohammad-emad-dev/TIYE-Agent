'use strict';
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

function plan(overrides = {}) {
  return { commandId: randomUUID(), taskId: randomUUID(), effectId: randomUUID(), attemptId: randomUUID(),
    targetId: randomUUID(), payload: 'Synthetic owned action', expiresAt: Date.now() + 60000, ...overrides };
}
function witness(mode, root, request, input) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'witness.cjs'), mode, root, request.targetId],
    { input: input ? JSON.stringify(input) : '', encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
module.exports = { plan, witness };

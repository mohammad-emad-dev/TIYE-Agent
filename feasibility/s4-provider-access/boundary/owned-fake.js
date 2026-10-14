'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { simulatedGate } = require('./route-gate');
const owned = new WeakMap();
const markerName = '.tiye-offline-owner';
const scenarios = new Set(['success', 'auth', 'quota', 'model', 'invalid', 'foreign', 'exit']);

function createWorkspace() {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'tiye-s4-offline-'));
  const marker = crypto.randomUUID();
  fs.writeFileSync(path.join(root, markerName), marker, { flag: 'wx' });
  const handle = Object.freeze({ root });
  owned.set(handle, { parent, root, marker, running: false });
  return handle;
}

function ownerRecord(handle) {
  const record = owned.get(handle);
  if (!record) throw new Error('foreign-workspace-handle');
  if (record.running) throw new Error('owned-process-active');
  if (path.dirname(record.root) !== record.parent || fs.lstatSync(record.root).isSymbolicLink()
      || fs.realpathSync(record.root) !== record.root) throw new Error('workspace-root-drift');
  const markerPath = path.join(record.root, markerName);
  const marker = fs.lstatSync(markerPath);
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1
      || fs.readFileSync(markerPath, 'utf8') !== record.marker) throw new Error('owner-marker-drift');
  const names = fs.readdirSync(record.root);
  if (names.length !== 1 || names[0] !== markerName) throw new Error('unexpected-workspace-content');
  return record;
}

function releaseWorkspace(handle) {
  const record = ownerRecord(handle);
  fs.unlinkSync(path.join(record.root, markerName));
  fs.rmdirSync(record.root);
  owned.delete(handle);
}

function failedOutcome(category, exitCode) {
  return { state: 'failed', category, ...(Number.isInteger(exitCode) ? { exitCode } : {}) };
}

function sanitizedOutcome(stdout, exitCode, requestId) {
  if (exitCode !== 0) return failedOutcome('process-exit', exitCode);
  if (Buffer.byteLength(stdout) > 4096) return failedOutcome('oversized-reply');
  let reply;
  try { reply = JSON.parse(stdout); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return failedOutcome('invalid-reply');
  }
  if (!reply || typeof reply !== 'object' || Array.isArray(reply) || reply.requestId !== requestId) return failedOutcome('uncorrelated-reply');
  if (reply.status === 'failed' && ['auth', 'quota', 'unsupported-model'].includes(reply.category)) return failedOutcome(reply.category, 0);
  if (reply.status !== 'completed' || Object.hasOwn(reply, 'category')) return failedOutcome('invalid-reply');
  // A narrow output allowlist discards arbitrary nested provider text and fields.
  return { state: 'completed', category: 'synthetic-task', exitCode: 0 };
}

async function runFake(handle, request) {
  const gate = simulatedGate(request);
  if (gate.state !== 'ready-for-fake-execution') return gate;
  if (!scenarios.has(request.scenario)) throw new Error('unknown-fake-scenario');
  const record = ownerRecord(handle);
  const requestId = crypto.randomUUID();
  record.running = true;
  try {
    return await new Promise(resolve => {
      execFile(process.execPath, [path.join(__dirname, 'fake-cli.js'), requestId, request.scenario],
        { cwd: record.root, env: {}, windowsHide: true, timeout: 10000, maxBuffer: 8192, encoding: 'utf8' },
        (error, stdout) => {
          if (error && !Number.isInteger(error.code)) resolve(failedOutcome('process-error'));
          else resolve(sanitizedOutcome(stdout, error ? error.code : 0, requestId));
        });
    });
  } finally { record.running = false; }
}

module.exports = { createWorkspace, releaseWorkspace, runFake, sanitizedOutcome };

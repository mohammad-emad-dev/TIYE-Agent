'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { serviceApi } = require('./service-cli');
const controlCwd = path.resolve(__dirname, '../../..');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const reviewedActions = new Set(['shell', 'read', 'edit', 'glob', 'grep']);
const absoluteDirectory = value => typeof value === 'string' && value.length > 0 && !value.includes('\0') && path.isAbsolute(value);
const directoryKey = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);

function serviceIdentity(info) {
  if (info?.version !== '2.0.28' || !Number.isSafeInteger(info.pid) || info.pid <= 0) throw new Error('unreviewed service identity');
  return { pid: info.pid, version: info.version };
}

function locationIdentity(location, cwd) {
  if (!absoluteDirectory(location?.directory) || directoryKey(location.directory) !== directoryKey(cwd)
    || !identifier(location?.project?.id) || !absoluteDirectory(location.project.directory)) throw new Error('invalid project identity');
  // A worktree's project directory may name its original root. Scope comes from the native ID.
  return { directory: directoryKey(location.directory), projectID: location.project.id, projectDirectory: directoryKey(location.project.directory) };
}

function savedRules(response, projectID) {
  const rows = response?.data;
  if (!Array.isArray(rows) || rows.length > 512) throw new Error('invalid saved rules');
  const ids = new Set();
  const normalized = rows.map(row => {
    if (!identifier(row?.id) || ids.has(row.id) || row.projectID !== projectID || !reviewedActions.has(row.action)
      || typeof row.resource !== 'string' || row.resource.length === 0 || row.resource.length > 4096 || row.resource.includes('\0')
      || !Number.isFinite(row.time?.created) || row.time.created < 0 || !Number.isFinite(row.time?.updated) || row.time.updated < row.time.created
      || Object.hasOwn(row, 'effect')) throw new Error('invalid saved rule');
    ids.add(row.id);
    // Saved records are implicit allows. Unknown action-pattern syntax fails validation above.
    return { id: row.id, projectID, action: row.action, resource: row.resource, time: { created: row.time.created, updated: row.time.updated } };
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return { count: rows.length, shellCount: normalized.filter(row => row.action === 'shell').length,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
}

async function snapshot(cwd, api) {
  const service = serviceIdentity(await api(controlCwd, 'GET', '/api/info'));
  const route = `/api/location?location[directory]=${encodeURIComponent(cwd)}`;
  const location = locationIdentity(await api(controlCwd, 'GET', route), cwd);
  const rules = savedRules(await api(controlCwd, 'GET', `/api/permission/saved?projectID=${encodeURIComponent(location.projectID)}`), location.projectID);
  const afterService = serviceIdentity(await api(controlCwd, 'GET', '/api/info'));
  const afterLocation = locationIdentity(await api(controlCwd, 'GET', route), cwd);
  if (JSON.stringify(service) !== JSON.stringify(afterService) || JSON.stringify(location) !== JSON.stringify(afterLocation)) throw new Error('identity changed during read');
  return { service, location, rules };
}

async function inspect(cwd, api) {
  try {
    if (!absoluteDirectory(cwd) || typeof api !== 'function') throw new Error('invalid preflight input');
    const first = await snapshot(cwd, api);
    if (first.rules.shellCount > 0) return { evidence: { status: 'blocked', reason: 'saved-shell-allow', conflictingRules: first.rules.shellCount } };
    const second = await snapshot(cwd, api);
    if (JSON.stringify(first) !== JSON.stringify(second)) return { evidence: { status: 'blocked', reason: 'permission-snapshot-changed' } };
    return { evidence: { status: 'clear', version: second.service.version, savedRules: second.rules.count, stableReads: 2 },
      context: Object.freeze({ cwd, projectID: second.location.projectID, servicePID: second.service.pid, version: second.service.version }) };
  } catch {
    // Transport errors may contain paths, credentials or provider output; callers receive only a fixed code.
    return { evidence: { status: 'unavailable', reason: 'permission-state-unverified' } };
  }
}

async function strictAskPreflight({ cwd, api = serviceApi }) {
  return (await inspect(cwd, api)).evidence;
}

async function launchWithStrictAsk({ cwd, launch, api = serviceApi }) {
  if (typeof launch !== 'function') return { status: 'unavailable', reason: 'launch-handler-invalid' };
  const { evidence, context } = await inspect(cwd, api);
  if (evidence.status !== 'clear') return evidence;
  // Trusted adapter callback must configure shell ask. No atomic permission lease exists:
  // this is a launch preflight, not ongoing enforcement. Never retry a failed callback.
  const value = await launch(context);
  return { status: 'launched', preflight: evidence, value };
}

module.exports = { strictAskPreflight, launchWithStrictAsk };

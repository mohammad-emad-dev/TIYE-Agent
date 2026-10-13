'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeExecutable, attachJob, closePrivate, processInventory, ownedIdentities, waitUntil } = require('./persistent-cli');
const { configFingerprints } = require('./run-tool-probe');
const { serviceApi } = require('./service-cli');
const { rpcClient } = require('./acp-protocol');
const { reviewedVersion } = require('./reviewed-version');

async function observedFailure(client, method, timeoutMs) {
  const startedAt = Date.now();
  try { await client.request(method, {}, timeoutMs); return { unexpectedSuccess: true }; }
  catch (failure) {
    const category = ['acp.deadline', 'acp.transport', 'acp.protocol', 'acp.remote'].includes(failure.category) ? failure.category : 'unexpected';
    return { category, ...(Number.isInteger(failure.rpcCode) ? { rpcCode: failure.rpcCode } : {}), elapsedMs: Date.now() - startedAt };
  }
}

function removeOwnedTemp(cwd, cleanup) {
  const resolved = fs.realpathSync(cwd);
  if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase()
    || !path.basename(resolved).startsWith('tiye-s2-fault-')) throw new Error('Fault temp boundary invalid');
  if (cleanup?.verified && cleanup.jobVerified) fs.rmSync(resolved, { recursive: true });
  return !fs.existsSync(resolved);
}

function prepareProcess({ cwd, native, evidence }) {
  const script = path.join(__dirname, native ? 'acp-child.js' : '../fixtures/acp-fault.js');
  const child = spawn(process.execPath, [script], { cwd, env: { ...process.env, PWD: cwd }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  const state = { child };
  child.stderr.resume();
  child.on('error', () => { evidence.spawnError = true; });
  child.stdin.on('error', () => { evidence.inputError = true; });
  child.on('message', packet => { if (packet?.type === 'fault-received') evidence.faultRequestsReceived = (evidence.faultRequestsReceived || 0) + 1; });
  return state;
}

async function finishOwnedProcess({ cwd, state, client, evidence, expectedFiles }) {
  client?.close();
  // Cleanup failure must remain reviewable and retain the exact owned directory.
  try { if (state) evidence.cleanup = await closePrivate(state); }
  catch { evidence.cleanupError = 'owned fault-process cleanup unverified'; }
  evidence.onlyFixtureFilesPresent = JSON.stringify(fs.readdirSync(cwd)) === JSON.stringify(expectedFiles);
  evidence.tempRemoved = removeOwnedTemp(cwd, evidence.cleanup);
}

async function runInjectedFault(fault) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-fault-'));
  const evidence = { caseID: fault, source: 'injected-owned-process', requestDeadlineMs: fault === 'hang' ? 500 : 10000, executionStateAtFailure: 'unknown' };
  let state, client;
  try {
    state = prepareProcess({ cwd, native: false, evidence });
    await attachJob(state); client = rpcClient(state, evidence);
    state.child.send({ type: 'launch', fault });
    evidence.ready = (await client.request('fixture/ready', {})).ready === true;
    state.captured = ownedIdentities(await processInventory(), state.child.pid);
    evidence.failure = await observedFailure(client, 'fixture/fault', evidence.requestDeadlineMs);
    evidence.aliveAtFailure = state.child.exitCode === null && state.child.signalCode === null;
    if (fault === 'crash') await waitUntil(() => state.child.exitCode !== null || state.child.signalCode !== null, 2000);
    evidence.exitCode = state.child.exitCode;
  } catch { evidence.error = 'injected ACP fault probe failed'; }
  finally {
    await finishOwnedProcess({ cwd, state, client, evidence, expectedFiles: [] });
  }
  const outcome = {
    hang: () => evidence.failure?.category === 'acp.deadline' && evidence.failure.elapsedMs >= 450 && evidence.failure.elapsedMs < 3000 && evidence.aliveAtFailure,
    crash: () => evidence.failure?.category === 'acp.transport' && evidence.failure.elapsedMs < 3000 && evidence.exitCode === 23,
    malformed: () => evidence.failure?.category === 'acp.protocol' && evidence.failure.elapsedMs < 3000 && evidence.malformedProtocol === true
  };
  evidence.passed = Boolean(!evidence.error && !evidence.cleanupError && !evidence.spawnError && evidence.ready && evidence.faultRequestsReceived === 1 && outcome[fault]()
    && evidence.cleanup?.verified && evidence.cleanup.jobVerified && evidence.onlyFixtureFilesPresent && evidence.tempRemoved);
  return evidence;
}

async function runNativeError(expectedVersion) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-fault-'));
  const evidence = { caseID: 'unsupported-method', source: 'native-opencode-acp', expectedVersion, modelRequests: 0 };
  let state, client;
  try {
    fs.writeFileSync(path.join(cwd, 'opencode.json'), JSON.stringify({ permissions: [{ action: 'edit', resource: '*', effect: 'deny' }, { action: 'shell', resource: '*', effect: 'ask' }] }));
    state = prepareProcess({ cwd, native: true, evidence });
    await attachJob(state); client = rpcClient(state, evidence);
    state.child.send({ type: 'launch', executable: nativeExecutable(), cwd });
    const initialized = await client.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'tiye-feasibility', version: '0.1.0' } });
    evidence.version = initialized.agentInfo?.version;
    if (evidence.version !== expectedVersion) throw new Error('ACP version changed');
    evidence.protocolConfirmed = initialized.protocolVersion === 1;
    state.captured = ownedIdentities(await processInventory(), state.child.pid);
    evidence.failure = await observedFailure(client, 'tiye/unsupported_probe', 10000);
    const listed = await client.request('session/list', { cwd });
    evidence.healthyAfterRemoteError = Array.isArray(listed.sessions) && listed.sessions.length === 0;
    evidence.noOwnedSessions = evidence.healthyAfterRemoteError;
  } catch { evidence.error = 'native ACP error probe failed'; }
  finally {
    await finishOwnedProcess({ cwd, state, client, evidence, expectedFiles: ['opencode.json'] });
  }
  evidence.passed = Boolean(!evidence.error && !evidence.cleanupError && !evidence.spawnError && !evidence.inputError && evidence.version === expectedVersion && evidence.protocolConfirmed
    && evidence.failure?.category === 'acp.remote' && evidence.failure.rpcCode === -32601 && evidence.healthyAfterRemoteError && evidence.noOwnedSessions
    && evidence.cleanup?.verified && evidence.cleanup.jobVerified && evidence.onlyFixtureFilesPresent && evidence.tempRemoved);
  return evidence;
}

async function main() {
  const beforeConfigs = configFingerprints();
  const workspace = path.resolve(__dirname, '../../..');
  const shared = await serviceApi(workspace, 'GET', '/api/info');
  const expectedVersion = reviewedVersion(shared.version);
  const names = ['run-acp-faults.js', 'acp-protocol.js', 'acp-failure.js', 'acp-child.js', 'persistent-cli.js', 'reviewed-version.js', '../fixtures/acp-fault.js'];
  const evidence = { recordedAt: new Date().toISOString(), scope: 'Injected owned-process deadline/crash/protocol contracts plus native unsupported-method error; no vendor hang or provider-error claims',
    sourceHashes: Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])), runs: [] };
  for (const fault of ['hang', 'crash', 'malformed']) {
    const run = await runInjectedFault(fault);
    evidence.runs.push(run);
    if (!run.cleanup?.verified || !run.cleanup.jobVerified || !run.tempRemoved) { evidence.stoppedReason = 'owned-cleanup-unverified'; break; }
  }
  if (!evidence.stoppedReason) evidence.runs.push(await runNativeError(expectedVersion));
  const after = await serviceApi(workspace, 'GET', '/api/info');
  evidence.sharedServiceUnchanged = after.pid === shared.pid && after.version === shared.version;
  evidence.selectedConfigsUnchanged = JSON.stringify(beforeConfigs) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.runs.length === 4 && !evidence.stoppedReason && evidence.runs.every(run => run.passed) && evidence.sharedServiceUnchanged && evidence.selectedConfigsUnchanged;
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/acp-faults-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[acp-faults] ${evidence.result}`); process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[acp-faults] lifecycle failure'); process.exitCode = 1; });

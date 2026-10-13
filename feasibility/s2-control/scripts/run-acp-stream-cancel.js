'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeExecutable, attachJob, closePrivate, processInventory, ownedIdentities } = require('./persistent-cli');
const { configFingerprints } = require('./run-tool-probe');
const { serviceApi } = require('./service-cli');
const { rpcClient } = require('./acp-protocol');
const { reviewedVersion } = require('./reviewed-version');
const model = 'opencode/muse-spark-1.3-contributor-free';
const prompt = 'Write 300 numbered lines, each containing one short practical tip for writing readable functions. Start directly at line 1 and continue through line 300. Plain text only. No introduction, closing paragraph, tools, file operations, commands, or questions.';

async function main() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-acp-'));
  const beforeConfigs = configFingerprints();
  const shared = await serviceApi(path.resolve(__dirname, '../../..'), 'GET', '/api/info');
  const expectedVersion = reviewedVersion(shared.version);
  const evidence = { scope: 'Native ACP text-chunk cancellation in an owned private backend; not terminal Ctrl+C or shared-session API cancellation', recordedAt: new Date().toISOString(), stage: 'launch',
    expectedVersion,
    sourceHashes: Object.fromEntries(['run-acp-stream-cancel.js', 'acp-child.js', 'acp-protocol.js', 'acp-failure.js', 'reviewed-version.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])),
    promptHash: crypto.createHash('sha256').update(prompt).digest('hex'), toolCalls: 0, permissionRequests: 0 };
  let state, sessionID, client;
  try {
    fs.writeFileSync(path.join(cwd, 'opencode.json'), JSON.stringify({ permissions: [{ action: 'edit', resource: '*', effect: 'deny' }, { action: 'shell', resource: '*', effect: 'ask' }] }));
    const child = spawn(process.execPath, [path.join(__dirname, 'acp-child.js')], { cwd, env: { ...process.env, PWD: cwd }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    state = { child }; child.stderr.resume(); child.on('error', () => { state.error = true; });
    child.stdin.on('error', () => { state.error = true; });
    await attachJob(state);
    client = rpcClient(state, evidence);
    child.send({ type: 'launch', executable: nativeExecutable(), cwd });
    const initialized = await client.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'tiye-feasibility', version: '0.1.0' } });
    evidence.version = initialized.agentInfo?.version;
    if (evidence.version !== expectedVersion) throw new Error('ACP version changed');
    evidence.protocolConfirmed = initialized.protocolVersion === 1 && initialized.agentCapabilities?.sessionCapabilities?.delete !== undefined;
    evidence.stage = 'session';
    const created = await client.request('session/new', { cwd, mcpServers: [] });
    if (!/^ses_[a-zA-Z0-9]+$/.test(created.sessionId)) throw new Error('ACP session identity invalid');
    sessionID = created.sessionId;
    await client.request('session/set_config_option', { sessionId: sessionID, configId: 'model', value: model });
    const configured = await client.request('session/set_config_option', { sessionId: sessionID, configId: 'effort', value: 'xhigh' });
    evidence.modelConfirmed = configured.configOptions?.find(option => option.id === 'model')?.currentValue === model;
    evidence.effortConfirmed = configured.configOptions?.find(option => option.id === 'effort')?.currentValue === 'xhigh';
    const effort = configured.configOptions?.find(option => option.id === 'effort');
    evidence.effortOptionPresent = Boolean(effort);
    evidence.effortValue = ['xhigh', 'default', 'high', 'medium', 'low', 'max'].includes(effort?.currentValue) ? effort.currentValue : 'other-or-missing';
    if (!evidence.modelConfirmed || !evidence.effortConfirmed) throw new Error('ACP model selection unverified');
    state.captured = ownedIdentities(await processInventory(), child.pid);
    evidence.ownedProcesses = state.captured.length;
    evidence.stage = 'stream';
    const result = await client.prompt(sessionID, prompt);
    evidence.stopReason = ['cancelled', 'end_turn', 'max_tokens', 'refusal'].includes(result.stopReason) ? result.stopReason : 'other';
    await new Promise(resolve => setTimeout(resolve, 500));
    const chunkUnits = evidence.totalOwnTextCodeUnits;
    const chunkCount = evidence.totalOwnTextChunks;
    await new Promise(resolve => setTimeout(resolve, 1000));
    evidence.cancelledStable = evidence.stopReason === 'cancelled' && evidence.totalOwnTextCodeUnits === chunkUnits && evidence.totalOwnTextChunks === chunkCount;
    evidence.stage = 'completed';
  } catch { evidence.error = 'native ACP streaming probe failed'; }
  finally {
    try {
      if (client && sessionID) {
        await client.request('session/delete', { sessionId: sessionID });
        const remaining = await client.request('session/list', { cwd });
        evidence.sessionRemoved = Array.isArray(remaining.sessions) && remaining.sessions.length === 0;
      }
    } catch { evidence.cleanupError = 'ACP owned session cleanup failed'; }
    finally { client?.close(); if (state) evidence.cleanup = await closePrivate(state); }
    evidence.onlyFixtureFilesPresent = JSON.stringify(fs.readdirSync(cwd)) === JSON.stringify(['opencode.json']);
    const resolved = fs.realpathSync(cwd);
    if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-s2-acp-')) throw new Error('ACP temp boundary invalid');
    if (evidence.sessionRemoved || !client) fs.rmSync(resolved, { recursive: true });
    evidence.tempRemoved = !fs.existsSync(resolved);
    const after = await serviceApi(path.resolve(__dirname, '../../..'), 'GET', '/api/info');
    evidence.sharedServiceUnchanged = after.pid === shared.pid && after.version === shared.version;
    evidence.selectedConfigsUnchanged = JSON.stringify(beforeConfigs) === JSON.stringify(configFingerprints());
  }
  evidence.passed = Boolean(!evidence.error && !evidence.cleanupError && evidence.version === expectedVersion && evidence.protocolConfirmed && evidence.modelConfirmed && evidence.effortConfirmed
    && evidence.sameAssistantTextChunks && evidence.secondTextCodeUnits > evidence.firstTextCodeUnits && evidence.cancelNotificationSent && evidence.cancelledStable
    && !evidence.assistantChanged && !evidence.protocolOverflow && !evidence.malformedProtocol && evidence.toolCalls === 0 && evidence.permissionRequests === 0
    && evidence.sessionRemoved && evidence.cleanup?.verified && evidence.cleanup.jobVerified && evidence.onlyFixtureFilesPresent && evidence.tempRemoved
    && evidence.sharedServiceUnchanged && evidence.selectedConfigsUnchanged);
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/acp-stream-cancel-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[acp-stream-cancel] ${evidence.result}`); process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[acp-stream-cancel] lifecycle failure'); process.exitCode = 1; });

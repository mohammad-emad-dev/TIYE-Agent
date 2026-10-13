'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { sameSession } = require('./session-identity');
const { conversationFingerprint } = require('./recovery-evidence');
const { streamSample, streamGrowth, cancelledText } = require('./stream-cancel-evidence');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const prompt = 'Write 300 numbered lines. Each line must contain one short practical tip for writing readable functions, in a complete sentence. Start directly with line 1 and continue through line 300 without an introduction or closing paragraph. Plain text only. Do not use tools, read/change files, run commands, call team tools, or ask questions.';

async function ownMessages(request) {
  const messages = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
  if (!Array.isArray(messages)) throw new Error('stream message schema invalid');
  return messages;
}

async function observeGrowth(request, evidence) {
  const deadline = Date.now() + 90000;
  let previous;
  while (Date.now() < deadline) {
    if (request.state.error || request.state.closed) throw new Error('stream terminal stopped');
    const messages = await ownMessages(request);
    const sample = streamSample({ messages, prompt, submittedAt: request.taskSubmittedAt });
    evidence.samplePolls = (evidence.samplePolls || 0) + 1;
    evidence.lastTextCodeUnits = sample.text.length;
    evidence.lastPromptAccepted = sample.promptAccepted;
    evidence.lastUnfinished = sample.unfinished;
    if (!sample.noErrors || !sample.noTools) throw new Error('stream response used tools or failed');
    if (streamGrowth(previous, sample)) {
      Object.assign(evidence, { promptAccepted: true, sameAssistantTextGrew: true, unfinishedAtBothSamples: true,
        firstTextCodeUnits: previous.text.length, secondTextCodeUnits: sample.text.length, noTools: true });
      return sample.assistantID;
    }
    if (sample.promptAccepted && sample.assistantID && !sample.unfinished) throw new Error('response ended before stream growth was observed');
    previous = sample;
    await delay(250);
  }
  throw new Error('text stream growth not observed');
}

async function observeCancellation(request, assistantID, createdAt) {
  const deadline = Date.now() + 30000;
  let prior, stable = 0;
  while (Date.now() < deadline) {
    const messages = await ownMessages(request);
    const pending = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/permission`)).data;
    const matched = cancelledText({ messages, pending, assistantID, createdAt });
    const fingerprint = conversationFingerprint(messages);
    stable = matched ? (prior === fingerprint ? stable + 1 : 1) : 0;
    prior = matched ? fingerprint : undefined;
    if (stable >= 2) return true;
    await delay(1000);
  }
  throw new Error('stream cancellation not stable');
}

async function performCancellation({ request, evidence }) {
  const session = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const service = await request.serviceApi(request.cwd, 'GET', '/api/info');
  const assistantID = await observeGrowth(request, evidence);
  evidence.streamStage = 'interrupt';
  const interruptedAt = Date.now();
  const interrupted = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
  evidence.interruptAccepted = interrupted.interrupted === true;
  const again = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
  evidence.secondInterruptInactive = again.interrupted === false;
  if (!evidence.interruptAccepted || !evidence.secondInterruptInactive) throw new Error('stream interrupt lost race or failed');
  evidence.streamStage = 'cancel-quiescence';
  evidence.cancelledStableTwice = await observeCancellation(request, assistantID, session.time.created);
  evidence.cancellationObservationMs = Date.now() - interruptedAt;
  evidence.cancelledAssistantType = 'aborted';
  const finalSession = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const finalService = await request.serviceApi(request.cwd, 'GET', '/api/info');
  evidence.sessionIdentityPreserved = sameSession(session, finalSession, request.cwd);
  evidence.serviceIdentityPreserved = service.pid === finalService.pid && service.version === finalService.version;
  evidence.streamCancelObserved = evidence.sessionIdentityPreserved && evidence.serviceIdentityPreserved;
  evidence.streamStage = 'completed';
  return evidence;
}

async function observe(request) {
  const evidence = { streamCancelObserved: false, streamStage: 'await-text-growth' };
  try { return await performCancellation({ request, evidence }); }
  catch (error) {
    const reasons = { 'response ended before stream growth was observed': 'response-completed-before-growth', 'text stream growth not observed': 'growth-deadline', 'stream response used tools or failed': 'tool-or-provider-error', 'stream interrupt lost race or failed': 'interrupt-race-or-failure', 'stream cancellation not stable': 'cancellation-not-stable' };
    return { ...evidence, failureReason: reasons[error.message] || 'api-or-unexpected-error', error: 'owned text-stream cancellation failed' };
  }
}

async function main() {
  const before = configFingerprints();
  const task = { kind: 'stream-cancel', prompt, permissions: SERVICE_PERMISSIONS, observe };
  const names = ['run-stream-cancel.js', 'stream-cancel-evidence.js', 'session-identity.js', 'recovery-evidence.js', 'service-quiescence.js', 'run-tool-probe.js', 'terminal-client.js', 'terminal-task.js', 'service-cli.js'];
  const evidence = { scope: 'Own-session cancellation after same unfinished assistant text grows across two API snapshots; not effect rollback, Ctrl+C or provider-side billing proof', recordedAt: new Date().toISOString(),
    sourceHashes: Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])),
    promptHash: crypto.createHash('sha256').update(prompt).digest('hex') };
  evidence.run = await runMember('member-a', { terminalMode: true, task });
  evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.run.passed && evidence.selectedConfigsUnchanged;
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/stream-cancel-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[stream-cancel] ${evidence.result}`);
  process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[stream-cancel] lifecycle failure'); process.exitCode = 1; });

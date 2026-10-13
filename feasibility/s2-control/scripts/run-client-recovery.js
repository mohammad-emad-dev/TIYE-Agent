'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { pollTextPhase } = require('./terminal-task');
const { openTerminal } = require('./terminal-client');
const { closePrivate, processInventory, ownedIdentities, waitUntil } = require('./persistent-cli');
const { recallEvidence } = require('./briefing-evidence');
const { conversationFingerprint, ownedCrashTarget } = require('./recovery-evidence');
const recallPrompt = 'Recall the checkpoint profile from the first message. Reply with only a JSON object containing member, role and checkpoint. No tools, Markdown, explanations or file operations.';

function sameSession(before, after, cwd) {
  return before.id === after.id && before.time.created === after.time.created && before.agent === after.agent
    && JSON.stringify(before.model) === JSON.stringify(after.model) && JSON.stringify(before.permissions) === JSON.stringify(after.permissions)
    && path.resolve(after.location.directory).toLowerCase() === path.resolve(cwd).toLowerCase();
}

async function crashOwnedClient(request, servicePID) {
  const ready = request.readEvents().find(event => event.type === 'ready');
  const current = await processInventory();
  const identity = ownedCrashTarget({ pid: ready?.ptyPID, captured: request.state.captured,
    current: ownedIdentities(current, request.state.child.pid), rootPID: request.state.child.pid, servicePID });
  if (!identity) throw new Error('crash target ownership unverified');
  // Recheck the captured creation identity immediately before termination.
  const fresh = await processInventory();
  if (!ownedCrashTarget({ pid: identity.ProcessId, captured: [identity], current: ownedIdentities(fresh, request.state.child.pid), rootPID: request.state.child.pid, servicePID })) throw new Error('crash target identity changed');
  const startedAt = Date.now();
  process.kill(identity.ProcessId, 'SIGKILL');
  await waitUntil(() => request.readEvents().some(event => event.type === 'pty-exit') || request.state.closed, 10000);
  const exit = request.readEvents().filter(event => event.type === 'pty-exit');
  if (exit.length !== 1 || !Number.isFinite(exit[0].exitCode)) throw new Error('native CLI exit unverified');
  const cleanup = await closePrivate(request.state);
  return { crashTargetOwned: true, ptyExitObserved: true, ptyExitCode: exit[0].exitCode, ptyExitSignal: exit[0].signal ?? null, crashObservationMs: Date.now() - startedAt, firstClientCleanup: cleanup };
}

async function observe(request, task, profile) {
  const evidence = { recoveryObserved: false, recoveryStage: 'seed' };
  try { return await performRecovery({ request, task, profile, evidence }); }
  catch { return { ...evidence, error: 'owned-client recovery failed' }; }
}

async function performRecovery({ request, task, profile, evidence }) {
  const seed = await pollTextPhase({ ...request, phasePrompt: task.prompt, submittedAt: request.taskSubmittedAt });
  const seedRecall = recallEvidence(seed.phase.assistants, profile);
  if (!seedRecall.matched) throw new Error('seed JSON unverified');
  const before = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const service = await request.serviceApi(request.cwd, 'GET', '/api/info');
  const originalRoot = request.state.captured.find(identity => identity.ProcessId === request.state.child.pid);
  Object.assign(evidence, { seedAccepted: seed.phase.accepted, seedJsonMatched: true, seedStableIdle: seed.stableIdle, recoveryStage: 'crash' });
  Object.assign(evidence, await crashOwnedClient(request, service.pid));
  evidence.recoveryStage = 'persistence';
  const stopped = await request.serviceApi(request.cwd, 'POST', `/api/session/${request.sessionID}/interrupt`, {});
  const after = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  const history = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}/message?limit=100&order=desc`)).data;
  const serviceAfter = await request.serviceApi(request.cwd, 'GET', '/api/info');
  evidence.stoppedAfterClientCrash = stopped.interrupted === false && after.time.idle >= request.taskSubmittedAt;
  evidence.historyPreserved = conversationFingerprint(seed.messages) === conversationFingerprint(history);
  evidence.sessionIdentityPreserved = sameSession(before, after, request.cwd);
  evidence.servicePreservedAcrossCrash = service.pid === serviceAfter.pid && service.version === serviceAfter.version;
  if (!evidence.stoppedAfterClientCrash || !evidence.historyPreserved || !evidence.sessionIdentityPreserved || !evidence.servicePreservedAcrossCrash) throw new Error('crash persistence unverified');
  const priorAssistantIds = new Set(history.filter(message => message.type === 'assistant').map(message => message.id));
  evidence.recoveryStage = 'resume';
  const resumed = await openTerminal({ cwd: request.cwd, sessionID: request.sessionID, taskPrompt: recallPrompt });
  // Transfer cleanup ownership even when relaunch/input fails.
  request.replaceState(resumed.state);
  if (resumed.evidence.error) throw new Error('resume terminal input failed');
  const newRoot = resumed.state.captured.find(identity => identity.ProcessId === resumed.state.child.pid);
  evidence.newClientVerified = resumed.state.jobVerified === true && Boolean(newRoot && originalRoot
    && (newRoot.ProcessId !== originalRoot.ProcessId || newRoot.Created !== originalRoot.Created));
  evidence.recoveryStage = 'recall';
  const recalled = await pollTextPhase({ ...request, state: resumed.state, phasePrompt: recallPrompt, submittedAt: resumed.submittedAt, priorAssistantIds });
  const final = (await request.serviceApi(request.cwd, 'GET', `/api/session/${request.sessionID}`)).data;
  evidence.sessionIdentityPreserved &&= sameSession(before, final, request.cwd);
  Object.assign(evidence, { resumeInputMatched: resumed.evidence.terminalInputMatched, resumeOutputObserved: resumed.evidence.terminalOutputObserved,
    resumeOutputTruncated: resumed.outputTruncated(), recallAccepted: recalled.phase.accepted,
    recallJsonMatched: recallEvidence(recalled.phase.assistants, profile).matched, recallStableIdle: recalled.stableIdle,
    noTools: seed.phase.noTools && recalled.phase.noTools });
  evidence.recoveryObserved = evidence.newClientVerified && evidence.sessionIdentityPreserved && evidence.recallJsonMatched && evidence.noTools;
  evidence.recoveryStage = 'completed';
  return evidence;
}

async function main() {
  const before = configFingerprints();
  const profile = { member: 'member-a', role: 'worker', checkpoint: crypto.randomUUID() };
  const prompt = `Store this checkpoint profile in this session: ${JSON.stringify(profile)}. Acknowledge by replying with exactly that JSON object, no other text or tools. Do not read/change files, use shell or call team tools. Then wait.`;
  const task = { kind: 'recovery', prompt, permissions: SERVICE_PERMISSIONS };
  task.observe = request => observe(request, task, profile);
  const names = ['run-client-recovery.js', 'recovery-evidence.js', 'terminal-client.js', 'terminal-task.js', 'terminal-main.js', 'run-tool-probe.js', 'service-cli.js'];
  const evidence = { scope: 'Intentional termination of an idle owned native CLI, then same-session terminal resume; not in-flight/service crash recovery', recordedAt: new Date().toISOString(),
    sourceHashes: Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])),
    seedPromptHash: crypto.createHash('sha256').update(prompt).digest('hex'), recallPromptHash: crypto.createHash('sha256').update(recallPrompt).digest('hex') };
  evidence.run = await runMember('member-a', { terminalMode: true, task });
  evidence.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.run.passed && evidence.selectedConfigsUnchanged;
  evidence.result = evidence.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname, '../evidence/client-recovery-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[recovery] ${evidence.result}`);
  process.exitCode = evidence.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[recovery] lifecycle failure'); process.exitCode = 1; });

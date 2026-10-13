'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMember, configFingerprints } = require('./run-tool-probe');
const { SERVICE_PERMISSIONS } = require('./service-cli');
const { controlEvidence } = require('./control-evidence');
const command = `rtk proxy node -e "require('node:fs').appendFileSync('approval-marker.txt','approved')"`;
const cases = [
  { caseID: 'allow-edit-control', permissions: [{ action: 'edit', resource: '*', effect: 'allow' }, { action: 'edit', resource: 'protected.txt', effect: 'deny' }, ...SERVICE_PERMISSIONS.filter(rule => rule.action !== 'edit')],
    prompt: 'Paired permission control. Your entire turn must contain exactly ONE tool call: edit editable.txt with oldString="original editable bytes" and newString="changed editable bytes". The file contains original editable bytes followed by a newline. After that single edit finishes, reply in plain text and stop. Do not verify by reading, use shell/write/patch, call report_result or any other tool, retry, or change protected.txt or any other file. Exactly one edit call and zero other calls.' },
  { caseID: 'auto-shell', command, expectedMarker: 'approved', permissions: SERVICE_PERMISSIONS.map(rule => ['edit', 'shell'].includes(rule.action) ? { ...rule, effect: 'allow' } : rule),
    prompt: `Permissive shell control: call the shell tool exactly once with command: ${command}. Use the current project directory. Do not use any other tools, edit files, retry or use fallbacks. Stop after that command completes.` },
];

async function observe(task, { cwd, sessionID, serviceApi, state, taskSubmittedAt }) {
  const deadline = Date.now() + 90000;
  let stable = 0;
  let pendingEverObserved = false;
  let evidence = { permissionObserved: false };
  while (Date.now() < deadline) {
    if (state.closed || state.error) throw new Error('control terminal closed');
    const messages = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`)).data;
    const requests = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}/permission`)).data;
    if (!Array.isArray(messages) || !Array.isArray(requests)) throw new Error('control schema invalid');
    pendingEverObserved ||= requests.length !== 0;
    evidence = controlEvidence({ messages, requests, task, cwd });
    const session = (await serviceApi(cwd, 'GET', `/api/session/${sessionID}`)).data;
    const finished = messages.some(message => message.type === 'assistant' && message.finish === 'stop' && message.time?.completed >= taskSubmittedAt);
    stable = finished && session.time?.idle >= taskSubmittedAt ? stable + 1 : 0;
    if (stable >= 2 || !evidence.noAssistantErrors) {
      const filename = task.caseID === 'auto-shell' ? 'approval-marker.txt' : 'editable.txt';
      const expected = task.caseID === 'auto-shell' ? 'approved' : 'changed editable bytes\n';
      const candidate = path.join(cwd, filename);
      const fileBeforeStopMatched = fs.existsSync(candidate) && fs.readFileSync(candidate).equals(Buffer.from(expected));
      return { ...evidence, stableIdle: stable >= 2, pendingEverObserved, approvalRepliesSent: 0, fileBeforeStopMatched,
        permissionObserved: evidence.permissionObserved && stable >= 2 && !pendingEverObserved && fileBeforeStopMatched };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { ...evidence, pendingEverObserved, observationTimedOut: true, permissionObserved: false };
}

async function main() {
  const before = configFingerprints();
  const names = ['run-permission-controls.js', 'control-evidence.js', 'permission-evidence.js', 'run-tool-probe.js', 'terminal-task.js', 'service-cli.js', 'service-quiescence.js'];
  const sourceHashes = Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')]));
  const result = { scope: 'Paired allowed edit and configured shell-allow controls; no --auto flag or approval replies', recordedAt: new Date().toISOString(), sourceHashes, runs: [] };
  const target = path.resolve(__dirname, '../evidence/permission-controls-latest.json');
  for (const definition of cases) {
    console.log(`[controls] starting ${definition.caseID}`);
    const task = { ...definition, kind: 'permission', observe: request => observe(definition, request) };
    const run = await runMember('member-a', { terminalMode: true, task });
    result.runs.push({ caseID: definition.caseID, promptHash: crypto.createHash('sha256').update(definition.prompt).digest('hex'), ...run });
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
    console.log(`[controls] ${definition.caseID} passed=${run.passed}`);
    if (!run.tempRemoved || !run.cli?.cleanup?.verified || !run.cli?.serviceIdentityUnchanged) break;
  }
  result.selectedConfigsUnchanged = JSON.stringify(before) === JSON.stringify(configFingerprints());
  result.passed = result.runs.length === cases.length && result.runs.every(run => run.passed) && result.selectedConfigsUnchanged;
  result.result = result.passed ? 'PASS' : 'PARTIAL_OR_FAILED';
  fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
  console.log(`[controls] ${result.result}`);
  process.exitCode = result.passed ? 0 : 2;
}
if (require.main === module) main().catch(() => { console.error('[controls] lifecycle failure'); process.exitCode = 1; });

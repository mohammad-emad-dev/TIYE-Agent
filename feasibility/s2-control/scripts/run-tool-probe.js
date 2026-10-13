'use strict';

// Explicit opt-in standalone CLI model request; no direct tools/call bypass.
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeStandaloneReport } = require('./persistent-cli');
const { probeServiceReport, SERVICE_PERMISSIONS } = require('./service-cli');
const { terminalTask, T1_SUMMARY } = require('./terminal-task');
const { permissionRunPassed } = require('./permission-evidence');
const terminalMode = process.argv.includes('--terminal');
const serviceMode = process.argv.includes('--service') || terminalMode;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function configFingerprints() {
  const directories = [path.join(os.homedir(), '.config/opencode'), path.resolve(__dirname, '../../..'), path.resolve(__dirname, '..')];
  return directories.flatMap((directory) => ['opencode.json', 'opencode.jsonc'].map((name) => {
    const candidate = path.join(directory, name);
    return fs.existsSync(candidate) ? crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex') : null;
  }));
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('fixture lifecycle deadline exceeded');
    await delay(100);
  }
}

async function runMember(member, { terminalMode = false, serviceMode = terminalMode, captureName = `t1-${member}`, allowNudge = false, task = {} } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-model-'));
  const token = crypto.randomBytes(32).toString('hex');
  const summary = terminalMode ? T1_SUMMARY : `tiye-probe-${crypto.randomUUID()}`;
  const expectedTool = task.tool || 'report_result';
  const permissions = task.permissions || SERVICE_PERMISSIONS.map(rule => terminalMode && task.kind !== 'question' && rule.action === 'edit' ? { ...rule, effect: 'allow' } : rule);
  if (expectedTool === 'ask_leader') permissions.push({ action: 'tiye-team-tools_ask_leader', resource: '*', effect: 'allow' });
  let fixture;
  let output = '';
  let truncated = false;
  let failed = false;
  let closed = false;
  const evidence = { member, serverReportCalls: 0, matchingReports: 0, otherServerCalls: 0 };
  try {
    fixture = spawn(process.execPath, [path.resolve(__dirname, '../src/team-tools-server.js')], {
      env: { ...process.env, TIYE_S2_PORT: '0', TIYE_S2_TOKENS_JSON: JSON.stringify({ [member]: token }), TIYE_S2_EXPECTED_SUMMARY: summary, TIYE_S2_EXPECTED_QUESTION: task.question || '' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    fixture.stdout.on('data', (chunk) => { const next = output + chunk; truncated ||= next.length > 32000; output = next.slice(-32000); });
    fixture.stderr.on('data', () => { failed = true; });
    fixture.on('error', () => { failed = true; });
    fixture.on('close', () => { closed = true; });
    await waitUntil(() => failed || /ready host=127\.0\.0\.1 port=(\d+)/.test(output), 8000);
    if (failed) throw new Error('fixture startup failed');
    const port = Number(/ready host=127\.0\.0\.1 port=(\d+)/.exec(output)[1]);
    if (terminalMode) {
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'tiye-t1-fixture', private: true, scripts: { test: 'node --test' } }));
      fs.writeFileSync(path.join(cwd, 'README.md'), 'Disposable TIYE T1 project. Add clamp.js and clamp.test.js.\n');
      if (task.kind === 'permission') fs.writeFileSync(path.join(cwd, 'protected.txt'), 'original protected bytes\n');
      for (const args of [['init', '--quiet'], ['add', 'package.json', 'README.md'], ['-c', 'user.name=TIYE Fixture', '-c', 'user.email=fixture@local', 'commit', '--quiet', '-m', 'Initial T1 fixture']]) {
        if (spawnSync('git', args, { cwd, windowsHide: true }).status !== 0) throw new Error('T1 Git fixture failed');
      }
    }
    fs.writeFileSync(path.join(cwd, 'opencode.json'), JSON.stringify({
      permissions: serviceMode ? permissions : [{ action: '*', resource: '*', effect: 'deny' }, { action: 'tiye-team-tools_report_result', resource: '*', effect: 'allow' }],
      mcp: { servers: { 'tiye-team-tools': {
        type: 'remote', url: `http://127.0.0.1:${port}/mcp`, disabled: false, oauth: false, codemode: false,
        headers: { Authorization: `Bearer ${token}` },
      } } },
    }));
    evidence.cli = await (serviceMode ? probeServiceReport : probeStandaloneReport)({ cwd, summary, member, ...(terminalMode ? { sessionPermissions: permissions, terminalTask: parameters => terminalTask({ ...parameters, allowNudge, task }) } : {}) });
    if (task.kind === 'permission') {
      evidence.protectedFileUnchanged = fs.readFileSync(path.join(cwd, 'protected.txt')).equals(Buffer.from('original protected bytes\n'));
      evidence.commandMarkerAbsent = !fs.existsSync(path.join(cwd, 'approval-marker.txt'));
      evidence.commandMarkerMatched = task.expectedMarker !== undefined && !evidence.commandMarkerAbsent && fs.readFileSync(path.join(cwd, 'approval-marker.txt')).equals(Buffer.from(task.expectedMarker));
      const changed = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, windowsHide: true, encoding: 'utf8' });
      const expectedPaths = task.expectedMarker === undefined ? ['opencode.json', 'protected.txt'] : ['approval-marker.txt', 'opencode.json', 'protected.txt'];
      evidence.onlyFixtureFilesPresent = changed.status === 0 && JSON.stringify(changed.stdout.trim().split(/\r?\n/).map(line => line.slice(3)).sort()) === JSON.stringify(expectedPaths);
    }
    if (terminalMode && task.kind !== 'permission' && evidence.cli.completedAck && evidence.cli.idleVerified) {
      if (task.kind !== 'question') {
      const target = path.resolve(__dirname, '../evidence', captureName);
      fs.mkdirSync(target, { recursive: true });
      for (const name of ['clamp.js', 'clamp.test.js']) fs.copyFileSync(path.join(cwd, name), path.join(target, name));
      evidence.taskFilesCaptured = true;
      }
      const changed = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, windowsHide: true, encoding: 'utf8' });
      const paths = changed.stdout.trim().split(/\r?\n/).map(line => line.slice(3)).sort();
      evidence.onlyTaskFilesChanged = changed.status === 0 && JSON.stringify(paths) === JSON.stringify(task.kind === 'question' ? ['opencode.json'] : ['clamp.js', 'clamp.test.js', 'opencode.json']);
      // Code is retained for orchestrator review before running generated tests.
    }
  } catch {
    evidence.error = 'model fixture failed'; // Never persist response bodies, arguments, or startup output.
  } finally {
    try {
      if (fixture && fixture.pid) {
        fixture.kill();
        await waitUntil(() => closed, 5000);
      }
      evidence.fixtureStopped = true;
    } finally {
      // Only this invocation's verified direct child of the OS temp directory.
      const resolved = fs.realpathSync(cwd);
      if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-s2-model-')) {
        throw new Error('owned temporary project boundary invalid');
      }
      if (!serviceMode || evidence.cli?.locationUntouched || (evidence.cli?.sessionStopped && evidence.cli?.sessionRemoved && evidence.cli?.locationEvicted)) fs.rmSync(resolved, { recursive: true });
      evidence.tempRemoved = !fs.existsSync(resolved);
    }
  }
  const lines = output.split('\n');
  evidence.serverReportCalls = lines.filter((line) => line.includes(`tool-call member=${member} tool=report_result valid=true argumentCount=2`)).length;
  evidence.matchingReports = lines.filter((line) => line.includes(`report-match member=${member} matched=true`)).length;
  evidence.serverQuestionCalls = lines.filter(line => line.includes(`tool-call member=${member} tool=ask_leader valid=true argumentCount=1`)).length;
  evidence.matchingQuestions = lines.filter(line => line.includes(`question-match member=${member} matched=true`)).length;
  evidence.otherServerCalls = lines.filter((line) => line.includes('tool-call') && !line.includes(`tool=${expectedTool} `)).length;
  evidence.logHygiene = !output.includes(token) && !output.includes(summary) && (!task.question || !output.includes(task.question)) && !output.includes('Authorization') && !output.includes('ses_');
  evidence.fixtureErrors = failed;
  evidence.serverLogTruncated = truncated;
  const cli = evidence.cli;
  if (task.kind === 'permission') {
    evidence.passed = permissionRunPassed({ run: evidence, caseID: task.caseID });
    return evidence;
  }
  evidence.passed = !evidence.error && !evidence.fixtureErrors && !cli?.error && !cli?.failure
    && cli?.completedAck === true && (terminalMode ? cli.terminalInputMatched && cli.terminalOutputObserved && cli.shellCalls === 0 && cli.otherTeamToolCalls === 0 && (!cli.nudgeUsed || (cli.nudgeInputMatched && cli.nudgePromptAccepted)) && (!task.briefing || (cli.briefingFirstUserMessage && cli.briefingAccepted && cli.briefingNoTools && cli.briefingStableIdle && cli.codingInputMatched && cli.recallInputMatched && cli.recallAccepted && cli.recallNoTools && cli.recallStableIdle && cli.recall?.matched)) && evidence.onlyTaskFilesChanged && (task.kind === 'question' ? cli.codingToolCalls === 0 : evidence.taskFilesCaptured) : cli.otherToolCalls === 0 && cli.cliExitCode === 0 && !cli.malformedEvents) && !cli.cliSpawnError && !cli.outputTruncated
    && cli.cleanup?.verified === true && cli.cleanup.jobVerified === true
    && (!serviceMode || (cli.modelConfirmed && cli.executedModelConfirmed && cli.locationConfirmed && cli.connected && cli.sessionStopped && cli.idleVerified && cli.sessionRemoved && cli.locationEvicted && cli.serviceIdentityUnchanged))
    && (expectedTool === 'ask_leader' ? evidence.serverQuestionCalls === 1 && evidence.matchingQuestions === 1 : evidence.serverReportCalls === 1 && evidence.matchingReports === 1) && evidence.otherServerCalls === 0
    && evidence.logHygiene === true && !evidence.serverLogTruncated && evidence.fixtureStopped === true && evidence.tempRemoved === true;
  if (terminalMode) {
    evidence.roundTripPassed = evidence.passed;
    evidence.taskCorrectness = 'Not evaluated: review captured code and run independent tests before claiming T1 success';
    evidence.passed = false;
  }
  return evidence;
}

async function main() {
  const beforeConfigs = configFingerprints();
  const evidence = { scope: terminalMode ? 'Electron xterm/node-pty T1 delivery and report; generated code requires independent review and tests; not ten-run S2.2 reliability' : `Native ${serviceMode ? 'service-backed' : 'standalone'} Muse xhigh report_result invocation; not full S2.2 reliability`, recordedAt: new Date().toISOString(), runs: [] };
  for (const member of ['member-a', 'member-b']) {
    console.log(`[tool-probe] starting ${member}`);
    evidence.runs.push(await runMember(member, { terminalMode, serviceMode }));
    console.log(`[tool-probe] ${member} ${terminalMode ? 'roundTripPassed' : 'passed'}=${terminalMode ? evidence.runs.at(-1).roundTripPassed : evidence.runs.at(-1).passed}`);
  }
  evidence.selectedConfigsUnchanged = JSON.stringify(beforeConfigs) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.runs.every((run) => run.passed) && evidence.selectedConfigsUnchanged;
  if (terminalMode) evidence.result = evidence.runs.every(run => run.roundTripPassed) && evidence.selectedConfigsUnchanged ? 'PARTIAL' : 'BLOCKED_OR_FAILED';
  const evidenceName = terminalMode ? 'terminal-task-latest.json' : serviceMode ? 'service-tool-call-latest.json' : 'tool-call-latest.json';
  fs.writeFileSync(path.resolve(__dirname, '../evidence', evidenceName), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[tool-probe] ${evidence.result === 'PARTIAL' ? 'PARTIAL' : evidence.passed ? 'PASS' : 'FAIL'}; evidence/${evidenceName}`);
  process.exitCode = evidence.result === 'PARTIAL' ? 2 : evidence.passed ? 0 : 1;
}

if (require.main === module) main().catch(() => { console.error('[tool-probe] lifecycle failure; no pass evidence'); process.exitCode = 1; });
module.exports = { runMember, configFingerprints };

'use strict';

// Explicit opt-in standalone CLI model request; no direct tools/call bypass.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeStandaloneReport } = require('./persistent-cli');
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

async function runMember(member) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-model-'));
  const token = crypto.randomBytes(32).toString('hex');
  const summary = `tiye-probe-${crypto.randomUUID()}`;
  let fixture;
  let output = '';
  let truncated = false;
  let failed = false;
  let closed = false;
  const evidence = { member, serverReportCalls: 0, matchingReports: 0, otherServerCalls: 0 };
  try {
    fixture = spawn(process.execPath, [path.resolve(__dirname, '../src/team-tools-server.js')], {
      env: { ...process.env, TIYE_S2_PORT: '0', TIYE_S2_TOKENS_JSON: JSON.stringify({ [member]: token }), TIYE_S2_EXPECTED_SUMMARY: summary },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    fixture.stdout.on('data', (chunk) => { const next = output + chunk; truncated ||= next.length > 32000; output = next.slice(-32000); });
    fixture.stderr.on('data', () => { failed = true; });
    fixture.on('error', () => { failed = true; });
    fixture.on('close', () => { closed = true; });
    await waitUntil(() => failed || /ready host=127\.0\.0\.1 port=(\d+)/.test(output), 8000);
    if (failed) throw new Error('fixture startup failed');
    const port = Number(/ready host=127\.0\.0\.1 port=(\d+)/.exec(output)[1]);
    fs.writeFileSync(path.join(cwd, 'opencode.json'), JSON.stringify({
      permissions: [{ action: '*', resource: '*', effect: 'deny' }, { action: 'tiye-team-tools_report_result', resource: '*', effect: 'allow' }],
      mcp: { servers: { 'tiye-team-tools': {
        type: 'remote', url: `http://127.0.0.1:${port}/mcp`, disabled: false, oauth: false, codemode: false,
        headers: { Authorization: `Bearer ${token}` },
      } } },
    }));
    evidence.cli = await probeStandaloneReport({ cwd, summary, member });
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
      fs.rmSync(resolved, { recursive: true });
      evidence.tempRemoved = !fs.existsSync(resolved);
    }
  }
  const lines = output.split('\n');
  evidence.serverReportCalls = lines.filter((line) => line.includes(`tool-call member=${member} tool=report_result valid=true argumentCount=2`)).length;
  evidence.matchingReports = lines.filter((line) => line.includes(`report-match member=${member} matched=true`)).length;
  evidence.otherServerCalls = lines.filter((line) => line.includes('tool-call') && !line.includes('tool=report_result ')).length;
  evidence.logHygiene = !output.includes(token) && !output.includes(summary) && !output.includes('Authorization') && !output.includes('ses_');
  evidence.fixtureErrors = failed;
  evidence.serverLogTruncated = truncated;
  const cli = evidence.cli;
  evidence.passed = !evidence.error && !evidence.fixtureErrors && !cli?.error && !cli?.failure
    && cli?.completedAck === true && cli.otherToolCalls === 0 && cli.cliExitCode === 0 && !cli.cliSpawnError && !cli.outputTruncated && !cli.malformedEvents
    && cli.cleanup?.verified === true && cli.cleanup.jobVerified === true
    && evidence.serverReportCalls === 1 && evidence.matchingReports === 1 && evidence.otherServerCalls === 0
    && evidence.logHygiene === true && !evidence.serverLogTruncated && evidence.fixtureStopped === true && evidence.tempRemoved === true;
  return evidence;
}

async function main() {
  const beforeConfigs = configFingerprints();
  const evidence = { scope: 'Native standalone Muse xhigh report_result invocation; not full S2.2 reliability', recordedAt: new Date().toISOString(), runs: [] };
  for (const member of ['member-a', 'member-b']) {
    console.log(`[tool-probe] starting ${member}`);
    evidence.runs.push(await runMember(member));
    console.log(`[tool-probe] ${member} passed=${evidence.runs.at(-1).passed}`);
  }
  evidence.selectedConfigsUnchanged = JSON.stringify(beforeConfigs) === JSON.stringify(configFingerprints());
  evidence.passed = evidence.runs.every((run) => run.passed) && evidence.selectedConfigsUnchanged;
  fs.writeFileSync(path.resolve(__dirname, '../evidence/tool-call-latest.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`[tool-probe] ${evidence.passed ? 'PASS' : 'FAIL'}; evidence/tool-call-latest.json`);
  process.exitCode = evidence.passed ? 0 : 1;
}

main().catch(() => { console.error('[tool-probe] lifecycle failure; no pass evidence'); process.exitCode = 1; });

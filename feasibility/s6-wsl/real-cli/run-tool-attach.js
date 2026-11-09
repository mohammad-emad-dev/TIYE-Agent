'use strict';
// Bounded S6 real-CLI tool-attachment probe.  Runs retained Linux Codex
// 0.157.1 against an isolated stdio MCP fixture inside Ubuntu.  No user
// configuration or credentials are read; the fresh CODEX_HOME has no auth,
// so a model turn is expected to stop at authentication.  The fixture log
// shows whether the real CLI attached (initialize/tools list/call) before
// that stop.  No automatic login, no credential copy, no product effect.
//
// Usage: node run-tool-attach.js --out <evidence-dir>

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WSL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const DISTRO = 'Ubuntu';
const LINUX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const BINARY = '/home/mohammad/.local/share/tiye-feasibility/codex-0.157.1-rx5vmnt1/package/bin/codex';
const FIXTURE = '/mnt/d/TIYE Agent/feasibility/s6-wsl/real-cli/mcp_fixture.py';
const PROMPT = 'Call the tiye report_result tool with status done and summary s6-probe. Do not do anything else.';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

function wslExec(script, timeout = 15000) {
  const r = spawnSync(WSL, ['-d', DISTRO, '--exec', '/usr/bin/env', '-i', `PATH=${LINUX_PATH}`, 'LC_ALL=C.UTF-8', '/bin/sh', '-c', script], { encoding: 'utf8', timeout, windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), timedOut: Boolean(r.error) };
}

function listBinaryProcesses() {
  const script = [
    `B=${BINARY}`,
    'for p in /proc/[0-9]*; do',
    '  pid=${p#/proc/}',
    '  exe=$(readlink "$p/exe" 2>/dev/null) || continue',
    '  [ "$exe" = "$B" ] || continue',
    '  start=$(awk \'{print $22}\' "$p/stat" 2>/dev/null) || continue',
    '  cmd=$(tr \'\\0\' \' \' < "$p/cmdline" 2>/dev/null)',
    '  printf "%s|%s|%s\\n" "$pid" "$start" "$cmd"',
    'done',
  ].join('\n');
  const r = wslExec(script);
  return r.stdout === '' ? [] : r.stdout.split(/\r?\n/).map((line) => {
    const [pid, start, cmd] = line.split('|');
    return { pid: Number(pid), startTicks: start, cmdline: cmd || '' };
  });
}

function main() {
  const outDir = path.resolve(arg('--out') || path.join(__dirname, 'out'));
  fs.mkdirSync(outDir, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  const root = `/home/mohammad/.local/share/tiye-feasibility/s6-tool-attach-${runId}`;
  const callLog = `${root}/mcp-calls.jsonl`;

  const preexisting = listBinaryProcesses();
  if (preexisting.length > 0) {
    const evidence = { schema: 'tiye-s6-real-cli-tool-attach-v1', date: new Date().toISOString(), outcome: 'refused-preexisting-process', preexisting };
    fs.writeFileSync(path.join(outDir, 'tool-attach.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.error('REFUSED: exact Linux Codex binary already running');
    process.exitCode = 1;
    return;
  }

  const prepare = wslExec(`umask 077; mkdir -p ${root}/home ${root}/codex ${root}/tmp ${root}/work`);
  const args = [
    '-d', DISTRO, '--exec', '/usr/bin/env', '-i',
    `PATH=${LINUX_PATH}`, `HOME=${root}/home`, `CODEX_HOME=${root}/codex`, `TMPDIR=${root}/tmp`,
    'TERM=dumb', 'LC_ALL=C.UTF-8',
    BINARY, 'exec',
    '--skip-git-repo-check', '--ephemeral', '--ignore-user-config',
    '-C', `${root}/work`,
    '-c', `mcp_servers.tiye.command=${JSON.stringify('/usr/bin/python3')}`,
    '-c', `mcp_servers.tiye.args=${JSON.stringify([FIXTURE])}`,
    '-c', `mcp_servers.tiye.env={TIYE_CALL_LOG=${JSON.stringify(callLog)}}`,
    '-c', 'mcp_servers.tiye.default_tools_approval_mode="approve"',
    PROMPT,
  ];
  const started = Date.now();
  const r = spawnSync(WSL, args, { encoding: 'utf8', timeout: 60000, windowsHide: true, input: '' });
  const elapsedMs = Date.now() - started;
  fs.writeFileSync(path.join(outDir, 'tool-attach.stdout.log'), r.stdout || '');
  fs.writeFileSync(path.join(outDir, 'tool-attach.stderr.log'), r.stderr || '');

  const callsRaw = wslExec(`cat ${callLog} 2>/dev/null`).stdout;
  const events = callsRaw === '' ? [] : callsRaw.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return { event: 'unparseable' }; }
  });
  const methods = events.filter((e) => e.event === 'method').map((e) => e.method);
  const authBlocked = /401|Unauthorized|not logged in|login|auth/i.test(`${r.stdout || ''}\n${r.stderr || ''}`);
  const outcome = events.some((e) => e.event === 'tool-call')
    ? 'tool-round-trip'
    : methods.includes('initialize') && methods.includes('tools/list')
      ? (authBlocked ? 'attached-auth-blocked' : 'attached-turn-blocked')
      : 'blocked-before-mcp';

  // The fixture records its own PID at start.  Its absence after exec exits is
  // a precise identity check; no cmdline scan (which would match this checker).
  const fixturePid = (events.find((e) => e.event === 'server-start') || {}).pid || null;
  const fixtureAliveAfterExit = fixturePid === null ? null : wslExec(`[ -d /proc/${fixturePid} ] && echo ALIVE || echo GONE`).stdout;
  const remainingBinary = listBinaryProcesses();
  for (const p of remainingBinary) {
    // Preflight proved no such process existed before this launch, so every
    // remaining exact-binary process belongs to this bounded probe.
    wslExec(`P=${p.pid}; S=${p.startTicks}; C=$(awk '{print $22}' /proc/$P/stat 2>/dev/null) || exit 0; [ "$C" = "$S" ] || exit 0; kill -TERM $P; sleep 0.5; kill -KILL $P 2>/dev/null || true`);
  }
  const finalBinary = listBinaryProcesses();

  const evidence = {
    schema: 'tiye-s6-real-cli-tool-attach-v1',
    date: new Date().toISOString(),
    distro: DISTRO,
    runtimeRoot: root,
    candidate: { path: BINARY, version: 'codex-cli 0.157.1' },
    fixture: { path: FIXTURE, transport: 'stdio', tools: ['report_result'] },
    codexConfig: {
      command: '/usr/bin/python3',
      args: [FIXTURE],
      envKeys: ['TIYE_CALL_LOG'],
      defaultToolsApprovalMode: 'approve',
      ignoreUserConfig: true,
      ephemeral: true,
      freshCodexHome: true,
      modelRequested: true,
    },
    elapsedMs,
    exit: r.status,
    spawnError: r.error ? String(r.error.message || r.error) : null,
    authBlocked,
    methods,
    events,
    outcome,
    fixturePid,
    fixtureAliveAfterExit,
    remainingBinaryProcessesBeforeCleanup: remainingBinary,
    finalBinaryProcesses: finalBinary,
    cleanupVerified: fixtureAliveAfterExit === 'GONE' && finalBinary.length === 0,
    limits: {
      noCredentialRead: true,
      noLoginAttempt: true,
      noProductEffect: true,
      freshHome: true,
      modelTurnExpectedToStopWithoutAuth: true,
    },
  };
  fs.writeFileSync(path.join(outDir, 'tool-attach.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'tool-attach.summary.txt'), [
    `outcome=${outcome}`,
    `exit=${r.status}`,
    `elapsedMs=${elapsedMs}`,
    `authBlocked=${authBlocked}`,
    `methods=${methods.join(',')}`,
    `cleanupVerified=${evidence.cleanupVerified}`,
  ].join('\n') + '\n');
  console.log(`outcome=${outcome} exit=${r.status} methods=${methods.join(',')} cleanupVerified=${evidence.cleanupVerified}`);
  process.exitCode = outcome === 'tool-round-trip' ? 0 : 2;
}

main();

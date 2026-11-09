'use strict';
// Bounded S6 real-CLI PTY cohort: Windows ConPTY (node-pty, the same native
// backend the S1 Electron main uses) -> wsl.exe -> Ubuntu -> retained Linux
// Codex 0.157.1.  This is an S6 row-3 mechanics probe, not a model cohort.
//
// Safety:
//   * Fixed binary, fixed argv, isolated HOME/CODEX_HOME/TMPDIR under a fresh
//     owned root.  No user configuration or credential file is read or copied.
//   * TUI mode launches with --no-daemon and sends NO input at all.  The
//     observed login screen is left untouched; no Enter, no login, no model.
//   * Version mode runs `codex --version` only.
//   * A preflight refuses to launch if any process already executes the exact
//     binary (so a later cleanup cannot target an unrelated Codex process).
//   * Teardown uses the recorded Linux PID + /proc start ticks + boot-ID hash.
//     TERM/KILL are sent only to that verified identity.  No arbitrary PID
//     kill, no distribution shutdown.
//   * Evidence stores only fixed paths/identities/marker booleans and a
//     decoded terminal transcript left by the CLI; no credentials.
//
// Usage: node run-pty.js --mode version|tui --out <evidence-dir>

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Reuse the exact node-pty binary installed for the S1 Electron harness.
const pty = require(path.resolve(__dirname, '..', '..', 's1-terminal', 'node_modules', 'node-pty'));

const WSL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const DISTRO = 'Ubuntu';
const LINUX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const BINARY = '/home/mohammad/.local/share/tiye-feasibility/codex-0.157.1-rx5vmnt1/package/bin/codex';
const EXPECTED_VERSION = 'codex-cli 0.157.1';
const START_DEADLINE_MS = 30000;
const EXIT_DEADLINE_MS = 20000;
const TUI_READY_DEADLINE_MS = 25000;
const TUI_SETTLE_MS = 2000;
const TUI_INPUT_TOKEN = 'tiyes6probe7q3z9';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}
function nowIso() { return new Date().toISOString(); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function wslExec(script, timeoutMs = 15000) {
  const r = spawnSync(WSL, [
    '-d', DISTRO, '--exec', '/usr/bin/env', '-i',
    `PATH=${LINUX_PATH}`, 'LC_ALL=C.UTF-8', '/bin/sh', '-c', script,
  ], { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return {
    status: r.status,
    signal: r.signal,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

// Exact-binary process enumeration.  Read-only.  Any hit before launch is a
// hard stop; any hit after teardown is an owned candidate and is recorded.
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
  const out = wslExec(script);
  return out.stdout === '' ? [] : out.stdout.split(/\r?\n/).map((line) => {
    const [pid, start, cmd] = line.split('|');
    return { pid: Number(pid), startTicks: start, cmdline: cmd || '' };
  });
}

function identityScript(root) {
  // The shell records its own PID and start ticks, then execs Codex: the
  // recorded identity is the Codex process itself (same PID).
  return [
    'umask 077',
    `mkdir -p ${root}/home ${root}/codex ${root}/tmp ${root}/work`,
    `echo "pid=$$" > ${root}/identity`,
    `awk '{print "start="$22}' /proc/$$/stat >> ${root}/identity`,
    `printf 'boot=%s\\n' "$(sha256sum /proc/sys/kernel/random/boot_id | cut -d' ' -f1)" >> ${root}/identity`,
    `echo "root_created=$(date +%s)" >> ${root}/identity`,
    `exec ${BINARY} ${arg('--mode') === 'tui' ? '--no-daemon' : '--version'}`,
  ].join('; ');
}

function readIdentity(root) {
  const r = wslExec(`cat ${root}/identity 2>/dev/null`);
  if (r.status !== 0 || r.stdout === '') return null;
  const map = {};
  for (const line of r.stdout.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  }
  if (!map.pid || !map.start || !map.boot) return null;
  return map;
}

function checkIdentity(root, identity) {
  const script = [
    `P=${identity.pid}`,
    `S=${identity.start}`,
    `if [ -d /proc/$P ]; then`,
    `  C=$(awk '{print $22}' /proc/$P/stat 2>/dev/null)`,
    `  if [ "$C" = "$S" ]; then echo ALIVE; else echo REUSED; fi`,
    'else echo GONE; fi',
  ].join('\n');
  const r = wslExec(script);
  return r.stdout;
}

function terminateIdentity(root, identity, signalName) {
  return wslExec(`P=${identity.pid}; S=${identity.start}; C=$(awk '{print $22}' /proc/$P/stat 2>/dev/null) || { echo GONE; exit 0; }; [ "$C" = "$S" ] || { echo REUSED; exit 0; }; kill -${signalName} $P; sleep 0.5; if [ -d /proc/$P ] && [ "$(awk '{print $22}' /proc/$P/stat 2>/dev/null)" = "$S" ]; then echo ALIVE; else echo GONE; fi`);
}

async function main() {
  const mode = arg('--mode');
  const outDir = path.resolve(arg('--out') || path.join(__dirname, 'out'));
  if (!['version', 'tui'].includes(mode)) throw new Error('--mode must be version or tui');
  fs.mkdirSync(outDir, { recursive: true });

  const runId = `${nowIso().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  const root = `/home/mohammad/.local/share/tiye-feasibility/s6-real-cli-${runId}`;

  const preexisting = listBinaryProcesses();
  const evidence = {
    schema: 'tiye-s6-real-cli-pty-v1',
    date: nowIso(),
    mode,
    distro: DISTRO,
    binary: BINARY,
    expectedVersion: EXPECTED_VERSION,
    runtimeRoot: root,
    fixedLinuxPath: LINUX_PATH,
    argv: mode === 'tui' ? [BINARY, '--no-daemon'] : [BINARY, '--version'],
    stdinWritten: false,
    loginAttempted: false,
    modelRequested: false,
    preexistingBinaryProcesses: preexisting,
  };
  if (preexisting.length > 0) {
    evidence.outcome = 'refused-preexisting-process';
    evidence.note = 'Exact Linux Codex binary already running; refusing to launch so cleanup cannot touch an unrelated process.';
    fs.writeFileSync(path.join(outDir, `pty-${mode}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    console.error(`REFUSED: ${preexisting.length} pre-existing process(es) execute the exact binary; no launch`);
    process.exitCode = 1;
    return;
  }

  console.log(`spawn: ${WSL} -d ${DISTRO} --exec env -i ... /bin/sh -c <fresh root ${root}>`);
  const script = identityScript(root);
  const env = { ...process.env, TERM: 'xterm-256color' };
  delete env.WSLENV;
  const term = pty.spawn(WSL, [
    '-d', DISTRO, '--exec', '/usr/bin/env', '-i',
    `PATH=${LINUX_PATH}`, `HOME=${root}/home`, `CODEX_HOME=${root}/codex`,
    `TMPDIR=${root}/tmp`, 'TERM=xterm-256color', 'LC_ALL=C.UTF-8', '/bin/sh', '-c', script,
  ], { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env });

  let decoded = '';
  let exited = null;
  const startedAt = Date.now();
  term.onData((d) => { decoded += d; });
  term.onExit((e) => { exited = e; });

  const identity = await (async () => {
    while (Date.now() - startedAt < START_DEADLINE_MS) {
      const id = readIdentity(root);
      if (id) return id;
      if (exited) return null;
      await sleep(300);
    }
    return null;
  })();
  evidence.identity = identity;
  evidence.identityCaptureMs = Date.now() - startedAt;

  let marker = null;
  let inputTokenObserved = false;
  if (mode === 'tui') {
    const deadline = Date.now() + TUI_READY_DEADLINE_MS;
    while (Date.now() < deadline) {
      if (/Ask Codex to do anything/i.test(decoded)) { marker = 'composer-marker'; break; }
      if (/Sign in with ChatGPT/i.test(decoded)) { marker = 'login-screen-marker'; break; }
      if (exited) break;
      await sleep(250);
    }
    if (marker !== null) {
      // Let the TUI settle its async model/directory fields before capture.
      await sleep(TUI_SETTLE_MS);
      if (arg('--input') === 'yes' && marker === 'composer-marker') {
        // Fixed harmless ASCII token, written once through the PTY.  No
        // Enter, so nothing is submitted and no model request is made.
        term.write(TUI_INPUT_TOKEN);
        await sleep(1000);
        inputTokenObserved = decoded.includes(TUI_INPUT_TOKEN);
        evidence.input = {
          token: TUI_INPUT_TOKEN,
          bytes: TUI_INPUT_TOKEN.length,
          enterSent: false,
          observedInPtyOutput: inputTokenObserved,
        };
      }
    }
  } else {
    const deadline = Date.now() + EXIT_DEADLINE_MS;
    while (Date.now() < deadline && !exited) await sleep(100);
    if (decoded.includes(EXPECTED_VERSION)) marker = 'version-marker';
  }
  evidence.marker = marker;
  evidence.screen = {
    composer: /Ask Codex to do anything/i.test(decoded),
    login: /Sign in with ChatGPT/i.test(decoded),
    versionLine: /OpenAI Codex \(v\d+\.\d+\.\d+\)/.test(decoded),
  };
  evidence.readyMs = Date.now() - startedAt;
  evidence.decodedBytes = Buffer.byteLength(decoded, 'utf8');
  evidence.decodedSha256 = sha256(Buffer.from(decoded, 'utf8'));
  evidence.cliExit = exited;
  evidence.transcriptPath = `pty-${mode}.log`;
  fs.writeFileSync(path.join(outDir, `pty-${mode}.log`), decoded);

  // Teardown: kill only the runner-owned PTY client, then observe the Linux
  // identity independently.  A survivor is the row-8 finding, not a pass.
  let killError = null;
  try { term.kill(); } catch (err) { killError = String(err && err.message ? err.message : err); }
  const killedAt = Date.now();
  if (identity) {
    await sleep(2500);
    const afterKill = checkIdentity(root, identity);
    evidence.teardown = {
      ptyKillError: killError,
      waitMs: Date.now() - killedAt,
      linuxIdentityAfterPtyKill: afterKill,
      survivedPtyKill: afterKill === 'ALIVE',
    };
    if (afterKill === 'ALIVE') {
      evidence.teardown.termResult = terminateIdentity(root, identity, 'TERM');
      await sleep(1000);
      evidence.teardown.afterTerm = checkIdentity(root, identity);
      if (evidence.teardown.afterTerm === 'ALIVE') {
        evidence.teardown.killResult = terminateIdentity(root, identity, 'KILL');
        await sleep(700);
        evidence.teardown.afterKill = checkIdentity(root, identity);
      }
    }
    // Any remaining exact-binary process is ours by the preflight invariant.
    const remaining = listBinaryProcesses();
    evidence.teardown.remainingBinaryProcesses = remaining;
    for (const p of remaining) {
      terminateIdentity(root, { pid: p.pid, start: p.startTicks }, 'TERM');
    }
    await sleep(500);
    evidence.teardown.finalBinaryProcesses = listBinaryProcesses();
  } else {
    evidence.teardown = { ptyKillError: killError, identityUnavailable: true };
  }

  const final = checkIdentity(root, identity || { pid: '0', start: '0' });
  evidence.cleanupVerified = identity !== null && final === 'GONE' && (evidence.teardown.finalBinaryProcesses || []).length === 0;
  evidence.outcome = mode === 'version'
    ? (marker === 'version-marker' && exited && exited.exitCode === 0 && evidence.cleanupVerified ? 'pass-bounded' : 'fail-bounded')
    : (marker === 'composer-marker' && evidence.cleanupVerified
      ? (inputTokenObserved ? 'partial-composer-input' : 'partial-composer')
      : marker === 'login-screen-marker' && evidence.cleanupVerified
        ? 'partial-login-screen'
        : 'blocked');

  const jsonPath = path.join(outDir, `pty-${mode}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, `pty-${mode}.summary.txt`), [
    `schema=${evidence.schema}`,
    `mode=${mode}`,
    `outcome=${evidence.outcome}`,
    `marker=${marker}`,
    `readyMs=${evidence.readyMs}`,
    `decodedBytes=${evidence.decodedBytes}`,
    `cliExit=${JSON.stringify(exited)}`,
    `identityCaptured=${identity !== null}`,
    `screen=${JSON.stringify(evidence.screen)}`,
    `inputTokenObserved=${inputTokenObserved}`,
    `survivedPtyKill=${evidence.teardown ? evidence.teardown.survivedPtyKill : 'unknown'}`,
    `cleanupVerified=${evidence.cleanupVerified}`,
    `remainingBinaryProcesses=${JSON.stringify(evidence.teardown ? evidence.teardown.finalBinaryProcesses : [])}`,
  ].join('\n') + '\n');
  console.log(`outcome=${evidence.outcome} marker=${marker} readyMs=${evidence.readyMs} bytes=${evidence.decodedBytes} cleanupVerified=${evidence.cleanupVerified}`);
  process.exitCode = evidence.outcome === 'fail-bounded' || evidence.outcome === 'blocked' ? 1 : 0;
}

main().catch((err) => {
  console.error(`FAIL: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 2;
});

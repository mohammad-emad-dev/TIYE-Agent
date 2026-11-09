'use strict';
// Bounded S6 inventory: Windows WSL distribution list plus one fixed-PATH
// Ubuntu discovery pass.  Presence/version only; no provider CLI is invoked
// with a prompt and no configuration or credential file is read.
//
// Usage: node run-inventory.js --out <evidence-dir>

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WSL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const DISTRO = 'Ubuntu';
const LINUX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const CANDIDATE = '/home/mohammad/.local/share/tiye-feasibility/codex-0.157.1-rx5vmnt1/package/bin/codex';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

function decodeWslList(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.includes(0)) return buf.toString('utf16le').replace(/^\uFEFF/, '');
  return buf.toString('utf8');
}

function main() {
  const outDir = path.resolve(arg('--out') || path.join(__dirname, 'out'));
  fs.mkdirSync(outDir, { recursive: true });

  const list = spawnSync(WSL, ['--list', '--verbose'], { encoding: 'buffer', timeout: 20000, windowsHide: true });
  const listText = decodeWslList(list.stdout || Buffer.alloc(0));
  const distros = listText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !/^NAME\s+STATE\s+VERSION/i.test(line)).map((line) => {
    const current = line.startsWith('*');
    const clean = current ? line.slice(1).trim() : line;
    const cols = clean.split(/\s{2,}/);
    return { current, name: cols[0] || '', state: cols[1] || '', version: cols[2] || '' };
  });

  const presenceScript = [
    'printf "uid=%s\\n" "$(id -u)"',
    '. /etc/os-release; printf "os_id=%s\\nos_version=%s\\nos_name=%s\\n" "$ID" "$VERSION_ID" "$PRETTY_NAME"',
    'printf "kernel=%s\\n" "$(uname -r)"',
    'command -v wslinfo || true',
    'if command -v wslinfo >/dev/null 2>&1; then printf "networking_mode=%s\\n" "$(wslinfo --networking-mode 2>/dev/null)"; fi',
    'for c in git python3 node npm codex claude opencode gemini; do',
    '  p=$(command -v "$c" 2>/dev/null) || p=""; printf "tool_%s=%s\\n" "$c" "$p";',
    'done',
    'printf "git_version=%s\\n" "$(/usr/bin/git --version 2>/dev/null)"',
    `printf "candidate_path=%s\\n" "${CANDIDATE}"`,
    `if [ -x "${CANDIDATE}" ]; then printf "candidate_version=%s\\n" "$("${CANDIDATE}" --version 2>/dev/null)"; else printf "candidate_version=absent\\n"; fi`,
  ].join('\n');
  const presence = spawnSync(WSL, [
    '-d', DISTRO, '--exec', '/usr/bin/env', '-i',
    `PATH=${LINUX_PATH}`, 'LC_ALL=C.UTF-8', '/bin/sh', '-c', presenceScript,
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true });

  const observed = {};
  for (const line of (presence.stdout || '').trim().split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) observed[line.slice(0, i)] = line.slice(i + 1);
  }
  const tools = {};
  for (const name of ['git', 'python3', 'node', 'npm', 'codex', 'claude', 'opencode', 'gemini']) {
    tools[name] = observed[`tool_${name}`] || null;
  }

  const evidence = {
    schema: 'tiye-s6-real-cli-inventory-v1',
    date: new Date().toISOString(),
    wslListExit: list.status,
    wslListDecoded: listText.trim(),
    distros,
    selectedDistro: DISTRO,
    fixedLinuxPath: LINUX_PATH,
    linux: {
      uid: observed.uid || null,
      osId: observed.os_id || null,
      osVersion: observed.os_version || null,
      osName: observed.os_name || null,
      kernel: observed.kernel || null,
      networkingMode: observed.networking_mode || null,
      tools,
      gitVersion: observed.git_version || null,
    },
    retainedCandidate: {
      path: CANDIDATE,
      version: observed.candidate_version || null,
      onFixedPath: tools.codex === CANDIDATE,
    },
    discoveryExit: presence.status,
    discoveryStderr: (presence.stderr || '').trim().slice(0, 500),
    limits: {
      missingToolMeans: 'not found on the fixed tested PATH, not absent from the whole distribution',
      noPackageInstall: true,
      noProviderModelRequest: true,
      noCredentialsRead: true,
    },
  };
  evidence.checks = {
    ubuntuSelected: distros.some((d) => d.name === DISTRO),
    initializedUser: evidence.linux.uid === '1000',
    ubuntuReleaseRecorded: Boolean(evidence.linux.osVersion),
    kernelRecorded: Boolean(evidence.linux.kernel),
    noLinuxProviderCliOnPath: !tools.codex && !tools.claude && !tools.opencode && !tools.gemini,
    linuxNodeAbsentOnPath: tools.node === null,
    retainedCandidateVersionMatches: evidence.retainedCandidate.version === 'codex-cli 0.157.1',
  };
  evidence.ok = evidence.discoveryExit === 0 && Object.values(evidence.checks).every(Boolean);
  fs.writeFileSync(path.join(outDir, 'inventory.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'inventory.summary.txt'), Object.entries(evidence.checks).map(([k, v]) => `${k}=${v}`).join('\n') + `\nok=${evidence.ok}\n`);
  console.log(JSON.stringify(evidence.checks));
  process.exitCode = evidence.ok ? 0 : 1;
}

main();

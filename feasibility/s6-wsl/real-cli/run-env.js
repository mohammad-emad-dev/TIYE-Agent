'use strict';
// Bounded S6 environment-propagation probe.  A fixed allowlist is sent from
// Windows into Ubuntu through WSLENV; the same process proves an unlisted
// variable stays absent and that Git resolves the supplied author identity.
// No credential or secret is used.
//
// Usage: node run-env.js --out <evidence-dir>

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WSL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const DISTRO = 'Ubuntu';
const LINUX_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const SENTINEL = 'tiye-s6-sentinel-7q3z9';
const AUTHOR = 'TIYE S6 Probe';
const EMAIL = 'tiye-s6@invalid';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

function main() {
  const outDir = path.resolve(arg('--out') || path.join(__dirname, 'out'));
  fs.mkdirSync(outDir, { recursive: true });

  const env = {
    ...process.env,
    TIYE_S6_SENTINEL: SENTINEL,
    GIT_AUTHOR_NAME: AUTHOR,
    GIT_AUTHOR_EMAIL: EMAIL,
    TIYE_S6_PATH: 'D:\\TIYE Agent',
    TIYE_S6_NOT_ALLOWED: 'must-not-arrive',
    // `/p` translates the Windows path, default entries pass through.  The
    // unlisted variable above must not appear on the Linux side.
    WSLENV: 'TIYE_S6_SENTINEL:GIT_AUTHOR_NAME:GIT_AUTHOR_EMAIL:TIYE_S6_PATH/p',
  };
  // The outer WSL shell receives only WSLENV-allowlisted variables.  It then
  // builds a second, explicitly allowlisted child environment; the unlisted
  // variable is deliberately not forwarded.
  const inner = [
    'for k in TIYE_S6_SENTINEL GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL TIYE_S6_PATH TIYE_S6_NOT_ALLOWED; do',
    '  if v=$(printenv "$k"); then echo "$k=$v"; else echo "$k=<unset>"; fi',
    'done',
    '/usr/bin/git var GIT_AUTHOR_IDENT',
  ].join('\n');
  const sq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const script = [
    'env -i',
    `PATH=${LINUX_PATH}`,
    'LC_ALL=C.UTF-8',
    'TIYE_S6_SENTINEL="$TIYE_S6_SENTINEL"',
    'GIT_AUTHOR_NAME="$GIT_AUTHOR_NAME"',
    'GIT_AUTHOR_EMAIL="$GIT_AUTHOR_EMAIL"',
    'TIYE_S6_PATH="$TIYE_S6_PATH"',
    `/bin/sh -c ${sq(inner)}`,
  ].join(' ');
  const r = spawnSync(WSL, [
    '-d', DISTRO, '--exec', '/bin/sh', '-c', script,
  ], { encoding: 'utf8', env, timeout: 20000, windowsHide: true });

  const lines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const values = {};
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i > 0) values[line.slice(0, i)] = line.slice(i + 1);
  }
  const gitIdent = lines.find((line) => line.includes('<' + EMAIL + '>')) || '';
  const evidence = {
    schema: 'tiye-s6-real-cli-env-v1',
    date: new Date().toISOString(),
    distro: DISTRO,
    fixedLinuxPath: LINUX_PATH,
    windowsEnv: {
      WSLENV: env.WSLENV,
      TIYE_S6_SENTINEL: SENTINEL,
      GIT_AUTHOR_NAME: AUTHOR,
      GIT_AUTHOR_EMAIL: EMAIL,
      TIYE_S6_PATH: env.TIYE_S6_PATH,
      TIYE_S6_NOT_ALLOWED: env.TIYE_S6_NOT_ALLOWED,
    },
    linuxObserved: values,
    gitAuthorIdent: gitIdent,
    checks: {
      sentinelArrived: values.TIYE_S6_SENTINEL === SENTINEL,
      gitNameArrived: values.GIT_AUTHOR_NAME === AUTHOR,
      gitEmailArrived: values.GIT_AUTHOR_EMAIL === EMAIL,
      pathTranslated: values.TIYE_S6_PATH === '/mnt/d/TIYE Agent',
      unlistedAbsent: values.TIYE_S6_NOT_ALLOWED === '<unset>',
      gitResolvedAuthor: gitIdent.includes(AUTHOR) && gitIdent.includes(EMAIL),
    },
    exit: r.status,
    stderr: (r.stderr || '').trim().slice(0, 500),
    timedOut: r.error ? String(r.error.message || r.error) : false,
  };
  evidence.ok = Object.values(evidence.checks).every(Boolean) && evidence.exit === 0;
  fs.writeFileSync(path.join(outDir, 'env.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'env.summary.txt'), Object.entries(evidence.checks).map(([k, v]) => `${k}=${v}`).join('\n') + `\nexit=${evidence.exit}\n`);
  console.log(Object.entries(evidence.checks).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`exit=${evidence.exit} ok=${evidence.ok}`);
  process.exitCode = evidence.ok ? 0 : 1;
}

main();

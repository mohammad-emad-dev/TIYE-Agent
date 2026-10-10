'use strict';
// The ordinary startup gate must pause visibly without launching or stopping
// a member for both malformed and valid-looking test registries.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const TIMEOUT_MS = 45000;
const distMain = path.resolve(__dirname, '..', 'dist', 'main.js');

function logChild(label, chunk) {
  for (const line of chunk.toString('utf8').split(/\r?\n/)) {
    if (line) console.log(`[${label}] ${line}`);
  }
}

async function runCase(label, registryContents, expectedRegistryLine) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-startup-recovery-alert-'));
  const registryPath = path.join(runDir, 'registry.json');
  fs.writeFileSync(registryPath, registryContents, 'utf8');
  let output = '';
  try {
    const env = { ...process.env, TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH: registryPath };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [distMain, '--startup-recovery-alert-smoke'], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        output += chunk.toString('utf8');
        logChild(label, chunk);
      });
    }
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          child.kill(); // runner-owned Electron handle only
        } catch {
          /* the timeout is still a harness failure */
        }
        reject(Object.assign(new Error(`${label}: Electron timed out`), { code: 2 }));
      }, TIMEOUT_MS);
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(Object.assign(err, { code: 2 }));
      });
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 2);
      });
    });
    if (code === 2 || /\[startup-recovery-alert-smoke\] INCONCLUSIVE/.test(output)) {
      throw Object.assign(new Error(`${label}: UI could not be verified`), { code: 2 });
    }
    const required = [
      /\[startup-recovery\] ALERT/,
      /\[startup-recovery\] NO-MEMBER no-pty-spawn no-duplicate-launch spawnCount=0/,
      /\[startup-recovery\] NO-HELPER/,
      /\[startup-recovery-alert-smoke\] VISIBLE isVisible=true/,
      /\[startup-recovery-alert-smoke\] PASS/,
      expectedRegistryLine,
    ];
    const forbidden = [
      /\[crash-pty-survivor-recovery\]/,
      /HELPER-INVOKED|\[verified-stop\]/,
      /\[s1\] spawning/,
      /tree-detached ready/i,
    ];
    if (code !== 0 || required.some((re) => !re.test(output)) || forbidden.some((re) => re.test(output))) {
      throw Object.assign(new Error(`${label}: alert/no-member/no-helper contract failed (exit=${code})`), { code: 1 });
    }
    console.log(`[runner] ${label}: PASS visible paused alert, no member, no recovery/helper call`);
  } finally {
    fs.unlinkSync(registryPath);
    fs.rmdirSync(runDir);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw Object.assign(new Error(`Windows-only smoke (platform=${process.platform})`), { code: 2 });
  }
  if (!fs.existsSync(distMain)) {
    throw Object.assign(new Error('dist/main.js missing; run npm run build first'), { code: 2 });
  }
  const createdAt = '2000-01-01T00:00:00.000Z';
  const validLookingRegistry = {
    schema: 'tiye-crash-pty-survivor-registry', version: 1,
    sessionId: 'startup-alert-smoke', memberId: 'crash-pty-survivor-member',
    mainPid: 999997, rootPid: 999998, rootCreationTime: createdAt, rootName: 'node.exe',
    childPid: 999999, childCreationTime: createdAt, childName: 'node.exe',
    childParentPid: 999998, lastIntent: 'run', createdAt,
  };
  await runCase('malformed', 'INVALID-REGISTRY\n', /\[startup-recovery\] ALERT malformed-or-missing registry/);
  await runCase('valid-looking', JSON.stringify(validLookingRegistry), /\[startup-recovery\] PENDING valid-looking registry/);
  console.log('[runner] STARTUP-RECOVERY-ALERT PASS: both registry states showed the visible paused alert without a PTY, recovery call, or helper.');
  console.log('[runner] Scope: mock feasibility only; registry authenticity and product resumption remain open.');
}

main().catch((err) => {
  console.error(`[runner] STARTUP-RECOVERY-ALERT ${err.code === 1 ? 'FAIL' : 'INCONCLUSIVE'}: ${err.message}`);
  process.exitCode = err.code === 1 ? 1 : 2;
});

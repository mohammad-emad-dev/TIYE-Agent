'use strict';
const { spawn } = require('node:child_process');
// The parent assigns this waiting launcher to its Windows Job before launch.
process.once('message', settings => {
  if (settings?.type !== 'launch') return;
  const child = spawn(settings.executable, ['acp'], { cwd: settings.cwd, env: { ...process.env, PWD: settings.cwd }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.resume();
  child.on('error', () => process.exit(1));
  child.stdin.on('error', () => {});
  child.on('close', code => process.exit(Number.isInteger(code) ? code : 1));
});

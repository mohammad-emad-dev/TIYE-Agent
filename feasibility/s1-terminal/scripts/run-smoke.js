const { spawn } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const flag = process.argv.includes('--window-smoke') ? '--window-smoke' : '--smoke-test';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.resolve(__dirname, '..', 'dist', 'main.js'), flag], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  windowsHide: true,
});

const timeout = setTimeout(() => {
  console.error(`[runner] ${flag} timed out`);
  child.kill();
  process.exitCode = 1;
}, 45000);

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`[runner] launch failed: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (process.exitCode !== 1) process.exitCode = code ?? 1;
  if (signal) console.error(`[runner] exited by signal ${signal}`);
});

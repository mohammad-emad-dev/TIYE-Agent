'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const role = process.argv[2];
const nonce = process.argv[3];
if (!['root', 'child'].includes(role) || !/^[a-f0-9]{32}$/.test(nonce || '')) throw new Error('Invalid fixture arguments');
fs.writeFileSync(`${role}-started.json`, JSON.stringify({ role, nonce, pid: process.pid, parentPID: process.ppid }));
fs.appendFileSync(`${role}-heartbeat.txt`, 'x');
const heartbeat = setInterval(() => fs.appendFileSync(`${role}-heartbeat.txt`, 'x'), 250);
const child = role === 'root' ? spawn(process.execPath, [__filename, 'child', nonce], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true }) : undefined;
child?.on('error', () => { clearInterval(heartbeat); process.exit(1); });
// Finite lifetime contains a failed probe even if the parent itself disappears.
setTimeout(() => {
  clearInterval(heartbeat);
  fs.writeFileSync(`${role}-completed.txt`, 'completed');
  child?.kill();
  process.exit(0);
}, role === 'root' ? 95000 : 90000);

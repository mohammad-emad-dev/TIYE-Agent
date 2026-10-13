'use strict';
const { spawn } = require('node:child_process');
const { processInventory, waitUntil } = require('./persistent-cli');
const { commandProcessesGone } = require('./command-cancel-evidence');

async function terminateCapturedCommand(captured) {
  const command = '$expected = [Console]::In.ReadToEnd() | ConvertFrom-Json; foreach ($owned in $expected) { $actual = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $owned.ProcessId); if ($actual -and $actual.CreationDate.ToUniversalTime().ToString("o") -eq $owned.Created) { Stop-Process -Id $owned.ProcessId -Force -ErrorAction Stop } }; Write-Output "owned-command-cleanup-complete"';
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let failed = false, output = '', closed = false;
  child.on('error', () => { failed = true; });
  child.stdin.on('error', () => { failed = true; });
  child.stderr.on('data', () => { failed = true; });
  child.stdout.on('data', bytes => { output = (output + bytes).slice(-256); });
  child.on('close', () => { closed = true; });
  const depth = identity => {
    let count = 0, parent = captured.find(entry => entry.ProcessId === identity.ParentProcessId);
    while (parent && count < captured.length) { count++; parent = captured.find(entry => entry.ProcessId === parent.ParentProcessId); }
    return count;
  };
  child.stdin.end(JSON.stringify([...captured].sort((left, right) => depth(right) - depth(left))));
  try {
    await waitUntil(() => failed || closed, 8000);
    if (failed || child.exitCode !== 0 || output.trim() !== 'owned-command-cleanup-complete') throw new Error('owned command fallback cleanup failed');
    return commandProcessesGone(captured, await processInventory());
  } finally { if (!closed) { child.kill(); await waitUntil(() => closed, 5000); } }
}

module.exports = { terminateCapturedCommand };

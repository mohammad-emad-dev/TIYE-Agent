'use strict';
const {app} = require('electron');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const output = process.env.TIYE_S6_RECOVERY_OUTPUT;
const runtime = process.env.TIYE_S6_RECOVERY_RUNTIME;
const stage = process.env.TIYE_S6_RECOVERY_STAGE;
const source = fs.readFileSync(path.join(__dirname, 'linux.py'), 'utf8');
app.setPath('userData', path.join(runtime, stage));
app.disableHardwareAcceleration();
const report = {stage, electronPid: process.pid, electron: process.versions.electron,
  node: process.versions.node, observations: [], completed: false};
function save() {
  const file = path.join(output, stage + '.json');
  const fd = fs.openSync(file, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function query(mode, config) {
  const args = ['-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL=C.UTF-8',
    '/usr/bin/python3', '-u', '-c', source, mode];
  const start = performance.now();
  const child = spawnSync('wsl.exe', args, {input: JSON.stringify(config), timeout: 10000,
    maxBuffer: 1024 * 1024, windowsHide: true});
  const prefix = stage + '-' + String(report.observations.length).padStart(2, '0') + '-' + mode;
  fs.writeFileSync(path.join(output, prefix + '.stdout.bin'), child.stdout || Buffer.alloc(0));
  fs.writeFileSync(path.join(output, prefix + '.stderr.bin'), child.stderr || Buffer.alloc(0));
  const entry = {mode, prefix, exitCode: child.status, signal: child.signal,
    elapsedMs: performance.now() - start, error: child.error?.message || null};
  report.observations.push(entry); save();
  if (child.error || child.status !== 0 || child.stderr.length) throw Error('WSL query failed: ' + mode);
  entry.result = JSON.parse(child.stdout.toString('utf8')); save();
  return entry.result;
}
function ensure(condition, message) { if (!condition) throw Error(message); }
const live = observation => observation.states.every(s => s.status === 'verified-live');
const gone = observation => observation.states.every(s => s.status === 'gone');
function pause() { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
app.whenReady().then(() => {
  try {
    if (stage === 'crash') {
      const bootstrap = query('bootstrap', {nonce: crypto.randomUUID(), source});
      report.descriptor = bootstrap.descriptor;
      ensure(live(bootstrap.observation), 'Bootstrap identities not live');
      const observation = query('inspect', report.descriptor);
      ensure(live(observation), 'Precrash identities not live');
      report.crashRequested = 'Electron main process.crash';
      report.completed = true; save();
      process.crash();
    } else if (stage === 'restart') {
      const previous = JSON.parse(fs.readFileSync(path.join(output, 'crash.json'), 'utf8'));
      ensure(previous.completed && previous.crashRequested, 'No sealed crash descriptor');
      report.descriptor = previous.descriptor;
      const config = report.descriptor;
      const first = query('inspect', config); pause();
      const second = query('inspect', config);
      ensure(live(first) && live(second), 'Live survivor branch unexercised');
      ensure(['root', 'child'].every(r => second.heartbeats[r].counter > first.heartbeats[r].counter), 'No heartbeat growth');
      const blocked = query('admit', config);
      ensure(blocked.decision === 'blocked-existing' && blocked.newLaunches === 0, 'Duplicate admission failed');
      const refused = query('admit-negative', config);
      ensure(refused.decision === 'paused-unverified' && refused.newLaunches === 0, 'Mismatch launch admission failed');
      const negative = query('negative', config);
      ensure(negative.decision === 'paused-unverified' && negative.signals.length === 0 && negative.newLaunches === 0, 'Mismatch admission failed');
      const afterNegative = query('inspect', config);
      ensure(live(afterNegative), 'Mismatch control disturbed survivor');
      const recovery = query('recover', config);
      ensure(recovery.decision === 'verified-supervisor-signaled' && recovery.signals.length === 1, 'Positive cleanup not exercised');
      const final = query('wait-gone', config); pause();
      const stable = query('inspect', config);
      ensure(gone(final) && gone(stable), 'Original identities not absent');
      ensure(final.bootIdSha256 === first.bootIdSha256 && stable.bootIdSha256 === first.bootIdSha256, 'Boot changed');
      ensure(JSON.stringify(final.heartbeats) === JSON.stringify(stable.heartbeats), 'Heartbeats changed after exit');
      ensure(stable.ageSeconds < 60 && final.supervisorExit?.reason === 'SIGTERM' && final.supervisorExit.childExitCode === 0, 'Cleanup reached deadline or did not reap child');
      ensure(stable.launchRecords.length === 1, 'Unexpected member launch');
      report.completed = true; save(); app.exit(0);
    } else throw Error('Unknown stage');
  } catch (error) {
    report.failure = error.stack; save(); app.exit(1);
  }
}).catch(error => { report.failure = error.stack; save(); app.exit(1); });

'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {s1Require} = require('../../s5-performance/ui/toolchain');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, 'output/s6-recovery');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main() {
  fs.mkdirSync(output);
  const sources = ['protocol.json', 'linux.py', 'main.cjs', 'run.cjs', 'check.py'].map(n => path.join(__dirname, n));
  const inputs = [...sources, path.join(root, 'feasibility/s5-performance/ui/toolchain.js'), s1Require('electron')];
  const hashes = Object.fromEntries(inputs.map(p => [path.relative(root, p).replaceAll('\\', '/'), hash(p)]));
  const runtime = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tiye-s6-recovery-'));
  fs.writeFileSync(path.join(runtime, '.owner'), crypto.randomUUID(), {flag: 'wx'});
  fs.writeFileSync(path.join(output, 'prelaunch.json'), JSON.stringify({sourceBinaryHashes: hashes, runtime, attempts: 1, retries: 0}, null, 2) + '\n');
  const report = {schema: 'tiye-s6-recovery-v1', stages: [], state: 'running',
    fullS6Qualified: false, phase1Construction: 'HOLD', runtimeRetained: true};
  const started = performance.now();
  const save = () => fs.writeFileSync(path.join(output, 'coordinator.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  try {
    for (const stage of ['crash', 'restart']) {
      const env = {...process.env, TIYE_S6_RECOVERY_OUTPUT: output, TIYE_S6_RECOVERY_RUNTIME: runtime, TIYE_S6_RECOVERY_STAGE: stage};
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(s1Require('electron'), [path.join(__dirname, 'main.cjs')], {env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      const stdout = [], stderr = [];
      child.stdout.on('data', b => stdout.push(b)); child.stderr.on('data', b => stderr.push(b));
      const entry = {stage, ownedElectronPid: child.pid, timedOut: false};
      report.stages.push(entry); save();
      const remaining = Math.min(25000, 70000 - (performance.now() - started));
      if (remaining <= 0) { child.kill(); throw Error('Overall deadline exceeded'); }
      const timer = setTimeout(() => { entry.timedOut = true; child.kill(); }, remaining);
      try {
        entry.exit = await new Promise((resolve, reject) => {
          child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal}));
        });
      } finally { clearTimeout(timer); }
      fs.writeFileSync(path.join(output, stage + '.stdout.log'), Buffer.concat(stdout));
      fs.writeFileSync(path.join(output, stage + '.stderr.log'), Buffer.concat(stderr));
      save();
      const native = JSON.parse(fs.readFileSync(path.join(output, stage + '.json'), 'utf8'));
      if (entry.timedOut || !native.completed || native.electronPid !== child.pid) throw Error(stage + ' stage incomplete');
      if (stage === 'crash' && (entry.exit.code === 0 || !native.crashRequested)) throw Error('Abnormal exit not observed');
      if (stage === 'restart' && entry.exit.code !== 0) throw Error('Restart failed');
    }
    report.state = 'bounded-live-survivor-recovery-completed';
  } catch (error) { report.state = 'incomplete'; report.failure = error.message; }
  report.elapsedMs = performance.now() - started;
  report.sourcesUnchanged = inputs.every(p => hash(p) === hashes[path.relative(root, p).replaceAll('\\', '/')]);
  report.artifactSha256 = Object.fromEntries(fs.readdirSync(output).filter(n => n !== 'coordinator.json').sort().map(n => [n, hash(path.join(output, n))]));
  save(); console.log(JSON.stringify(report, null, 2));
  if (report.state !== 'bounded-live-survivor-recovery-completed' || !report.sourcesUnchanged) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });

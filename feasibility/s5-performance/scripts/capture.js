'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { finished } = require('node:stream/promises');
const assert = require('node:assert/strict');
const { validateWorkload, expectedOutput } = require('./workload');
function verifyCapture(summary, storedBytes, count, mode) {
  const expected = expectedOutput(summary.member, count, mode);
  assert.equal(summary.exitCode, 0); assert.equal(summary.stderrBytes, 0);
  assert.equal(summary.bytes, expected.bytes); assert.equal(summary.sha256, expected.sha256);
  assert.equal(storedBytes.length, expected.bytes);
  assert.equal(crypto.createHash('sha256').update(storedBytes).digest('hex'), expected.sha256);
}
async function captureMember(root, member, count, mode) {
  const destination = path.join(root, `member-${member}.log`);
  const file = fs.createWriteStream(destination, { flags:'wx', highWaterMark:1024 });
  const fileDone = finished(file); fileDone.catch(() => {});
  const child = spawn(process.execPath, [path.join(__dirname,'producer.js'),String(member),String(count),mode], { cwd:root,env:{},windowsHide:true,stdio:['ignore','pipe','pipe'] });
  const digest = crypto.createHash('sha256'); let bytes=0, stderrBytes=0, pauseCount=0;
  const closed = new Promise((resolve,reject) => {
    child.once('error', () => reject(new Error('owned-producer-launch-failed')));
    child.once('close', exitCode => resolve(exitCode));
  });
  closed.catch(() => {});
  const deadline = setTimeout(() => file.destroy(new Error('owned-producer-deadline')), 10000);
  file.once('error', () => { child.kill(); child.stdout.destroy(); });
  child.stdout.on('data', chunk => {
    bytes += chunk.length; digest.update(chunk);
    if (!file.write(chunk)) { pauseCount++; child.stdout.pause(); }
  });
  file.on('drain', () => child.stdout.resume());
  child.stdout.once('end', () => file.end());
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
  try {
    const [exitCode] = await Promise.all([closed,fileDone]);
    const summary = {member,bytes,sha256:digest.digest('hex'),exitCode,stderrBytes,pauseCount};
    verifyCapture(summary,fs.readFileSync(destination),count,mode);
    return summary;
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) { child.kill(); child.stdout.destroy(); }
    file.destroy();
    await closed.catch(() => {});
    await fileDone.catch(() => {});
  }
}
function removeOwnedFiles(owner) {
  assert.equal(path.dirname(owner.root),owner.parent);
  assert.equal(fs.realpathSync(owner.root),owner.root);
  assert(!fs.lstatSync(owner.root).isSymbolicLink());
  const names=fs.readdirSync(owner.root).sort();
  assert(names.every(name=>owner.allowed.includes(name)));
  for (const name of names) { const stat=fs.lstatSync(path.join(owner.root,name)); assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1); }
  assert.equal(fs.readFileSync(path.join(owner.root,'.owner'),'utf8'),owner.marker);
  for (const name of names) fs.unlinkSync(path.join(owner.root,name));
  fs.rmdirSync(owner.root);
}
async function captureFive(count,mode) {
  validateWorkload(0,count,mode);
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-ingress-'));
  const marker=crypto.randomUUID(),allowed=['.owner',...Array.from({length:5},(_,member)=>`member-${member}.log`)];
  fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  const started=performance.now();
  try {
    const captures=await Promise.allSettled(Array.from({length:5},(_,member)=>captureMember(root,member,count,mode)));
    const failure=captures.find(capture=>capture.status==='rejected'); if(failure) throw failure.reason;
    const members=captures.map(capture=>capture.value);
    assert.deepEqual(members.map(summary=>summary.member),[0,1,2,3,4]);
    return {members,elapsedMs:performance.now()-started,scope:'five Node stdout producers and file capture; PTY/display not measured'};
  } finally { removeOwnedFiles({parent,root,marker,allowed}); }
}
module.exports = { captureFive, verifyCapture };

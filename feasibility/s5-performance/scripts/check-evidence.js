'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const { expectedOutput }=require('./workload');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function checkCapture(evidence) {
  assert.equal(evidence.schema,'tiye-s5-ingress-v1');
  assert.equal(evidence.providerRequests,0);
  for(const flag of ['ptyMeasured','uiMeasured','inputLatencyMeasured','fullS5Qualified','productionEligible']) assert.equal(evidence[flag],false);
  for(const mode of ['normal','rich']) {
    const capture=evidence[mode];assert(Number.isFinite(capture.elapsedMs)&&capture.elapsedMs>0);
    assert.deepEqual(capture.members.map(member=>member.member),[0,1,2,3,4]);
    for(const member of capture.members) {
      const expected=expectedOutput(member.member,evidence.countPerMember,mode);
      assert.equal(member.bytes,expected.bytes);assert.equal(member.sha256,expected.sha256);
      assert.equal(member.exitCode,0);assert.equal(member.stderrBytes,0);assert(Number.isInteger(member.pauseCount)&&member.pauseCount>0);
    }
  }
}
for(const name of ['evidence.json','evidence-initial.json']) {
  const evidence=JSON.parse(fs.readFileSync(path.join(root,name)));checkCapture(evidence);
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),['scripts/workload.js','scripts/producer.js','scripts/capture.js','scripts/run-ingress.js'].sort());
  for(const [source,digest]of Object.entries(evidence.sourceHashes)) {
    const actualSource=name==='evidence-initial.json'&&source==='scripts/capture.js'?'snapshots/capture-initial.js':source;
    assert(['scripts/workload.js','scripts/producer.js','scripts/capture.js','scripts/run-ingress.js'].includes(source));
    assert.equal(hash(fs.readFileSync(path.join(root,actualSource))),digest,name+':'+source);
  }
}
console.log('Current and preserved initial ingress bytes/source hashes verified; S5 partial');

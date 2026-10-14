'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {verifyMember}=require('./protocol');
const historical={
  'evidence.json':{'run-smoke.js':'snapshots/run-smoke-initial.js','src/main.cjs':'snapshots/main-before-ready.cjs','src/display-producer.cjs':'snapshots/display-producer-before-ready.cjs'},
  'evidence-revised.json':{'run-smoke.js':'snapshots/run-smoke-revised.js','src/main.cjs':'snapshots/main-before-ready.cjs','src/display-producer.cjs':'snapshots/display-producer-before-ready.cjs'},
  'evidence-workers.json':{'run-smoke.js':'snapshots/run-smoke-workers-initial.js','src/main.cjs':'snapshots/main-workers-initial.cjs'},
  'evidence-workers-utf8.json':{},'evidence-workers-utf8-repeat.json':{}
};
const common=['toolchain.js','build.js','protocol.js','fixture.js','run-smoke.js','src/main.cjs','src/preload.cjs','src/renderer.js','src/index.html','src/display-producer.cjs'];
function validateEvidence(evidence) {
  assert.equal(evidence.schema,'tiye-s5-five-terminal-smoke-v1');assert.equal(evidence.ownedCleanup,true);
  assert.equal(evidence.fullS5Qualified,false);assert.equal(evidence.productionEligible,false);
  assert.deepEqual(evidence.views.map(view=>view.view),['grid','focus']);
  for(const view of evidence.views) {
    assert.equal(view.ptyMembers,5);assert.equal(view.hiddenWindow,true);
    assert.equal(view.outputIntegrity,true);assert.equal(view.screenRecordIntegrity,true);
    assert.equal(view.providerRequests,0);
    for(const flag of ['keyboardLatencyMeasured','frameRateMeasured','fullS5Qualified','productionEligible'])assert.equal(view[flag],false);
    assert.deepEqual(view.stored.map(member=>member.member),[0,1,2,3,4]);
    assert.deepEqual(view.renderer.map(member=>member.member),[0,1,2,3,4]);
    view.stored.forEach((stored,index)=>verifyMember(stored,view.renderer[index]));
  }
}
function checkFiles() {
  for(const [name,mapping]of Object.entries(historical)) {
    const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,name)));validateEvidence(evidence);
    const expected=[...common,...(name.includes('workers')?['src/pty-worker.cjs']:[]),...(name.includes('utf8')?['worker-channel.js']:[])];
    assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),expected.sort());
    for(const [source,digest]of Object.entries(evidence.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,mapping[source]||source))).digest('hex'),digest,name+':'+source);
    if(name.includes('workers')) for(const view of evidence.views){assert.equal(view.isolatedPtyWorkers,5);assert(view.stored.every(member=>member.workerExitCode===0));}
  }
  const crash=JSON.parse(fs.readFileSync(path.join(__dirname,'failure-ready-observation.json')));
  assert.equal(crash.electronExitCode,3221225477);assert.equal(crash.fullS5Qualified,false);
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'runtime-manifest.json')));
  assert.deepEqual(Object.keys(manifest.sha256).sort(),['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'].sort());
  for(const [name,digest]of Object.entries(manifest.sha256)) {
    assert.match(digest,/^[a-f0-9]{64}$/);
    if(process.argv.includes('--runtime'))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex'),digest,name);
  }
  console.log('Five native smoke observations and source versions verified; failures retained; S5 partial');
}
if(require.main===module)checkFiles();
module.exports={validateEvidence};

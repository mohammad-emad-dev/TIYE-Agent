'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validateEvidence}=require('./evidence-policy'),{sources,builds}=require('./run');
function check(){
  const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence-renderer.json'))),publicRoot=path.resolve(__dirname,'../../../../output/s5-renderer-recovery');
  const journals=JSON.parse(fs.readFileSync(path.join(publicRoot,'journal.json'))),logs=validateEvidence(evidence,journals);
  logs.forEach((bytes,member)=>assert(bytes.equals(fs.readFileSync(path.join(publicRoot,`member-${member}.log`)))));
  assert.deepEqual(Object.keys(evidence.sourceHashes).sort(),sources.slice().sort());assert.deepEqual(Object.keys(evidence.buildHashes).sort(),builds.slice().sort());
  for(const [name,digest]of Object.entries({...evidence.sourceHashes,...(process.argv.includes('--runtime')?evidence.buildHashes:{})}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex'),digest,name);
  console.log('Verified renderer crash, stable persistent roles, outage progress, epoch1 replay/buffer/feed reconstruction, stale challenge, decoded logs and measured sources');
}
if(require.main===module)check();

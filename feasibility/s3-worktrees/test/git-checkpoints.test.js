'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createWorktreeLifecycle,git}=require('../scripts/worktree-lifecycle');
const {initialize,removeTemp}=require('../scripts/run-basics');
const {createGitCheckpoints}=require('../scripts/git-checkpoints');
const {checkpointsPassed}=require('../scripts/run-checkpoints');
test('checkpoint bindings and file boundaries refuse foreign member, session, forged plan and hardlink',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-checkpoint-test-')),root=path.join(base,'root'),slots=path.join(base,'slots'),store=path.join(base,'indexes');
 fs.mkdirSync(root);fs.mkdirSync(slots);fs.mkdirSync(store);initialize(root,slots);const lifecycle=createWorktreeLifecycle({repository:root,base:slots});
 const member=lifecycle.create({name:'member',branch:'codex/test-checkpoint'}),other=lifecycle.create({name:'other',branch:'codex/test-other-checkpoint'});
 const checkpoints=createGitCheckpoints({member,validate:()=>lifecycle.validate(member),storeDirectory:store}),foreign=createGitCheckpoints({member:other,validate:()=>lifecycle.validate(other),storeDirectory:store});
 const file=path.join(member,'member-a.txt'),canary=path.join(base,'canary.txt');fs.writeFileSync(canary,'foreign bytes\n');
 try{
  const rawFile=path.join(member,'raw-file.bin'),rawBytes=Buffer.from([0,13,10,255]);fs.writeFileSync(rawFile,rawBytes);
  assert.throws(()=>checkpoints.capture('../escape',1));const captured=checkpoints.capture('test-session',1);
  assert.throws(()=>foreign.load('test-session',1,captured.commit));assert.throws(()=>checkpoints.load('other-session',1,captured.commit));
  const loaded=checkpoints.load('test-session',1,captured.commit);assert.throws(()=>checkpoints.prepare({...loaded},'member-a.txt'));
  const rawEntry=loaded.files.find(file=>file.path==='raw-file.bin');assert.equal(rawEntry.sha256,crypto.createHash('sha256').update(rawBytes).digest('hex'));
  const rawObject=spawnSync('git',['cat-file','blob',rawEntry.blob],{cwd:member,windowsHide:true,timeout:20000});assert.equal(rawObject.status,0);assert.deepEqual(rawObject.stdout,rawBytes);fs.unlinkSync(rawFile);
  assert.throws(()=>checkpoints.prepare(loaded,'../canary.txt'));assert.throws(()=>checkpoints.prepare(loaded,'absent.txt'));assert.throws(()=>checkpoints.approve({path:'member-a.txt'}));
  fs.writeFileSync(file,'edited before review\n');const token=checkpoints.approve(checkpoints.prepare(loaded,'member-a.txt'));
  fs.unlinkSync(file);fs.linkSync(canary,file);assert.throws(()=>checkpoints.restore(token,2));assert.equal(checkpoints.restore(token,2).reason,'unapproved');
  assert.equal(fs.readFileSync(canary,'utf8'),'foreign bytes\n');fs.unlinkSync(file);fs.writeFileSync(file,'original a\n');
  const mergeHead=git(member,['rev-parse','--path-format=absolute','--git-path','MERGE_HEAD']).output;
  const activeApproval=checkpoints.approve(checkpoints.prepare(loaded,'member-a.txt'));fs.writeFileSync(mergeHead,git(member,['rev-parse','HEAD']).output+'\n');
  try{assert.throws(()=>checkpoints.restore(activeApproval,2));assert.throws(()=>checkpoints.capture('test-session',2));assert.equal(fs.readFileSync(file,'utf8'),'original a\n');}finally{fs.unlinkSync(mergeHead);}
  assert.equal(checkpoints.restore(activeApproval,2).reason,'unapproved');
  const oversized=path.join(member,'oversized.txt');fs.writeFileSync(oversized,Buffer.alloc(1048577));assert.throws(()=>checkpoints.capture('test-session',3));fs.unlinkSync(oversized);
  assert.equal(git(member,['for-each-ref','--format=%(refname)','refs/tiye/test-session']).output,'refs/tiye/test-session/1');
 }finally{lifecycle.remove(other);lifecycle.remove(member);assert.equal(lifecycle.registry().length,1);removeTemp(base,'tiye-s3-checkpoint-test-');}
});
test('checkpoint evidence requires fresh-process recovery, preserved state, safety snapshot and refusals',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/checkpoints-latest.json')));assert.equal(checkpointsPassed(record),true);
 for(const field of ['capturePreservedMember','freshProcessRecovered','untrackedBytesLoaded','safetySavedPreviousBytes','unrelatedEditPreserved','indexBytesPreserved','headAndBranchPreserved','duplicateRefBlocked','wrongCommitBlocked','staleTargetBlocked','changedIndexBlocked','changedHeadBlocked','replayBlocked','forgedApprovalBlocked','originalRootUnchanged','registryRootOnly','rootTempRemoved','baseTempRemoved'])assert.equal(checkpointsPassed({...record,[field]:false}),false,field);
 assert.equal(checkpointsPassed({...record,error:'incomplete'}),false);assert.equal(checkpointsPassed({...record,worktreesRemoved:0}),false);
});

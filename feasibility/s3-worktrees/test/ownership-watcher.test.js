'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWorktreeLifecycle,git}=require('../scripts/worktree-lifecycle');
const {initialize,removeTemp}=require('../scripts/run-basics');
const {createOwnershipWatcher}=require('../scripts/ownership-watcher');
const {ownershipPassed}=require('../scripts/run-ownership');
test('recovery refuses staged history, changed HEAD and link substitutions without touching foreign bytes',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-watcher-test-')),root=path.join(base,'root'),slots=path.join(base,'slots'),foreign=path.join(base,'foreign');
  fs.mkdirSync(root);fs.mkdirSync(slots);fs.mkdirSync(foreign);initialize(root,slots);
  const canary=path.join(foreign,'canary.txt');fs.writeFileSync(canary,'foreign bytes\n');
  const lifecycle=createWorktreeLifecycle({repository:root,base:slots}),member=lifecycle.create({name:'member',branch:'codex/test-watcher'});
  const file=path.join(member,'member-b.txt'),link=path.join(member,'link-dir');let watcher;
  try{
    assert.throws(()=>createOwnershipWatcher({lifecycle,member,assigned:['../foreign/canary.txt']}));
    watcher=createOwnershipWatcher({lifecycle,member,assigned:['member-a.txt']});
    fs.writeFileSync(file,'fixture edited\n');const staged=watcher.approve(watcher.scan()[0]);git(member,['add','--','member-b.txt']);
    assert.equal(watcher.restore(staged).reason,'changed-index');assert.equal(fs.readFileSync(file,'utf8'),'fixture edited\n');
    git(member,['restore','--staged','--','member-b.txt']);assert.equal(watcher.restore(staged).reason,'unapproved-or-faulted');
    assert.equal(watcher.restore(watcher.approve(watcher.scan()[0])).restored,true);
    fs.writeFileSync(file,'fixture newer\n');const changedHead=watcher.approve(watcher.scan()[0]);git(member,['commit','--allow-empty','--quiet','-m','Fixture HEAD change']);
    assert.equal(watcher.restore(changedHead).reason,'changed-head');assert.equal(fs.readFileSync(file,'utf8'),'fixture newer\n');
    watcher.close();git(member,['restore','--worktree','--','member-b.txt']);
    watcher=createOwnershipWatcher({lifecycle,member,assigned:['member-a.txt']});fs.writeFileSync(file,'fixture link observation\n');const hardlink=watcher.approve(watcher.scan()[0]);
    fs.unlinkSync(file);fs.linkSync(canary,file);assert.throws(()=>watcher.restore(hardlink));assert.equal(fs.readFileSync(canary,'utf8'),'foreign bytes\n');
    fs.unlinkSync(file);fs.writeFileSync(file,'original b\n');watcher.close();
    watcher=createOwnershipWatcher({lifecycle,member,assigned:['member-a.txt']});fs.writeFileSync(file,'fixture before fault\n');const beforeFault=watcher.approve(watcher.scan()[0]);
    fs.symlinkSync(foreign,link,'junction');assert.throws(()=>watcher.scan());assert.equal(watcher.state().fault,'snapshot-unverified');
    assert.equal(watcher.restore(beforeFault).reason,'unapproved-or-faulted');assert.throws(()=>watcher.start());assert.equal(fs.readFileSync(canary,'utf8'),'foreign bytes\n');
    if(fs.realpathSync(link)!==fs.realpathSync(foreign))throw new Error('test junction identity changed');fs.unlinkSync(link);
    git(member,['restore','--worktree','--','member-b.txt']);
  }finally{watcher?.close();lifecycle.remove(member);assert.equal(lifecycle.registry().length,1);removeTemp(base,'tiye-s3-watcher-test-');}
});
test('ownership evidence requires polling, selective recovery, preserved assigned work and cleanup',()=>{
  const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/ownership-latest.json')));assert.equal(ownershipPassed(record),true);
  for(const field of ['pollingDetectedAll','assignedNotFlagged','forgedApprovalBlocked','staleTargetBlocked','reviewedRestoresPassed',
    'assignedEditPreserved','initialUntrackedBytesRestored','replayBlocked','watcherClosed','originalRootUnchanged','registryRootOnly','rootTempRemoved'])
    assert.equal(ownershipPassed({...record,[field]:false}),false,field);
  assert.equal(ownershipPassed({...record,worktreesRemoved:0}),false);
});

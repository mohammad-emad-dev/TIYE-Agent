'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createWorktreeLifecycle,git}=require('./worktree-lifecycle');
const {initialize,rootState,removeTemp}=require('./run-basics');
const {createOwnershipWatcher}=require('./ownership-watcher');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ownershipPassed(record){return Boolean(!record.error&&record.pollingDetectedAll&&record.assignedNotFlagged&&record.forgedApprovalBlocked&&record.staleTargetBlocked
  &&record.reviewedRestoresPassed&&record.assignedEditPreserved&&record.initialUntrackedBytesRestored&&record.replayBlocked&&record.watcherClosed
  &&record.originalRootUnchanged&&record.worktreesCreated===1&&record.worktreesRemoved===1&&record.registryRootOnly&&record.rootTempRemoved&&record.baseTempRemoved);}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-ownership-root-')),base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-ownership-worktrees-'));
  const record={recordedAt:new Date().toISOString(),scope:'Bounded polling detection and fixture-approved per-file recovery from in-memory working-tree checkpoint; controlled writers only',
    platform:process.platform,node:process.version,git:git(root,['--version']).output,
    sourceHashes:Object.fromEntries(['run-ownership.js','ownership-watcher.js','run-basics.js','worktree-lifecycle.js'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    preventsWrites:false,atomicRecoveryQualified:false,durableCheckpointQualified:false,userApprovalUiQualified:false,providerCliWatcherQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
  let lifecycle,original,watcher,member;
  try{
    initialize(root,base);original=rootState(root);lifecycle=createWorktreeLifecycle({repository:root,base});member=lifecycle.create({name:'member-a',branch:'codex/s3-ownership-a'});record.worktreesCreated=1;
    fs.writeFileSync(path.join(member,'local-note.txt'),'checkpoint untracked\n');
    watcher=createOwnershipWatcher({lifecycle,member,assigned:['member-a.txt'],intervalMs:100});watcher.start();
    fs.writeFileSync(path.join(member,'member-a.txt'),'assigned work preserved\n');fs.writeFileSync(path.join(member,'member-b.txt'),'unauthorized edit\n');
    fs.unlinkSync(path.join(member,'shared.txt'));fs.writeFileSync(path.join(member,'new-note.txt'),'unauthorized new file\n');fs.writeFileSync(path.join(member,'local-note.txt'),'changed untracked\n');
    const started=Date.now(),observed=[];while(Date.now()-started<6000&&observed.length<4){await new Promise(resolve=>setTimeout(resolve,30));observed.push(...watcher.drain());}
    watcher.close();record.detectionMs=Date.now()-started;record.observations=observed;
    record.pollingDetectedAll=JSON.stringify(observed.map(item=>item.path+':'+item.kind).sort())===JSON.stringify(['member-b.txt:modified','shared.txt:deleted','new-note.txt:added','local-note.txt:modified'].sort());
    record.assignedNotFlagged=observed.every(item=>item.path!=='member-a.txt');
    record.forgedApprovalBlocked=watcher.restore({approved:true}).reason==='unapproved-or-faulted';
    const old=watcher.approve(observed.find(item=>item.path==='member-b.txt'));fs.writeFileSync(path.join(member,'member-b.txt'),'newer unauthorized edit\n');
    record.staleTargetBlocked=watcher.restore(old).reason==='stale-target'&&fs.readFileSync(path.join(member,'member-b.txt'),'utf8')==='newer unauthorized edit\n';
    const fresh=watcher.scan(),results=fresh.map(item=>{const approval=watcher.approve(item),restored=watcher.restore(approval);return {restored,replayBlocked:watcher.restore(approval).reason==='unapproved-or-faulted'};});
    record.restoreResults=results;record.reviewedRestoresPassed=results.length===4&&results.every(item=>item.restored.restored)&&watcher.scan().length===0;
    record.replayBlocked=results.every(item=>item.replayBlocked);
    record.assignedEditPreserved=fs.readFileSync(path.join(member,'member-a.txt'),'utf8')==='assigned work preserved\n';
    record.initialUntrackedBytesRestored=fs.readFileSync(path.join(member,'local-note.txt'),'utf8')==='checkpoint untracked\n';
    record.watcherClosed=watcher.state().closed&&!watcher.state().fault;
    lifecycle.validate(member);if(!record.initialUntrackedBytesRestored)throw new Error('owned untracked fixture changed');fs.unlinkSync(path.join(member,'local-note.txt'));
    git(member,['add','--','member-a.txt']);git(member,['commit','--quiet','-m','Owned assigned fixture work']);
  }catch{record.error='ownership observation failed';}
  finally{if(watcher)watcher.close();try{
    if(lifecycle){for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}const entries=lifecycle.registry();record.registryRootOnly=entries.length===1&&path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();}
    if(!record.registryRootOnly)throw new Error('ownership registry cleanup unverified');record.originalRootUnchanged=original&&JSON.stringify(rootState(root))===JSON.stringify(original);
    record.baseTempRemoved=removeTemp(base,'tiye-s3-ownership-worktrees-');record.rootTempRemoved=removeTemp(root,'tiye-s3-ownership-root-');
  }catch{record.error='ownership owned cleanup unverified';}}
  record.passed=ownershipPassed(record);record.result=record.passed?'OWNERSHIP_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.resolve(__dirname,'../evidence/ownership-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-ownership] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main().catch(()=>{console.error('ownership lifecycle failure');process.exitCode=1;});module.exports={ownershipPassed};

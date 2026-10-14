'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {createWorktreeLifecycle,git}=require('./worktree-lifecycle');
const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {createGitCheckpoints}=require('./git-checkpoints');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const checks=['capturePreservedMember','freshProcessRecovered','untrackedBytesLoaded','safetySavedPreviousBytes','unrelatedEditPreserved','indexBytesPreserved','headAndBranchPreserved','duplicateRefBlocked','wrongCommitBlocked','staleTargetBlocked','changedIndexBlocked','changedHeadBlocked','replayBlocked','forgedApprovalBlocked','originalRootUnchanged','registryRootOnly','rootTempRemoved','baseTempRemoved'];
function checkpointsPassed(record){return !record.error&&checks.every(key=>record[key]===true)&&record.worktreesCreated===1&&record.worktreesRemoved===1;}
function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-checkpoints-root-')),base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-checkpoints-worktrees-'));
 const record={recordedAt:new Date().toISOString(),scope:'Git-backed raw ordinary-file checkpoint and fresh Node process fixture-approved single-file recovery; controlled writers only',platform:process.platform,node:process.version,git:git(root,['--version']).output,
   sourceHashes:Object.fromEntries(['run-checkpoints.js','git-checkpoints.js','run-basics.js','worktree-lifecycle.js','attribution-git.js'].map(name=>['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))]).concat([['fixtures/checkpoint-reopen.cjs',hash(fs.readFileSync(path.join(__dirname,'../fixtures/checkpoint-reopen.cjs')))]])),
   userApprovalUiQualified:false,globalRestartRecoveryQualified:false,powerLossRecoveryQualified:false,atomicRecoveryQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
 let lifecycle,original,member;
 try{
  initialize(root,base);original=rootState(root);lifecycle=createWorktreeLifecycle({repository:root,base});member=lifecycle.create({name:'member-a',branch:'codex/s3-checkpoints-a'});record.worktreesCreated=1;
  const store=path.join(base,'checkpoint-indexes');fs.mkdirSync(store);const checkpoints=createGitCheckpoints({member,validate:()=>lifecycle.validate(member),storeDirectory:store});
  const session='s-'+crypto.randomUUID(),a=path.join(member,'member-a.txt'),b=path.join(member,'member-b.txt'),note=path.join(member,'local-note.txt');
  fs.writeFileSync(a,'staged member a\n');git(member,['add','--','member-a.txt']);fs.writeFileSync(a,'checkpoint working a\n');fs.writeFileSync(note,'checkpoint untracked\n');
  const memberState=()=>({status:git(member,['status','--porcelain','--untracked-files=all']).output,branch:git(member,['symbolic-ref','HEAD']).output,head:git(member,['rev-parse','HEAD']).output,files:treeFiles(member)});
  const before=memberState(),indexPath=git(member,['rev-parse','--path-format=absolute','--git-path','index']).output,index=fs.readFileSync(indexPath);
  const captured=checkpoints.capture(session,17);record.checkpoint=captured;record.capturePreservedMember=index.equals(fs.readFileSync(indexPath))&&JSON.stringify(memberState())===JSON.stringify(before);
  function refused(action){try{action();return false;}catch{return true;}}
  record.duplicateRefBlocked=refused(()=>checkpoints.capture(session,17))&&git(member,['rev-parse',captured.ref]).output===captured.commit;
  record.wrongCommitBlocked=refused(()=>checkpoints.load(session,17,before.head));
  const loaded=checkpoints.load(session,17,captured.commit);record.forgedApprovalBlocked=checkpoints.restore({approved:true},18).reason==='unapproved';
  fs.writeFileSync(a,'newer before recovery\n');const stale=checkpoints.approve(checkpoints.prepare(loaded,'member-a.txt'));fs.writeFileSync(a,'newer second edit\n');
  record.staleTargetBlocked=checkpoints.restore(stale,18).reason==='stale-target';record.replayBlocked=checkpoints.restore(stale,18).reason==='unapproved';
  const indexApproval=checkpoints.approve(checkpoints.prepare(loaded,'member-a.txt'));git(member,['add','--','member-a.txt']);record.changedIndexBlocked=checkpoints.restore(indexApproval,18).reason==='changed-head-or-index';
  fs.writeFileSync(a,'staged member a\n');git(member,['add','--','member-a.txt']);fs.writeFileSync(a,'newer before recovery\n');fs.writeFileSync(b,'unrelated preserved\n');
  const currentIndex=fs.readFileSync(indexPath),nonce=crypto.randomUUID(),job={member:fs.realpathSync(member),root:fs.realpathSync(root),base:fs.realpathSync(base),store,branch:before.branch,session,sequence:17,commit:captured.commit,nonce};
  const jobFile=path.join(base,'job.json');fs.writeFileSync(jobFile,JSON.stringify(job));
  const child=spawnSync(process.execPath,[path.join(__dirname,'../fixtures/checkpoint-reopen.cjs'),jobFile],{windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:128000});
  if(child.error||child.status!==0)throw new Error('child recovery failed');const result=JSON.parse(child.stdout);
  record.freshProcessRecovered=result.pid!==process.pid&&result.nonce===nonce&&result.restored&&result.restoredHash===hash(Buffer.from('checkpoint working a\n'));
  record.untrackedBytesLoaded=result.checkpointFiles.some(file=>file.path==='local-note.txt'&&file.sha256===hash(Buffer.from('checkpoint untracked\n')));
  record.safety=result.safety;record.safetySavedPreviousBytes=result.safetyFiles.some(file=>file.path==='member-a.txt'&&file.sha256===hash(Buffer.from('newer before recovery\n')));
  record.unrelatedEditPreserved=fs.readFileSync(b,'utf8')==='unrelated preserved\n';record.indexBytesPreserved=currentIndex.equals(fs.readFileSync(indexPath))&&git(member,['show',':member-a.txt']).output==='staged member a';
  record.headAndBranchPreserved=git(member,['rev-parse','HEAD']).output===before.head&&git(member,['symbolic-ref','HEAD']).output===before.branch;
  const headApproval=checkpoints.approve(checkpoints.prepare(loaded,'member-a.txt'));git(member,['commit','--quiet','-m','Fixture staged work']);record.changedHeadBlocked=checkpoints.restore(headApproval,19).reason==='changed-head-or-index';
  lifecycle.validate(member);fs.unlinkSync(note);git(member,['add','--','member-a.txt','member-b.txt']);git(member,['commit','--quiet','-m','Owned fixture recovery result']);
 }catch{record.error='checkpoint observation failed';}
 finally{try{
  if(lifecycle){for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}const entries=lifecycle.registry();record.registryRootOnly=entries.length===1&&path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();}
  if(!record.registryRootOnly)throw new Error('checkpoint registry cleanup unverified');record.originalRootUnchanged=original&&JSON.stringify(rootState(root))===JSON.stringify(original);
  record.baseTempRemoved=removeTemp(base,'tiye-s3-checkpoints-worktrees-');record.rootTempRemoved=removeTemp(root,'tiye-s3-checkpoints-root-');
 }catch{record.error='checkpoint owned cleanup unverified';}}
 record.passed=checkpointsPassed(record);record.result=record.passed?'CHECKPOINTS_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.resolve(__dirname,'../evidence/checkpoints-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-checkpoints] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();module.exports={checkpointsPassed};

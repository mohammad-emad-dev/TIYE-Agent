'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {git,createWorktreeLifecycle}=require('./worktree-lifecycle');
const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {attributionGit,readCommit}=require('./attribution-git');
const {createSessionTrailerGate}=require('./session-trailer-gate');
const {createFinalMergeGate}=require('./final-merge-gate');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function finalMergePassed(record){return !record.error&&['memberAudited','dirtySourceRefused','dirtySourcePreserved','integrationBranchRetained','cleanFinalMerged','safetyCheckpointSaved','expectedSourceFiles','memberCommitPreserved','integrationCommitPreserved','approvalReplayBlocked','registryRootOnly','tempRemoved'].every(key=>record[key]===true)&&record.worktreesCreated===2&&record.worktreesRemoved===2;}
function main(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-final-merge-')),root=path.join(base,'user-root'),slots=path.join(base,'slots'),store=path.join(base,'checkpoint-indexes');for(const directory of [root,slots,store])fs.mkdirSync(directory);
 const record={recordedAt:new Date().toISOString(),scope:'Fixture-approved fast-forward final integration into a disposable clean user branch; dirty user root retained untouched',platform:process.platform,node:process.version,git:git(base,['--version']).output,
  sourceHashes:Object.fromEntries(['run-final-merge.js','final-merge-gate.js','session-trailer-gate.js','git-checkpoints.js','attribution-git.js','run-basics.js','worktree-lifecycle.js'].map(name=>['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))])),
  userApprovalUiQualified:false,leaderReviewQualified:false,integrationTestGateQualified:false,atomicMergeQualified:false,crashRecoveryQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
 let lifecycle;
 try{
  initialize(root,slots);const original=rootState(root),start=original.head;lifecycle=createWorktreeLifecycle({repository:root,base:slots});const integration=lifecycle.create({name:'integration',branch:'codex/s3-final-integration'}),member=lifecycle.create({name:'member',branch:'codex/s3-final-member'});record.worktreesCreated=2;
  const sessionId='s-'+crypto.randomUUID(),identity={memberId:'member',memberName:'Fixture Final Member',sessionId},engine={memberId:'integration',memberName:'Fixture Integration',sessionId};
  fs.writeFileSync(path.join(member,'member-a.txt'),'final approved member work\n');attributionGit(member,['add','--','member-a.txt'],identity);attributionGit(member,['commit','--quiet','-m','Owned member work','--trailer','Tiye-Session: '+sessionId],identity);
  const memberHead=git(member,['rev-parse','HEAD']).output,memberCommit=readCommit(member,memberHead,identity),trailer=createSessionTrailerGate({lifecycle,integrationIdentity:engine}),audit=trailer.audit({member,integration,baseCommit:start,identity});record.memberAudited=audit.eligible&&trailer.merge(audit).merged;
  const integrationHead=git(integration,['rev-parse','HEAD']).output,integrationCommit=readCommit(integration,integrationHead,engine);
  function validateSource(){if(fs.lstatSync(root).isSymbolicLink()||fs.realpathSync(root)!==path.resolve(root)||git(root,['symbolic-ref','HEAD']).output!=='refs/heads/main'||fs.realpathSync(git(root,['rev-parse','--path-format=absolute','--git-common-dir']).output)!==path.join(root,'.git'))throw new Error('owned source changed');}
  const gate=createFinalMergeGate({source:root,integration,lifecycle,validateSource,identity:engine,storeDirectory:store,hooksDirectory:path.join(slots,'no-hooks')}),dirty=gate.prepare({expectedSourceHead:start,expectedIntegrationHead:integrationHead});
  record.dirtySourceRefused=!dirty.eligible&&dirty.reason==='dirty-worktree';record.dirtySourcePreserved=JSON.stringify(rootState(root))===JSON.stringify(original);record.integrationBranchRetained=git(integration,['rev-parse','HEAD']).output===integrationHead&&dirty.resultBranch==='refs/heads/codex/s3-final-integration';
  validateSource();const settings=path.join(root,'local-settings.json');if(fs.lstatSync(settings).nlink!==1||fs.readFileSync(settings,'utf8')!=='{"mode":"fixture"}\n')throw new Error('owned fixture settings changed');fs.unlinkSync(settings);
  const plan=gate.prepare({expectedSourceHead:start,expectedIntegrationHead:integrationHead}),token=gate.approve(plan),result=gate.merge(token,{session:sessionId,sequence:21});record.mergeResult=result;
  record.cleanFinalMerged=result.merged&&git(root,['rev-parse','HEAD']).output===integrationHead&&git(root,['symbolic-ref','HEAD']).output==='refs/heads/main';
  record.safetyCheckpointSaved=git(root,['rev-parse',result.safety.ref]).output===result.safety.commit&&git(root,['rev-parse',result.safety.commit+'^']).output===start;
  record.expectedSourceFiles=JSON.stringify(treeFiles(root))===JSON.stringify(treeFiles(integration))&&fs.readFileSync(path.join(root,'member-a.txt'),'utf8')==='final approved member work\n'&&git(root,['status','--porcelain','--untracked-files=all','--ignored']).output==='';
  record.memberCommitPreserved=JSON.stringify(readCommit(root,memberHead,identity))===JSON.stringify(memberCommit);record.integrationCommitPreserved=JSON.stringify(readCommit(root,integrationHead,engine))===JSON.stringify(integrationCommit);
  record.approvalReplayBlocked=gate.merge(token,{session:sessionId,sequence:22}).reason==='unapproved';
 }catch{record.error='final merge observation failed';}
 finally{try{if(lifecycle){for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}record.registryRootOnly=lifecycle.registry().length===1;}
  if(!record.registryRootOnly||record.error)throw new Error('final merge cleanup unverified');record.tempRemoved=removeTemp(base,'tiye-s3-final-merge-');}catch{record.error=record.error||'final merge owned cleanup unverified';}}
 record.passed=Boolean(finalMergePassed(record));record.result=record.passed?'FINAL_MERGE_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.join(__dirname,'../evidence/final-merge-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-final-merge] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();module.exports={finalMergePassed};

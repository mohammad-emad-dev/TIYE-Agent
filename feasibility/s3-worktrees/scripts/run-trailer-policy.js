'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createWorktreeLifecycle,git}=require('./worktree-lifecycle');
const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {attributionGit,readCommit}=require('./attribution-git');
const {createSessionTrailerGate}=require('./session-trailer-gate');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function integrationState(directory){return {head:git(directory,['rev-parse','HEAD']).output,files:treeFiles(directory),index:git(directory,['write-tree']).output,status:git(directory,['status','--porcelain','--untracked-files=all']).output};}
function trailerPolicyPassed(record){return Boolean(!record.error&&record.fullRangeRejected&&record.rejectedRangeUnchanged&&record.forgedDecisionBlocked
  &&record.staleMemberBlocked&&record.staleIntegrationBlocked&&record.dirtyBlocked&&record.activeOperationBlocked&&record.validRangeMerged
  &&record.memberMetadataPreserved&&record.rejectedHistoryUnchanged&&record.originalRootUnchanged&&record.worktreesCreated===3&&record.worktreesRemoved===3
  &&record.registryRootOnly&&record.rootTempRemoved&&record.baseTempRemoved);}
function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-trailer-root-')),base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-trailer-worktrees-'));
  const record={recordedAt:new Date().toISOString(),scope:'Bounded engine-owned full-range session trailer audit and pinned no-ff merge; synthetic histories, no provider-created commit or concurrency enforcement',
    platform:process.platform,node:process.version,git:git(root,['--version']).output,
    sourceHashes:Object.fromEntries(['run-trailer-policy.js','session-trailer-gate.js','attribution-git.js','run-basics.js','worktree-lifecycle.js'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    automaticCliTrailersQualified:false,cliCreatedCommitQualified:false,atomicMergeQualified:false,identityEnforced:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
  let lifecycle,original;
  try{
    initialize(root,base);original=rootState(root);const baseCommit=git(root,['rev-parse','HEAD']).output;
    lifecycle=createWorktreeLifecycle({repository:root,base});
    const integration=lifecycle.create({name:'integration',branch:'codex/s3-trailer-integration'}),member=lifecycle.create({name:'member-a',branch:'codex/s3-trailer-a'}),bad=lifecycle.create({name:'member-b',branch:'codex/s3-trailer-b'});
    record.worktreesCreated=lifecycle.owned().length;
    const sessionId=crypto.randomUUID(),identity={memberId:'member-a',memberName:'Fixture Member A',sessionId},badIdentity={memberId:'member-b',memberName:'Fixture Member B',sessionId};
    const engine={memberId:'integration',memberName:'Fixture Integration',sessionId};
    const gate=createSessionTrailerGate({lifecycle,integrationIdentity:engine});
    const commit=(directory,who,message,trailer=who.sessionId,extra=[])=>attributionGit(directory,['commit','--allow-empty','--quiet','-m',message,...(trailer?['--trailer','Tiye-Session: '+trailer]:[]),...extra],who);
    fs.writeFileSync(path.join(member,'member-a.txt'),'audited member range\n');attributionGit(member,['add','--','member-a.txt'],identity);commit(member,identity,'Valid member start');
    commit(bad,badIdentity,'Missing session',null);commit(bad,badIdentity,'Valid tip hides earlier invalid commit');
    const hidden=gate.audit({member:bad,integration,baseCommit,identity:badIdentity});record.badEarlierCommitDetected=hidden.commits.length===2&&hidden.commits[0].problems.includes('missing-session')&&hidden.commits[1].problems.length===0;
    commit(bad,badIdentity,'Foreign session','foreign-session');
    commit(bad,badIdentity,'Duplicate session\n\nTiye-Session: '+sessionId+'\nTiye-Session: different-session',null);
    commit(bad,badIdentity,'Foreign author',sessionId,['--author','Foreign Fixture <foreign@tiye.local>']);
    const rejected=gate.audit({member:bad,integration,baseCommit,identity:badIdentity});record.rejectedAudit=rejected;
    const beforeRejected=integrationState(integration),badHead=git(bad,['rev-parse','HEAD']).output;
    record.fullRangeRejected=!rejected.eligible&&record.badEarlierCommitDetected&&['missing-session','session-mismatch','duplicate-session','author-mismatch'].every(problem=>rejected.commits.some(commit=>commit.problems.includes(problem)))&&gate.merge(rejected).reason==='unapproved-audit';
    record.rejectedRangeUnchanged=JSON.stringify(integrationState(integration))===JSON.stringify(beforeRejected);
    const accepted=gate.audit({member,integration,baseCommit,identity});record.forgedDecisionBlocked=gate.merge({...accepted}).reason==='unapproved-audit';
    commit(member,identity,'Valid second member commit');record.staleMemberBlocked=gate.merge(accepted).reason==='stale-member-head'&&JSON.stringify(integrationState(integration))===JSON.stringify(beforeRejected);
    const beforeIntegrationChange=gate.audit({member,integration,baseCommit,identity});commit(integration,engine,'Engine integration checkpoint');
    const checkpoint=integrationState(integration);record.staleIntegrationBlocked=gate.merge(beforeIntegrationChange).reason==='stale-integration-head'&&JSON.stringify(integrationState(integration))===JSON.stringify(checkpoint);
    const valid=gate.audit({member,integration,baseCommit,identity});record.acceptedAudit=valid;
    fs.writeFileSync(path.join(member,'owned-marker.txt'),'fixture dirty control');
    record.dirtyBlocked=gate.merge(valid).reason==='dirty-worktree'&&JSON.stringify(integrationState(integration))===JSON.stringify(checkpoint);
    lifecycle.validate(member);fs.unlinkSync(path.join(member,'owned-marker.txt'));
    const mergeHead=git(member,['rev-parse','--path-format=absolute','--git-path','MERGE_HEAD']).output;
    fs.writeFileSync(mergeHead,baseCommit+'\n',{flag:'wx'});
    record.activeOperationBlocked=gate.merge(valid).reason==='active-operation'&&JSON.stringify(integrationState(integration))===JSON.stringify(checkpoint);
    if(fs.readFileSync(mergeHead,'utf8')!==baseCommit+'\n')throw new Error('active marker ownership changed');fs.unlinkSync(mergeHead);
    const merged=gate.merge(valid);record.mergeResult=merged;
    record.validRangeMerged=merged.merged&&fs.readFileSync(path.join(integration,'member-a.txt'),'utf8')==='audited member range\n';
    record.memberMetadataPreserved=valid.commits.every(commit=>{const originalCommit={...commit};delete originalCommit.problems;return JSON.stringify(readCommit(integration,commit.id,identity))===JSON.stringify(originalCommit);});
    record.rejectedHistoryUnchanged=git(bad,['rev-parse','HEAD']).output===badHead;
  }catch{record.error='trailer policy observation failed';}
  finally{try{
    if(lifecycle){for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}const entries=lifecycle.registry();record.registryRootOnly=entries.length===1&&path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();}
    if(!record.registryRootOnly)throw new Error('trailer registry cleanup unverified');record.originalRootUnchanged=original&&JSON.stringify(rootState(root))===JSON.stringify(original);
    record.baseTempRemoved=removeTemp(base,'tiye-s3-trailer-worktrees-');record.rootTempRemoved=removeTemp(root,'tiye-s3-trailer-root-');
  }catch{record.error='trailer policy owned cleanup unverified';}}
  record.passed=trailerPolicyPassed(record);record.result=record.passed?'TRAILER_POLICY_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname,'../evidence/trailer-policy-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-trailer-policy] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();
module.exports={trailerPolicyPassed};

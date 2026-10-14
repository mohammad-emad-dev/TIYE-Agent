'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createWorktreeLifecycle,git}=require('./worktree-lifecycle');
const {initialize,rootState,removeTemp}=require('./run-basics');
const {attributionGit}=require('./attribution-git');
const {createLocalPushGate,localGit}=require('./local-push-gate');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
function pushPolicyPassed(record){return Boolean(!record.error&&record.hookScopeMatched&&record.engineDeniedWithoutApproval&&record.normalHookDenied
  &&record.approvedPushVerified&&record.replayBlocked&&record.staleSourceBlocked&&record.staleRemoteBlocked&&record.noVerifyBypassVerified
  &&record.hooksPathBypassVerified&&record.unhookedWorktreeBypassVerified&&record.bypassesLeaveLocalRefsUnchanged&&record.forceApprovalRequired&&record.approvedForceVerified
  &&record.hookBytesUnchanged&&JSON.stringify(record.hookLog)===JSON.stringify([{allowed:false},{allowed:true}])
  &&record.originalRootUnchanged&&record.worktreesCreated===2&&record.worktreesRemoved===2&&record.registryRootOnly&&record.rootTempRemoved&&record.baseTempRemoved);}
function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-push-root-')),base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-push-worktrees-'));
  const record={recordedAt:new Date().toISOString(),scope:'Fixture-only engine approval and bypassable worktree pre-push hook against one local bare remote; no provider CLI push or user/network remote',
    platform:process.platform,node:process.version,git:git(root,['--version']).output,
    sourceHashes:Object.fromEntries(['run-push-policy.js','local-push-gate.js','attribution-git.js','run-basics.js','worktree-lifecycle.js','../fixtures/push-hook.cjs'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    humanApprovalUiQualified:false,providerCliPushQualified:false,cliPushEnforced:false,durableBrokerQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
  let lifecycle,original;
  try{
    initialize(root,base);original=rootState(root);const initial=git(root,['rev-parse','HEAD']).output;
    const identity={memberId:'member-a',memberName:'Fixture Member A',sessionId:crypto.randomUUID()};
    const remote=path.join(base,'remote.git');fs.mkdirSync(remote);localGit(remote,['init','--bare','--quiet','-b','main'],identity);
    lifecycle=createWorktreeLifecycle({repository:root,base});const a=lifecycle.create({name:'member-a',branch:'codex/s3-push-a'}),b=lifecycle.create({name:'member-b',branch:'codex/s3-push-b'});record.worktreesCreated=lifecycle.owned().length;
    const hooks=path.join(base,'hooks-a'),log=path.join(base,'hook-log.jsonl'),worker=path.join(base,'push-hook.cjs');fs.mkdirSync(hooks);
    fs.copyFileSync(path.resolve(__dirname,'../fixtures/push-hook.cjs'),worker);
    fs.writeFileSync(path.join(hooks,'pre-push'),'#!/bin/sh\nexec rtk proxy '+quote(process.execPath.replace(/\\/g,'/'))+' '+quote(worker.replace(/\\/g,'/'))+' '+quote(remote.replace(/\\/g,'/'))+' '+quote(log.replace(/\\/g,'/'))+' "$@"\n');fs.chmodSync(path.join(hooks,'pre-push'),0o755);
    git(root,['config','extensions.worktreeConfig','true']);git(a,['config','--worktree','core.hooksPath',hooks]);
    record.hookScopeMatched=path.resolve(git(a,['config','--get','core.hooksPath']).output)===hooks&&path.resolve(git(b,['config','--get','core.hooksPath']).output)===path.join(base,'no-hooks');
    const count=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split(/\r?\n/).length:0;
    const refs=()=>git(root,['for-each-ref','--format=%(refname):%(objectname)']).output;
    const commit=()=>{attributionGit(a,['commit','--allow-empty','--quiet','-m','Push fixture '+crypto.randomUUID(),'--trailer','Tiye-Session: '+identity.sessionId],identity);return git(a,['rev-parse','HEAD']).output;};
    const head=commit(),ref='refs/heads/tiye/member-a',gate=createLocalPushGate({lifecycle,remote,remoteBase:base,identity});
    const request=gate.request({member:a,ref});
    record.engineDeniedWithoutApproval=gate.push(request).reason==='unapproved-push'&&gate.push({...request,approved:true}).reason==='unapproved-push'&&gate.tip(ref)===null&&count()===0;
    record.normalHookDenied=localGit(a,['push',remote,head+':'+ref],identity,{allowed:[1]}).status===1&&gate.tip(ref)===null&&count()===1;
    const approval=gate.approve(request);record.approvedPush=gate.push(approval);record.approvedPushVerified=record.approvedPush.pushed&&gate.tip(ref)===head&&count()===2;
    record.replayBlocked=gate.push(approval).reason==='unapproved-push'&&gate.tip(ref)===head&&count()===2;
    commit();const staleSource=gate.approve(gate.request({member:a,ref}));const latest=commit();record.staleSourceBlocked=gate.push(staleSource).reason==='stale-source'&&gate.tip(ref)===head&&count()===2;
    const staleRemote=gate.approve(gate.request({member:a,ref})),beforeBypass=refs();
    localGit(a,['push','--no-verify','--force-with-lease='+ref+':'+head,remote,initial+':'+ref],identity);
    record.staleRemoteBlocked=gate.push(staleRemote).reason==='stale-remote'&&gate.tip(ref)===initial&&count()===2;
    localGit(a,['push','--no-verify',remote,latest+':'+ref],identity);record.noVerifyBypassVerified=gate.tip(ref)===latest&&count()===2;
    localGit(a,['-c','core.hooksPath='+path.join(base,'no-hooks'),'push','--force-with-lease='+ref+':'+latest,remote,initial+':'+ref],identity);
    record.hooksPathBypassVerified=gate.tip(ref)===initial&&count()===2;
    localGit(b,['push',remote,latest+':'+ref],identity);record.unhookedWorktreeBypassVerified=gate.tip(ref)===latest&&count()===2;
    record.bypassesLeaveLocalRefsUnchanged=refs()===beforeBypass;
    record.forceApprovalRequired=gate.push(gate.approve(gate.request({member:b,ref}))).reason==='force-approval-required'&&gate.tip(ref)===latest;
    record.approvedForce=gate.push(gate.approve(gate.request({member:b,ref,force:true})));record.approvedForceVerified=record.approvedForce.pushed&&record.approvedForce.forceApproved&&gate.tip(ref)===initial;
    record.hookLog=fs.readFileSync(log,'utf8').trim().split(/\r?\n/).map(JSON.parse);
    record.hookBytesUnchanged=hash(fs.readFileSync(worker))===record.sourceHashes['../fixtures/push-hook.cjs'];
  }catch{record.error='local push policy observation failed';}
  finally{try{
    if(lifecycle){for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}const entries=lifecycle.registry();record.registryRootOnly=entries.length===1&&path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();}
    if(!record.registryRootOnly)throw new Error('push registry cleanup unverified');record.originalRootUnchanged=original&&JSON.stringify(rootState(root))===JSON.stringify(original);
    record.baseTempRemoved=removeTemp(base,'tiye-s3-push-worktrees-');record.rootTempRemoved=removeTemp(root,'tiye-s3-push-root-');
  }catch{record.error='local push owned cleanup unverified';}}
  record.passed=pushPolicyPassed(record);record.result=record.passed?'PUSH_POLICY_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname,'../evidence/push-policy-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-push-policy] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();module.exports={pushPolicyPassed};

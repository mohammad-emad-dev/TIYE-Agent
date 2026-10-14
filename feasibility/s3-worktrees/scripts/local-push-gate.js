'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {attributionEnvironment}=require('./attribution-git');
function localGit(directory,args,identity,{allowed=[0],grant}={}) {
  const env=attributionEnvironment(identity);delete env.TIYE_FIXTURE_PUSH_GRANT;
  env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';
  if(grant)env.TIYE_FIXTURE_PUSH_GRANT=JSON.stringify(grant);
  const result=spawnSync('git',['-c','protocol.allow=never','-c','protocol.file.allow=always',...args],{cwd:directory,env,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:128000});
  if(result.error||!allowed.includes(result.status))throw new Error('local push fixture Git operation failed');
  return {status:result.status,output:result.stdout.trim()};
}
function createLocalPushGate({lifecycle,remote,remoteBase,identity}) {
  attributionEnvironment(identity,{});
  const canonicalBase=fs.realpathSync(remoteBase),canonicalRemote=fs.realpathSync(remote),who={...identity},requests=new WeakMap(),approvals=new WeakMap();
  function validateRemote(){
    if(fs.lstatSync(remoteBase).isSymbolicLink()||fs.lstatSync(remote).isSymbolicLink()
      ||fs.realpathSync(remoteBase)!==canonicalBase||fs.realpathSync(remote)!==canonicalRemote||path.dirname(canonicalRemote)!==canonicalBase
      ||localGit(canonicalRemote,['rev-parse','--is-bare-repository'],who).output!=='true')throw new Error('owned local bare remote unverified');
  }
  function tip(ref){validateRemote();const result=localGit(canonicalRemote,['rev-parse','--verify','--quiet',ref],who,{allowed:[0,1]});return result.status===0?result.output:null;}
  function request({member,ref,force=false}) {
    lifecycle.validate(member);validateRemote();
    if(typeof ref!=='string'||!/^refs\/heads\/tiye\/[a-z][a-z0-9-]{0,50}$/.test(ref)||typeof force!=='boolean')throw new Error('local push request invalid');
    localGit(member,['check-ref-format',ref],who);
    const plan={member,ref,force,remote:canonicalRemote,sourceHead:localGit(member,['rev-parse','HEAD'],who).output,remoteTip:tip(ref)};
    const displayed=Object.freeze({...plan});requests.set(displayed,plan);return displayed;
  }
  // Trusted fixture caller simulates approval; this is not a user-facing approval broker.
  function approve(request){const plan=requests.get(request);if(!plan)throw new Error('push request not owned');requests.delete(request);const approval=Object.freeze({approved:true});approvals.set(approval,{...plan});return approval;}
  function push(approval){
    const plan=approval&&typeof approval==='object'?approvals.get(approval):null;if(!plan)return {pushed:false,reason:'unapproved-push'};
    lifecycle.validate(plan.member);validateRemote();
    if(localGit(plan.member,['rev-parse','HEAD'],who).output!==plan.sourceHead)return {pushed:false,reason:'stale-source'};
    if(tip(plan.ref)!==plan.remoteTip)return {pushed:false,reason:'stale-remote'};
    if(plan.remoteTip&&!plan.force&&localGit(plan.member,['merge-base','--is-ancestor',plan.remoteTip,plan.sourceHead],who,{allowed:[0,1]}).status!==0)return {pushed:false,reason:'force-approval-required'};
    approvals.delete(approval);
    localGit(plan.member,['push','--porcelain','--force-with-lease='+plan.ref+':'+(plan.remoteTip||''),canonicalRemote,plan.sourceHead+':'+plan.ref],who,
      {grant:{remote:canonicalRemote,ref:plan.ref,sourceHead:plan.sourceHead,remoteTip:plan.remoteTip}});
    if(tip(plan.ref)!==plan.sourceHead)throw new Error('local push outcome unverified');
    return {pushed:true,ref:plan.ref,head:plan.sourceHead,forceApproved:plan.force};
  }
  return {request,approve,push,tip};
}
module.exports={createLocalPushGate,localGit};

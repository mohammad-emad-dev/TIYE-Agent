'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {attributionEnvironment}=require('./attribution-git');
const {treeFiles}=require('./run-basics');
const {createGitCheckpoints}=require('./git-checkpoints');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),oid=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function createFinalMergeGate({source,integration,lifecycle,validateSource,identity,storeDirectory,hooksDirectory}){
 validateSource();lifecycle.validate(integration);const root=fs.realpathSync(source),target=fs.realpathSync(integration),hooks=fs.realpathSync(hooksDirectory),plans=new WeakMap(),approvals=new WeakMap(),engine=Object.freeze({...identity});
 if(root===target||fs.lstatSync(hooksDirectory).isSymbolicLink()||fs.readdirSync(hooks).length)throw new Error('final merge configuration invalid');
 function native(directory,args,allowed=[0]){validateSource();lifecycle.validate(integration);if(fs.lstatSync(hooksDirectory).isSymbolicLink()||fs.realpathSync(hooksDirectory)!==hooks||fs.readdirSync(hooks).length)throw new Error('final merge hooks unverified');
  const env=attributionEnvironment(engine);env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';env.GIT_OPTIONAL_LOCKS='0';
  const result=spawnSync('git',['--no-replace-objects','-c','core.hooksPath='+hooks,'-c','merge.autostash=false',...args],{cwd:directory,env,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:128000});
  if(result.error||!allowed.includes(result.status))throw new Error('final merge Git operation unverified');return {status:result.status,output:result.stdout.trim()};
 }
 function read(directory,args){return native(directory,args).output;}
 const common=fs.realpathSync(read(root,['rev-parse','--path-format=absolute','--git-common-dir'])),branch=read(root,['symbolic-ref','HEAD']);
 if(common!==path.join(root,'.git')||fs.realpathSync(read(target,['rev-parse','--path-format=absolute','--git-common-dir']))!==common)throw new Error('final merge common Git mismatch');
 function binding(){validateSource();lifecycle.validate(integration);if(fs.lstatSync(source).isSymbolicLink()||fs.realpathSync(source)!==root||fs.realpathSync(integration)!==target
  ||read(root,['symbolic-ref','HEAD'])!==branch||fs.realpathSync(read(root,['rev-parse','--path-format=absolute','--git-common-dir']))!==common)throw new Error('final merge source binding changed');}
 function index(directory){const file=read(directory,['rev-parse','--path-format=absolute','--git-path','index']),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)throw new Error('final merge index unverified');return hash(fs.readFileSync(file));}
 function clean(directory){for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','index.lock'])if(fs.existsSync(read(directory,['rev-parse','--path-format=absolute','--git-path',name])))return 'active-operation';
  if(read(directory,['status','--porcelain','--untracked-files=all','--ignored']))return 'dirty-worktree';
  if(read(directory,['ls-files','-v','-z']).split('\0').filter(Boolean).some(line=>line[0]!=='H'))return 'unsupported-index-flags';return null;
 }
 function state(directory){return {head:read(directory,['rev-parse','HEAD']),index:index(directory),files:treeFiles(directory)};}
 function check(pinned){binding();if(read(root,['rev-parse','HEAD'])!==pinned.sourceHead)return 'stale-source-head';if(read(target,['rev-parse','HEAD'])!==pinned.integrationHead)return 'stale-integration-head';
  for(const directory of [root,target]){const reason=clean(directory);if(reason)return reason;}
  if(native(root,['merge-base','--is-ancestor',pinned.sourceHead,pinned.integrationHead],[0,1]).status!==0)return 'diverged-source';
  if(pinned.sourceState&&(JSON.stringify(state(root))!==JSON.stringify(pinned.sourceState)||JSON.stringify(state(target))!==JSON.stringify(pinned.integrationState)))return 'changed-reviewed-state';return null;
 }
 function prepare({expectedSourceHead,expectedIntegrationHead}){if(!oid(expectedSourceHead)||!oid(expectedIntegrationHead))throw new Error('final merge selection invalid');
  const pinned={sourceHead:expectedSourceHead,integrationHead:expectedIntegrationHead};const reason=expectedSourceHead===expectedIntegrationHead?'already-integrated':check(pinned);
  if(!reason){pinned.sourceState=state(root);pinned.integrationState=state(target);}
  const plan=Object.freeze({eligible:!reason,reason,sourceHead:expectedSourceHead,integrationHead:expectedIntegrationHead,resultBranch:read(target,['symbolic-ref','HEAD'])});plans.set(plan,{...pinned,eligible:!reason});return plan;
 }
 function approve(plan){const pinned=plans.get(plan);if(!pinned?.eligible)throw new Error('final merge plan not eligible');plans.delete(plan);const token=Object.freeze({approved:true});approvals.set(token,pinned);return token;}
 function merge(token,{session,sequence}){const pinned=token&&typeof token==='object'?approvals.get(token):null;if(!pinned)return {merged:false,reason:'unapproved'};approvals.delete(token);
  if(session!==engine.sessionId)throw new Error('final merge session mismatch');
  const reason=check(pinned);if(reason)return {merged:false,reason,resultBranch:read(target,['symbolic-ref','HEAD'])};
  const checkpoints=createGitCheckpoints({member:root,validate:binding,storeDirectory}),safety=checkpoints.capture(session,sequence);
  const changed=check(pinned);if(changed)return {merged:false,reason:changed,safety,resultBranch:read(target,['symbolic-ref','HEAD'])};
  native(root,['merge','--ff-only','--no-edit',pinned.integrationHead]);
  if(read(root,['rev-parse','HEAD'])!==pinned.integrationHead||clean(root)||read(root,['rev-parse','HEAD^{tree}'])!==read(target,[ 'rev-parse',pinned.integrationHead+'^{tree}'])
    ||JSON.stringify(treeFiles(root))!==JSON.stringify(pinned.integrationState.files)||JSON.stringify(state(target))!==JSON.stringify(pinned.integrationState))throw new Error('final merge outcome unverified');
  return {merged:true,commit:pinned.integrationHead,safety,resultBranch:read(target,['symbolic-ref','HEAD'])};
 }
 return {prepare,approve,merge};
}
module.exports={createFinalMergeGate};

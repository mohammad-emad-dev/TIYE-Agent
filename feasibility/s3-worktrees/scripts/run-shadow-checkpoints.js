'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {git,createWorktreeLifecycle}=require('./worktree-lifecycle');
const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {createGitCheckpoints}=require('./git-checkpoints');
const {createShadowRepositories}=require('./shadow-repository');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function timed(action){const started=performance.now(),value=action();return {value,ms:Math.round((performance.now()-started)*100)/100};}
function shadowPassed(record){return !record.error&&record.gitCase&&record.shadowCase&&[record.gitCase,record.shadowCase].every(item=>item.capturePreservedState&&item.restored&&item.safetySaved&&item.ignoredPreserved&&item.unrelatedPreserved&&item.indexBytesPreserved&&item.headBranchPreserved&&item.rawBytesLoaded&&[item.captureMs,item.loadMs,item.restoreMs].every(value=>Number.isFinite(value)&&value>0))
  &&record.shadowCreationPreservedFiles&&record.noProjectGitMetadata&&record.shadowReopened&&record.originalRootUnchanged&&record.registryRootOnly&&record.tempRemoved;}
function exercise({member,checkpoints,indexPath,state,session}){
 const target=path.join(member,'member-a.txt'),other=path.join(member,'member-b.txt'),ignored=path.join(member,'node_modules/canary.bin'),raw=path.join(member,'raw.bin');
 fs.mkdirSync(path.dirname(ignored));fs.writeFileSync(ignored,Buffer.from([9,0,255]));fs.writeFileSync(raw,Buffer.from([0,13,10,255]));
 const before=state(),index=fs.readFileSync(indexPath),captured=timed(()=>checkpoints.capture(session,1));
 const capturePreservedState=index.equals(fs.readFileSync(indexPath))&&JSON.stringify(before)===JSON.stringify(state());
 const loaded=timed(()=>checkpoints.load(session,1,captured.value.commit));fs.writeFileSync(target,'newer fixture bytes\n');fs.writeFileSync(other,'unrelated fixture bytes\n');
 const approved=checkpoints.approve(checkpoints.prepare(loaded.value,'member-a.txt')),preRestore=state(),beforeIndex=fs.readFileSync(indexPath);
 const restored=timed(()=>checkpoints.restore(approved,2)),safety=checkpoints.load(session,2,restored.value.safety.commit),after=state();
 const record={files:loaded.value.files.length,payloadBytes:loaded.value.files.reduce((total,file)=>total+file.size,0),captureMs:captured.ms,loadMs:loaded.ms,restoreMs:restored.ms,restoreIncludesSafetyCapture:true,capturePreservedState,
  restored:restored.value.restored&&fs.readFileSync(target,'utf8')==='original a\n',safetySaved:safety.files.some(file=>file.path==='member-a.txt'&&file.sha256===hash(Buffer.from('newer fixture bytes\n'))),
  ignoredPreserved:fs.readFileSync(ignored).equals(Buffer.from([9,0,255]))&&!loaded.value.files.some(file=>file.path.startsWith('node_modules/')),
  unrelatedPreserved:fs.readFileSync(other,'utf8')==='unrelated fixture bytes\n',indexBytesPreserved:beforeIndex.equals(fs.readFileSync(indexPath)),headBranchPreserved:preRestore.head===after.head&&preRestore.branch===after.branch,
  rawBytesLoaded:loaded.value.files.some(file=>file.path==='raw.bin'&&file.sha256===hash(Buffer.from([0,13,10,255])))};
 return record;
}
function main(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-shadow-')),root=path.join(base,'git-root'),slots=path.join(base,'slots'),project=path.join(base,'non-git-project'),stateDirectory=path.join(base,'shadow-state');
 for(const directory of [root,slots,project,stateDirectory])fs.mkdirSync(directory);
 const record={recordedAt:new Date().toISOString(),scope:'Single tiny Windows Git/worktree and non-Git shadow checkpoint timing observations and fixture-approved one-file restore',platform:process.platform,node:process.version,git:git(base,['--version']).output,
  sourceHashes:Object.fromEntries(['run-shadow-checkpoints.js','shadow-repository.js','git-checkpoints.js','attribution-git.js','run-basics.js','worktree-lifecycle.js'].map(name=>['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))])),
  performanceGuaranteeQualified:false,shadowGlobalRestartQualified:false,userApprovalUiQualified:false,fullS3Qualified:false,productionEligible:false};
 let lifecycle,original,member,manager,handle;
 try{
  initialize(root,slots);original=rootState(root);lifecycle=createWorktreeLifecycle({repository:root,base:slots});member=lifecycle.create({name:'member',branch:'codex/s3-shadow-timing'});const store=path.join(base,'git-indexes');fs.mkdirSync(store);
  const checkpoints=createGitCheckpoints({member,validate:()=>lifecycle.validate(member),storeDirectory:store}),indexPath=git(member,['rev-parse','--path-format=absolute','--git-path','index']).output;
  const memberState=()=>({head:git(member,['rev-parse','HEAD']).output,branch:git(member,['symbolic-ref','HEAD']).output,files:treeFiles(member)});
  record.gitCase=exercise({member,checkpoints,indexPath,state:memberState,session:'git-timing'});
  for(const [name,content]of Object.entries({'.gitignore':'node_modules/\n','member-a.txt':'original a\n','member-b.txt':'original b\n'}))fs.writeFileSync(path.join(project,name),content);
  const originalProject=treeFiles(project);manager=createShadowRepositories();handle=manager.create({projectDirectory:project,stateDirectory});record.shadowCreationPreservedFiles=JSON.stringify(treeFiles(project))===JSON.stringify(originalProject);
  const shadowState=()=>{manager.validate(handle);const args=['--git-dir='+handle.repositoryDirectory,'--work-tree='+project];return {head:git(project,[...args,'rev-parse','HEAD']).output,branch:git(project,[...args,'symbolic-ref','HEAD']).output,files:treeFiles(project)};};
  record.shadowCase=exercise({member:project,checkpoints:manager.open(handle),indexPath:path.join(handle.repositoryDirectory,'index'),state:shadowState,session:'shadow-timing'});
  const ref=git(project,['--git-dir='+handle.repositoryDirectory,'--work-tree='+project,'rev-parse','refs/tiye/shadow-timing/1']).output;
  record.shadowReopened=manager.open(handle).load('shadow-timing',1,ref).files.length===4;record.noProjectGitMetadata=!fs.lstatSync(path.join(project,'.git'),{throwIfNoEntry:false});
  lifecycle.validate(member);fs.unlinkSync(path.join(member,'raw.bin'));fs.unlinkSync(path.join(member,'node_modules/canary.bin'));fs.rmdirSync(path.join(member,'node_modules'));
  git(member,['add','--','member-b.txt']);git(member,['commit','--quiet','-m','Owned timing fixture work']);lifecycle.remove(member);record.registryRootOnly=lifecycle.registry().length===1;
  record.originalRootUnchanged=JSON.stringify(rootState(root))===JSON.stringify(original);manager.validate(handle);record.tempRemoved=removeTemp(base,'tiye-s3-shadow-');
 }catch{record.error='shadow checkpoint fixture failed';}
 record.passed=Boolean(shadowPassed(record)&&record.shadowCreationPreservedFiles);record.result=record.passed?'SHADOW_CHECKPOINTS_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.join(__dirname,'../evidence/shadow-checkpoints-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-shadow] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();module.exports={shadowPassed};

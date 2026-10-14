'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {git,createWorktreeLifecycle}=require('./worktree-lifecycle');
const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {attributionGit}=require('./attribution-git');
const {createGitCheckpoints}=require('./git-checkpoints');
const {assertWindowsTreePaths,removeWindowsWorktree}=require('./windows-worktree-preflight');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function windowsPassed(record){return !record.error&&record.platform==='win32'&&['longPathGitAndCheckpoint','caseAliasSameFile','caseAliasCreateRefused','syntheticCaseTreeRefused','stagedLfWorkingCrlf','rawCrlfRecovered','realIndexPreserved','exclusiveLockCorrelated','lockedRemovalRefused','lockedInventoryPreserved','lockChildExited','unlockedRemovalPassed','originalRootUnchanged','registryRootOnly','tempRemoved'].every(key=>record[key]===true)&&record.worktreesCreated===1&&record.worktreesRemoved===1&&record.maxAbsolutePathLength>260;}
async function main(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-windows-')),root=path.join(base,'root'),slots=path.join(base,'slots'),store=path.join(base,'indexes');for(const directory of [root,slots,store])fs.mkdirSync(directory);
 const record={recordedAt:new Date().toISOString(),scope:'Bounded Windows long-path, case-alias/collision, CRLF checkpoint and exclusive-read-lock removal preflight fixture',platform:process.platform,windowsRelease:os.release(),node:process.version,git:git(base,['--version']).output,
  sourceHashes:Object.fromEntries(['run-windows.js','windows-worktree-preflight.js','worktree-lifecycle.js','run-basics.js','git-checkpoints.js','attribution-git.js'].map(name=>['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))]).concat([['fixtures/windows-file-lock.ps1',hash(fs.readFileSync(path.join(__dirname,'../fixtures/windows-file-lock.ps1')))]])),
  antivirusContributionQualified:false,performanceGuaranteeQualified:false,allWindowsVolumesQualified:false,allFileSharingModesQualified:false,atomicRemovalQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
 let lifecycle,original,member,child,completion,release,nonce;
 try{
  if(process.platform!=='win32')throw new Error('Windows host required');const shellVersion=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.ToString()'],{windowsHide:true,encoding:'utf8',timeout:10000});
  if(shellVersion.error||shellVersion.status!==0||!/^\d+(?:\.\d+){1,3}$/.test(shellVersion.stdout.trim()))throw new Error('PowerShell version unverified');record.powerShellVersion=shellVersion.stdout.trim();
  initialize(root,slots);git(root,['config','core.longpaths','true']);original=rootState(root);lifecycle=createWorktreeLifecycle({repository:root,base:slots});
  const started=performance.now();member=lifecycle.create({name:'member',branch:'codex/s3-windows'});record.creationMs=Math.round((performance.now()-started)*100)/100;record.worktreesCreated=1;record.coreLongpaths=git(member,['config','--local','core.longpaths']).output;
  const identity={memberId:'member',memberName:'Fixture Windows Member',sessionId:'windows-fixture'},relative=Array.from({length:5},(_,index)=>'long-'+index+'-'+('a'.repeat(36))).join('/')+'/sample.txt',longFile=path.join(member,...relative.split('/'));
  record.maxAbsolutePathLength=longFile.length;fs.mkdirSync(path.dirname(longFile),{recursive:true});fs.writeFileSync(longFile,'long path fixture\n');git(member,['add','--',relative]);git(member,['commit','--quiet','-m','Owned long path fixture']);
  const caseFile=path.join(member,'CaseName.txt');fs.writeFileSync(caseFile,'case alias fixture\n');record.caseAliasSameFile=fs.readFileSync(path.join(member,'casename.txt'),'utf8')==='case alias fixture\n'&&fs.realpathSync(path.join(member,'casename.txt')).toLowerCase()===fs.realpathSync(caseFile).toLowerCase();
  try{lifecycle.create({name:'Member',branch:'codex/s3-windows-alias'});record.caseAliasCreateRefused=false;}catch(error){record.caseAliasCreateRefused=error.message==='fixture worktree selection invalid';record.caseAliasCreateRefusal='lowercase member selection policy';}
  git(member,['add','--','CaseName.txt']);git(member,['commit','--quiet','-m','Owned case alias fixture']);
  const blob=attributionGit(member,['hash-object','-w','--stdin'],identity,'case collision fixture\n').trim(),tree=attributionGit(member,['mktree'],identity,'100644 blob '+blob+'\tFoo.txt\n100644 blob '+blob+'\tfoo.txt\n').trim();
  const casePaths=git(member,['ls-tree','-r','--name-only',tree]).output.split(/\r?\n/);try{assertWindowsTreePaths(casePaths);record.syntheticCaseTreeRefused=false;}catch{record.syntheticCaseTreeRefused=casePaths.length===2;}
  const crlf=Buffer.from('first\r\nsecond\r\n'),lf=Buffer.from('first\nsecond\n'),line=path.join(member,'line-endings.txt');fs.writeFileSync(line,crlf);git(member,['add','--','line-endings.txt']);git(member,['commit','--quiet','-m','Owned line ending fixture']);
  record.stagedLfWorkingCrlf=attributionGit(member,['show',':line-endings.txt'],identity)===lf.toString()&&fs.readFileSync(line).equals(crlf);
  const indexPath=git(member,['rev-parse','--path-format=absolute','--git-path','index']).output,index=fs.readFileSync(indexPath),checkpoints=createGitCheckpoints({member,validate:()=>lifecycle.validate(member),storeDirectory:store}),saved=checkpoints.capture('windows-fixture',1),loaded=checkpoints.load('windows-fixture',1,saved.commit);
  record.longPathGitAndCheckpoint=record.coreLongpaths==='true'&&git(member,['show','HEAD:'+relative]).output==='long path fixture'&&loaded.files.some(file=>file.path===relative&&file.sha256===hash(Buffer.from('long path fixture\n')));
  fs.writeFileSync(line,'newer line bytes\n');const restored=checkpoints.restore(checkpoints.approve(checkpoints.prepare(loaded,'line-endings.txt')),2);record.rawCrlfRecovered=restored.restored&&fs.readFileSync(line).equals(crlf);record.realIndexPreserved=index.equals(fs.readFileSync(indexPath));
  git(member,['--no-optional-locks','status','--porcelain']);const inventory=treeFiles(member),memberHead=git(member,['rev-parse','HEAD']).output,registry=JSON.stringify(lifecycle.registry()),lockIndex=fs.readFileSync(indexPath);
  const ready=path.join(base,'lock-ready.txt');release=path.join(base,'lock-release.txt');nonce=crypto.randomUUID();child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'../fixtures/windows-file-lock.ps1'),'-FilePath',path.join(member,'member-a.txt'),'-ReadyPath',ready,'-ReleasePath',release,'-Nonce',nonce],{windowsHide:true,stdio:'ignore'});
  completion=new Promise(resolve=>{child.once('error',()=>resolve(null));child.once('close',code=>resolve(code));});const deadline=Date.now()+10000;while(!fs.existsSync(ready)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  record.exclusiveLockCorrelated=fs.existsSync(ready)&&fs.readFileSync(ready,'utf8')===nonce;if(!record.exclusiveLockCorrelated)throw new Error('Lock fixture not ready');
  try{removeWindowsWorktree({lifecycle,member});record.lockedRemovalRefused=false;}catch(error){record.lockedRemovalRefused=error.message==='Windows removal readable handle unavailable';}
  record.lockedInventoryPreserved=JSON.stringify(lifecycle.registry())===registry&&git(member,['rev-parse','HEAD']).output===memberHead&&lockIndex.equals(fs.readFileSync(indexPath))&&inventory.every(file=>fs.existsSync(path.join(member,...file.name.split('/'))));
  fs.writeFileSync(release,nonce,{flag:'wx'});record.lockChildExited=await completion===0;child=null;if(!record.lockChildExited)throw new Error('Lock child exit unverified');
  record.lockedInventoryPreserved=record.lockedInventoryPreserved&&JSON.stringify(treeFiles(member))===JSON.stringify(inventory);
  record.unlockedRemovalPassed=removeWindowsWorktree({lifecycle,member}).removed;record.worktreesRemoved++;record.registryRootOnly=lifecycle.registry().length===1;
  record.originalRootUnchanged=JSON.stringify(rootState(root))===JSON.stringify(original);record.tempRemoved=removeTemp(base,'tiye-s3-windows-');
 }catch{record.error='Windows edge fixture failed';}
 finally{if(child&&completion){try{if(release&&!fs.existsSync(release))fs.writeFileSync(release,nonce,{flag:'wx'});await completion;}catch{record.error='Owned Windows lock cleanup unverified';}}}
 record.passed=Boolean(windowsPassed(record));record.result=record.passed?'WINDOWS_EDGE_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.join(__dirname,'../evidence/windows-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-windows] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main().catch(()=>{console.error('Windows lifecycle failure');process.exitCode=1;});module.exports={windowsPassed};

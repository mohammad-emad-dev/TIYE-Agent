'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {git,createWorktreeLifecycle}=require('./worktree-lifecycle');const {initialize,rootState,treeFiles,removeTemp}=require('./run-basics');
const {attributionGit}=require('./attribution-git');const {createWindowsWorktree}=require('./windows-worktree-create');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function windowsCreatePassed(record){return !record.error&&record.platform==='win32'&&record.refusals?.length===5&&record.refusals.every(item=>item.refused&&item.noTarget&&item.noBranch&&item.registryPreserved&&item.sourcePreserved)
 &&['validCreated','selectedCommitMatched','safeFilesMatched','originalRootUnchanged','registryRootOnly','tempRemoved'].every(key=>record[key]===true)&&record.worktreesCreated===1&&record.worktreesRemoved===1;}
function main(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-windows-create-')),root=path.join(base,'root'),slots=path.join(base,'slots');fs.mkdirSync(root);fs.mkdirSync(slots);
 const record={recordedAt:new Date().toISOString(),scope:'Explicit Windows worktree creation wrapper: native commit/tree path preflight before branch/directory/checkout writes',platform:process.platform,windowsRelease:os.release(),node:process.version,git:git(base,['--version']).output,
 sourceHashes:Object.fromEntries(['run-windows-create.js','windows-worktree-create.js','windows-worktree-preflight.js','worktree-lifecycle.js','run-basics.js','attribution-git.js'].map(name=>['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))])),
 originalLifecycleCreateChanged:false,atomicCheckoutQualified:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};let lifecycle;
 try{
  initialize(root,slots);const original=rootState(root),start=original.head,identity={memberId:'windows-create',memberName:'Fixture Windows Create',sessionId:'windows-create'};lifecycle=createWorktreeLifecycle({repository:root,base:slots});
  const blob=attributionGit(root,['hash-object','-w','--stdin'],identity,'synthetic unsafe tree\n').trim();
  const tree=entries=>attributionGit(root,['mktree'],identity,entries.map(([mode,type,id,name])=>mode+' '+type+' '+id+'\t'+name+'\n').join('')).trim();
  const a=tree([['100644','blob',blob,'a.txt']]),b=tree([['100644','blob',blob,'b.txt']]);
  const cases=[['file-case',tree([['100644','blob',blob,'Foo.txt'],['100644','blob',blob,'foo.txt']])],['directory-case',tree([['040000','tree',a,'Folder'],['040000','tree',b,'folder']])],
   ['device-name',tree([['100644','blob',blob,'CON.txt']])],['non-ascii',tree([['100644','blob',blob,'caf\u00e9.txt']])],['symlink',tree([['120000','blob',blob,'link.txt']])]];
  record.refusals=cases.map(([name,treeId])=>{const commit=attributionGit(root,['commit-tree',treeId,'-p',start],identity,'Unsafe fixture '+name+'\n').trim(),before=rootState(root),registry=JSON.stringify(lifecycle.registry()),branch='codex/windows-rejected-'+name;
   let reason=null;try{createWindowsWorktree({lifecycle,repository:root,name,branch,ref:commit});}catch(error){reason=error.message;}
   const expected=name.endsWith('-case')?'Windows case collision':name==='symlink'?'Windows create tree mode unsupported':'Windows path unsupported';
   return {case:name,refused:reason===expected,reason,noTarget:!fs.existsSync(path.join(slots,name)),noBranch:git(root,['show-ref','--verify','--quiet','refs/heads/'+branch],[0,1]).status===1,
    registryPreserved:JSON.stringify(lifecycle.registry())===registry,sourcePreserved:JSON.stringify(rootState(root))===JSON.stringify(before)};});
  if(!record.refusals.every(item=>item.refused&&item.noTarget&&item.noBranch))throw new Error('Unsafe fixture created');
  const member=createWindowsWorktree({lifecycle,repository:root,name:'safe-member',branch:'codex/windows-safe',ref:'main'});record.worktreesCreated=1;record.checkedPaths=member.checkedPaths;
  record.validCreated=lifecycle.owned().length===1;record.selectedCommitMatched=member.selectedCommit===start&&git(member.directory,['rev-parse','HEAD']).output===start;
  record.safeFilesMatched=JSON.stringify(treeFiles(member.directory))===JSON.stringify(original.files.filter(file=>file.name!=='local-settings.json'))&&git(member.directory,['status','--porcelain','--untracked-files=all']).output==='';
  lifecycle.remove(member.directory);record.worktreesRemoved++;record.registryRootOnly=lifecycle.registry().length===1;record.originalRootUnchanged=JSON.stringify(rootState(root))===JSON.stringify(original);
  record.tempRemoved=removeTemp(base,'tiye-s3-windows-create-');
 }catch{record.error='Windows create observation failed';}
 record.passed=Boolean(windowsCreatePassed(record));record.result=record.passed?'WINDOWS_CREATE_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';fs.writeFileSync(path.join(__dirname,'../evidence/windows-create-latest.json'),JSON.stringify(record,null,2)+'\n');console.log('[s3-windows-create] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main();module.exports={windowsCreatePassed};

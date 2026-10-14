'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {attributionEnvironment}=require('./attribution-git');
const {assertWindowsTreePaths}=require('./windows-worktree-preflight');
const key=value=>path.resolve(value).toLowerCase();
function createWindowsWorktree({lifecycle,repository,name,branch,ref='HEAD'}){
 if(process.platform!=='win32'||typeof repository!=='string'||!path.isAbsolute(repository)||typeof ref!=='string'||!ref||!/^[a-zA-Z0-9_./-]+$/.test(ref)||ref.startsWith('-'))throw new Error('Windows create selection unsupported');
 const root=fs.realpathSync(repository),metadata=path.join(root,'.git');
 function validate(){if(fs.lstatSync(repository).isSymbolicLink()||key(fs.realpathSync(repository))!==key(root)||fs.lstatSync(metadata).isSymbolicLink()||!fs.lstatSync(metadata).isDirectory()
  ||lifecycle.registry().filter(entry=>entry.directory&&key(entry.directory)===key(root)).length!==1)throw new Error('Windows create repository binding unverified');}
 function native(args){validate();const env=attributionEnvironment({memberId:'windows-create',memberName:'Fixture Windows Create',sessionId:'windows-create'});env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL='NUL';env.GIT_OPTIONAL_LOCKS='0';
  const result=spawnSync('git',['--no-replace-objects','--git-dir='+metadata,'--work-tree='+root,...args],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:2097152});
  if(result.error||result.status!==0)throw new Error('Windows create Git selection unverified');return result.stdout.trim();}
 if(key(fs.realpathSync(native(['rev-parse','--path-format=absolute','--git-common-dir'])))!==key(metadata)||native(['for-each-ref','--format=%(refname)','refs/replace/']))throw new Error('Windows create Git context unsupported');
 const commit=native(['rev-parse','--verify',ref+'^{commit}']);if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Windows create commit format unsupported');
 const entries=native(['ls-tree','-r','-z','--full-tree',commit]).split('\0').filter(Boolean),names=entries.map(entry=>{const match=/^(100644|100755) blob [a-f0-9]{40}\t([\s\S]+)$/.exec(entry);if(!match)throw new Error('Windows create tree mode unsupported');return match[2];});
 assertWindowsTreePaths(names);validate();const member=lifecycle.create({name,branch,ref:commit});lifecycle.validate(member);return {directory:member,selectedCommit:commit,checkedPaths:names.length};
}
module.exports={createWindowsWorktree};

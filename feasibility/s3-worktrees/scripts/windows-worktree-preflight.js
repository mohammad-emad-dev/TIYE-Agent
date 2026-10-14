'use strict';
const fs=require('node:fs'),path=require('node:path');
function assertWindowsTreePaths(paths){if(!Array.isArray(paths)||paths.length>1000)throw new Error('Windows tree path limit');const seen=new Map(),files=new Set();
 for(const name of paths){if(typeof name!=='string'||!name||!/^[a-zA-Z0-9_./-]+$/.test(name))throw new Error('Windows path unsupported');const parts=name.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'||part.endsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw new Error('Windows path unsupported');
  let prefix='';for(const part of parts){prefix=prefix?prefix+'/'+part:part;const key=prefix.toLowerCase();if(seen.has(key)&&seen.get(key)!==prefix)throw new Error('Windows case collision');seen.set(key,prefix);}
  if(files.has(name.toLowerCase()))throw new Error('Windows duplicate path');files.add(name.toLowerCase());
 }
 for(const file of files)for(const ancestor of file.split('/').slice(0,-1).map((_,index)=>file.split('/').slice(0,index+1).join('/')))if(files.has(ancestor))throw new Error('Windows file/directory collision');return true;
}
function removeWindowsWorktree({lifecycle,member}){
 if(process.platform!=='win32')throw new Error('Windows preflight platform unsupported');lifecycle.validate(member);const root=fs.realpathSync(member),names=[];let bytes=0,entries=0;
 function inspect(directory){for(const entry of fs.readdirSync(directory).sort()){if(directory===root&&entry==='.git')continue;const file=path.join(directory,entry),stat=fs.lstatSync(file);
  if(++entries>2000||stat.isSymbolicLink()||fs.realpathSync(file).toLowerCase()!==file.toLowerCase())throw new Error('Windows removal path unverified');
  if(stat.isDirectory()){inspect(file);continue;}if(!stat.isFile()||stat.nlink!==1||stat.size>1048576||names.length>=1000||(bytes+=stat.size)>8388608)throw new Error('Windows removal file unsupported');
  names.push(path.relative(root,file).split(path.sep).join('/'));let descriptor;try{descriptor=fs.openSync(file,'r');}catch{throw new Error('Windows removal readable handle unavailable');}finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
 }}
 inspect(root);assertWindowsTreePaths(names);lifecycle.validate(member);lifecycle.remove(member);return {removed:true,checkedFiles:names.length};
}
module.exports={assertWindowsTreePaths,removeWindowsWorktree};

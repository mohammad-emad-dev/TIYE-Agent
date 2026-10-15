'use strict';
const fs=require('node:fs'),path=require('node:path'),{sampleProcesses}=require('../resources/sampler');
async function identities(registry){
  const rows=await sampleProcesses(registry),captured=new Map();
  for(const row of rows){if(row.status!=='present')throw Error('owned-process-not-present '+registry.get(row.pid)+' '+row.status);captured.set(row.pid,row.identity);}
  return captured;
}
async function requireIdentity(pid,role,expected){
  const current=await identities(new Map([[pid,role]]));if(current.get(pid)!==expected)throw Error('owned-process-identity-drift');
}
async function goneChecks(registry,expected){
  const rows=await sampleProcesses(registry);
  return rows.map(row=>({role:registry.get(row.pid),status:row.status==='exited'?'exited':row.status==='present'&&row.identity!==expected.get(row.pid)?'original-exited-pid-reused':'not-confirmed-exited'}));
}
function cleanup(root,parent,marker){
  if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owner-drift');
  const allowed=new Set(['.owner','prelaunch.json',...['0-0','1-0','2-0','3-0','4-0','0-1'].map(member=>'backend-'+member+'.json'),'feed.sqlite','feed.sqlite-wal','feed.sqlite-shm',...['0-0','1-0','2-0','3-0','4-0','0-1'].map(member=>'member-'+member+'.log')]);
  const entries=fs.readdirSync(root).map(name=>{const filename=path.join(root,name),stat=fs.lstatSync(filename);
    if(!allowed.has(name)||stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||path.dirname(fs.realpathSync(filename))!==root)throw Error('unsafe-cleanup-entry');return filename;});
  entries.forEach(filename=>fs.unlinkSync(filename));fs.rmdirSync(root);
}
module.exports={identities,requireIdentity,goneChecks,cleanup};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {git}=require('./worktree-lifecycle');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const key=name=>process.platform==='win32'?name.toLowerCase():name;
function fileName(name){if(typeof name!=='string'||!name||!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(part=>!part||['.','..','.git'].includes(part.toLowerCase())))throw new Error('ownership path unsupported');return name;}
function createOwnershipWatcher({lifecycle,member,assigned,intervalMs=100}){
  lifecycle.validate(member);if(!Array.isArray(assigned)||!Number.isInteger(intervalMs)||intervalMs<50||intervalMs>10000)throw new Error('ownership watcher options invalid');
  const root=fs.realpathSync(member),owned=new Set(assigned.map(name=>key(fileName(name)))),observations=new WeakMap(),approvals=new WeakMap();
  let timer=null,started=false,closed=false,fault=null;const queue=[],last=new Map();
  function target(name){
    const selected=path.join(root,...fileName(name).split('/')),parent=path.dirname(selected);
    let current=root;for(const part of path.relative(root,parent).split(path.sep).filter(Boolean)){current=path.join(current,part);const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory()||key(fs.realpathSync(current))!==key(current))throw new Error('ownership parent unverified');}
    const stat=fs.lstatSync(selected,{throwIfNoEntry:false});if(stat&&(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||key(fs.realpathSync(selected))!==key(selected)))throw new Error('ownership target unverified');
    return {selected,stat};
  }
  function snapshot(){
    lifecycle.validate(member);const files=new Map();let total=0;
    function walk(directory,prefix=''){
      for(const name of fs.readdirSync(directory).sort()){
        if(!prefix&&name.toLowerCase()==='.git')continue;
        const relative=fileName(prefix+name),selected=path.join(directory,name),stat=fs.lstatSync(selected);
        if(stat.isSymbolicLink())throw new Error('ownership links unsupported');
        if(stat.isDirectory()){if(key(fs.realpathSync(selected))!==key(selected))throw new Error('ownership directory unverified');walk(selected,relative+'/');}
        else{
          target(relative);if(stat.size>1048576||files.size>=1000)throw new Error('ownership snapshot limit');
          const bytes=fs.readFileSync(selected);total+=bytes.length;if(bytes.length>1048576||total>8388608||files.has(key(relative)))throw new Error('ownership snapshot limit');
          files.set(key(relative),{name:relative,hash:hash(bytes),bytes});
        }
      }
    }
    walk(root);return files;
  }
  const checkpoint=snapshot(),head=git(member,['rev-parse','HEAD']).output,index=git(member,['write-tree']).output;
  function scan(){
    if(fault)throw new Error('ownership watcher faulted');
    try{
      const current=snapshot(),changes=[];
      for(const name of new Set([...checkpoint.keys(),...current.keys()])){
        if(owned.has(name))continue;const before=checkpoint.get(name),after=current.get(name);if(before?.hash===after?.hash)continue;
        const observation=Object.freeze({path:after?.name||before.name,kind:!before?'added':!after?'deleted':'modified',beforeHash:before?.hash||null,observedHash:after?.hash||null});
        observations.set(observation,{...observation});changes.push(observation);
      }
      return changes;
    }catch{fault='snapshot-unverified';if(timer)clearTimeout(timer);throw new Error('ownership snapshot unverified');}
  }
  function tick(){
    if(closed||fault)return;
    try{const changes=scan(),active=new Set(changes.map(change=>key(change.path)));for(const name of last.keys())if(!active.has(name))last.delete(name);
      for(const change of changes){const fingerprint=change.kind+':'+change.observedHash;if(last.get(key(change.path))===fingerprint)continue;if(queue.length>=100)throw new Error('ownership queue limit');queue.push(change);last.set(key(change.path),fingerprint);}
    }catch{fault=fault||'queue-unverified';}
    if(!closed&&!fault)timer=setTimeout(tick,intervalMs);
  }
  function approve(observation){const selected=observations.get(observation);if(!selected)throw new Error('ownership observation not owned');observations.delete(observation);const approval=Object.freeze({approved:true});approvals.set(approval,selected);return approval;}
  function restore(approval){
    const selected=approval&&typeof approval==='object'?approvals.get(approval):null;if(!selected||fault)return {restored:false,reason:'unapproved-or-faulted'};
    // Every reviewed attempt consumes its approval, including refusals and uncertain failures.
    approvals.delete(approval);
    lifecycle.validate(member);if(git(member,['rev-parse','HEAD']).output!==head)return {restored:false,reason:'changed-head'};
    if(git(member,['write-tree']).output!==index)return {restored:false,reason:'changed-index'};
    const file=target(selected.path),currentHash=file.stat?hash(fs.readFileSync(file.selected)):null;
    if(currentHash!==selected.observedHash)return {restored:false,reason:'stale-target'};
    const before=checkpoint.get(key(selected.path));
    if(before)fs.writeFileSync(file.selected,before.bytes);else fs.unlinkSync(file.selected);
    const restored=before?hash(fs.readFileSync(file.selected))===before.hash:!fs.lstatSync(file.selected,{throwIfNoEntry:false});
    if(!restored)throw new Error('ownership restore outcome unverified');return {restored:true,path:selected.path};
  }
  return {scan,approve,restore,start(){if(started||closed||fault)throw new Error('ownership watcher cannot start');started=true;tick();},
    drain(){return queue.splice(0);},close(){closed=true;if(timer)clearTimeout(timer);},state(){return {closed,fault,queued:queue.length};}};
}
module.exports={createOwnershipWatcher};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {attributionEnvironment}=require('./attribution-git');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),oid=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function name(value){if(typeof value!=='string'||!value||!/^[a-zA-Z0-9_./-]+$/.test(value)||value.split('/').some(part=>!part||['.','..','.git'].includes(part.toLowerCase())))throw new Error('checkpoint path unsupported');return value;}
function selection(session,sequence){if(typeof session!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(session)||!Number.isSafeInteger(sequence)||sequence<1)throw new Error('checkpoint selection invalid');return 'refs/tiye/'+session+'/'+sequence;}
function createGitCheckpoints({member,validate,storeDirectory}){
  validate();const root=fs.realpathSync(member),store=fs.realpathSync(storeDirectory),loaded=new WeakMap(),plans=new WeakMap(),approvals=new WeakMap();let gitDirectory;
  if(fs.lstatSync(storeDirectory).isSymbolicLink()||store===root||store.startsWith(root+path.sep))throw new Error('checkpoint scratch boundary invalid');
  const identity={memberId:'checkpoint-engine',memberName:'Fixture Checkpoint Engine',sessionId:'checkpoint-fixture'};
  function check(){validate();if(fs.lstatSync(storeDirectory).isSymbolicLink()||fs.realpathSync(storeDirectory)!==store)throw new Error('checkpoint scratch identity changed');
    if(gitDirectory&&['index.lock','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply'].some(name=>fs.existsSync(path.join(gitDirectory,name))))throw new Error('checkpoint active Git operation');}
  function native(args,{input,indexFile,binary=false}={}){
    check();const env=attributionEnvironment(identity);env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';if(indexFile)env.GIT_INDEX_FILE=indexFile;
    const result=spawnSync('git',['--no-replace-objects','-c','commit.gpgsign=false',...args],{cwd:root,env,input,windowsHide:true,encoding:binary?undefined:'utf8',timeout:20000,maxBuffer:9000000});
    if(result.error||result.status!==0)throw new Error('checkpoint Git operation failed');return binary?result.stdout:result.stdout.trim();
  }
  function temporary(run,copy){const file=path.join(store,'index-'+crypto.randomUUID());if(fs.existsSync(file)||fs.existsSync(file+'.lock'))throw new Error('checkpoint scratch collision');try{if(copy)fs.writeFileSync(file,copy,{flag:'wx'});return run(file);}finally{
    if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||path.dirname(fs.realpathSync(file))!==store)throw new Error('checkpoint index cleanup unverified');fs.unlinkSync(file);}
    if(fs.existsSync(file+'.lock'))throw new Error('checkpoint index lock retained');
  }}
  function indexBytes(){const file=native(['rev-parse','--path-format=absolute','--git-path','index']),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)throw new Error('checkpoint index unverified');return fs.readFileSync(file);}
  function indexTree(){return temporary(indexFile=>native(['write-tree'],{indexFile}),indexBytes());}
  function target(relative){const file=path.join(root,...name(relative).split('/'));let parent=root;
    for(const part of path.relative(root,path.dirname(file)).split(path.sep).filter(Boolean)){parent=path.join(parent,part);if(fs.lstatSync(parent).isSymbolicLink()||!fs.lstatSync(parent).isDirectory()||fs.realpathSync(parent).toLowerCase()!==parent.toLowerCase())throw new Error('checkpoint parent unverified');}
    const stat=fs.lstatSync(file,{throwIfNoEntry:false});if(stat&&(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1))throw new Error('checkpoint target unverified');return {file,stat};}
  function snapshot(){const names=[...new Set(native(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean))].sort(),files=[];let total=0;
    for(const relative of names){const selected=target(relative);if(!selected.stat)continue;if(selected.stat.size>1048576||files.length>=1000)throw new Error('checkpoint size limit');
      const bytes=fs.readFileSync(selected.file);total+=bytes.length;if(bytes.length>1048576||total>8388608)throw new Error('checkpoint size limit');files.push({path:relative,sha256:sha(bytes),size:bytes.length,bytes});}
    return files;
  }
  const common=native(['rev-parse','--path-format=absolute','--git-common-dir']),binding={memberKey:sha(Buffer.from(root.toLowerCase())),commonKey:sha(Buffer.from(fs.realpathSync(common).toLowerCase()))};
  gitDirectory=fs.realpathSync(native(['rev-parse','--absolute-git-dir']));check();
  function capture(session,sequence){const ref=selection(session,sequence),head=native(['rev-parse','HEAD']),branch=native(['symbolic-ref','HEAD']),actualIndex=indexBytes(),stagedTree=indexTree(),files=snapshot();
    const payload=temporary(indexFile=>{native(['read-tree','--empty'],{indexFile});const lines=files.map(file=>{file.blob=native(['hash-object','-w','--no-filters','--stdin'],{input:file.bytes});return '100644 '+file.blob+'\t'+file.path+'\n';}).join('');
      native(['update-index','--index-info'],{indexFile,input:lines});return native(['write-tree'],{indexFile});});
    const manifest={format:'tiye-checkpoint-v1',session,sequence,...binding,head,branch,indexTree:stagedTree,payload,files:files.map(({bytes,...file})=>file)};
    const manifestBlob=native(['hash-object','-w','--no-filters','--stdin'],{input:JSON.stringify(manifest)+'\n'});
    const tree=native(['mktree'],{input:'040000 tree '+payload+'\tfiles\n100644 blob '+manifestBlob+'\tmanifest.json\n'});
    const commit=native(['commit-tree',tree,'-p',head],{input:'TIYE checkpoint '+session+':'+sequence+'\n'});
    if(native(['rev-parse','HEAD'])!==head||native(['symbolic-ref','HEAD'])!==branch||!actualIndex.equals(indexBytes())
      ||JSON.stringify(snapshot().map(({bytes,...file})=>file))!==JSON.stringify(files.map(({bytes,blob,...file})=>file)))throw new Error('checkpoint capture state changed');
    native(['update-ref',ref,commit,'0'.repeat(40)]);return Object.freeze({ref,commit,sequence,files:files.length});
  }
  function load(session,sequence,expectedCommit){const ref=selection(session,sequence);if(!oid(expectedCommit)||native(['rev-parse','--verify',ref])!==expectedCommit)throw new Error('checkpoint reference mismatch');
    if(native(['cat-file','-t',expectedCommit])!=='commit')throw new Error('checkpoint object type invalid');
    const manifest=JSON.parse(native(['cat-file','blob',expectedCommit+':manifest.json']));
    if(manifest.format!=='tiye-checkpoint-v1'||manifest.session!==session||manifest.sequence!==sequence||manifest.memberKey!==binding.memberKey||manifest.commonKey!==binding.commonKey
      ||manifest.branch!==native(['symbolic-ref','HEAD'])||!oid(manifest.head)||!oid(manifest.indexTree)||!oid(manifest.payload)||!Array.isArray(manifest.files)||manifest.files.length>1000
      ||native(['rev-parse',expectedCommit+':files'])!==manifest.payload)throw new Error('checkpoint manifest binding invalid');
    if(native(['rev-list','--parents','-n','1',expectedCommit])!==expectedCommit+' '+manifest.head)throw new Error('checkpoint parent mismatch');
    const rootEntries=native(['ls-tree','--name-only',expectedCommit]).split('\n').sort();if(JSON.stringify(rootEntries)!==JSON.stringify(['files','manifest.json']))throw new Error('checkpoint root shape invalid');
    const treeEntries=native(['ls-tree','-r','-z',expectedCommit+':files']).split('\0').filter(Boolean),names=new Set();let total=0;const recovered=[];
    for(const file of manifest.files){name(file.path);if(names.has(file.path.toLowerCase())||!oid(file.blob)||!Number.isSafeInteger(file.size)||file.size<0||file.size>1048576)throw new Error('checkpoint entry invalid');names.add(file.path.toLowerCase());
      if(!treeEntries.includes('100644 blob '+file.blob+'\t'+file.path))throw new Error('checkpoint tree mismatch');
      const bytes=native(['cat-file','blob',file.blob],{binary:true});total+=bytes.length;if(bytes.length!==file.size||sha(bytes)!==file.sha256||total>8388608)throw new Error('checkpoint blob mismatch');recovered.push({...file,bytes});}
    if(treeEntries.length!==recovered.length)throw new Error('checkpoint unlisted tree entry');
    const summary=Object.freeze({ref,commit:expectedCommit,sequence,files:Object.freeze(recovered.map(({bytes,...file})=>Object.freeze(file)))});loaded.set(summary,{manifest,files:recovered});return summary;
  }
  function prepare(summary,relative){const checkpoint=loaded.get(summary);if(!checkpoint)throw new Error('checkpoint not loaded here');const saved=checkpoint.files.find(file=>file.path===name(relative));if(!saved)throw new Error('checkpoint file unavailable');
    const selected=target(relative),observedHash=selected.stat?sha(fs.readFileSync(selected.file)):null,plan=Object.freeze({path:relative,observedHash});plans.set(plan,{checkpoint,saved,observedHash});return plan;}
  function approve(plan){const selected=plans.get(plan);if(!selected)throw new Error('checkpoint plan not owned');plans.delete(plan);const token=Object.freeze({approved:true});approvals.set(token,selected);return token;}
  function restore(token,safetySequence){const selected=token&&typeof token==='object'?approvals.get(token):null;if(!selected)return {restored:false,reason:'unapproved'};approvals.delete(token);
    const {checkpoint,saved,observedHash}=selected;check();if(native(['rev-parse','HEAD'])!==checkpoint.manifest.head||indexTree()!==checkpoint.manifest.indexTree)return {restored:false,reason:'changed-head-or-index'};
    let current=target(saved.path);if((current.stat?sha(fs.readFileSync(current.file)):null)!==observedHash)return {restored:false,reason:'stale-target'};
    if(!Number.isSafeInteger(safetySequence)||safetySequence<=checkpoint.manifest.sequence)throw new Error('checkpoint safety sequence invalid');
    const safety=capture(checkpoint.manifest.session,safetySequence);current=target(saved.path);
    if(native(['rev-parse','HEAD'])!==checkpoint.manifest.head||indexTree()!==checkpoint.manifest.indexTree||(current.stat?sha(fs.readFileSync(current.file)):null)!==observedHash)throw new Error('checkpoint restore state changed');
    fs.writeFileSync(current.file,saved.bytes);if(sha(fs.readFileSync(current.file))!==saved.sha256)throw new Error('checkpoint restore outcome unverified');return {restored:true,path:saved.path,safety};
  }
  return {capture,load,prepare,approve,restore};
}
module.exports={createGitCheckpoints};

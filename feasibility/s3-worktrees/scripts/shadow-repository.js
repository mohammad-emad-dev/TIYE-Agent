'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {attributionEnvironment}=require('./attribution-git');
const {createGitCheckpoints}=require('./git-checkpoints');
const key=value=>path.resolve(value).toLowerCase();
function createShadowRepositories(){
 const owned=new WeakMap();
 function ordinaryDirectory(directory){if(!path.isAbsolute(directory)||fs.lstatSync(directory).isSymbolicLink()||!fs.lstatSync(directory).isDirectory()||key(fs.realpathSync(directory))!==key(directory))throw new Error('shadow directory unverified');return fs.realpathSync(directory);}
 function native(project,repository,args,input){const env=attributionEnvironment({memberId:'shadow-fixture',memberName:'Fixture Shadow Engine',sessionId:'shadow-fixture'});env.GIT_CONFIG_NOSYSTEM='1';env.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';
  const routing=repository?['--git-dir='+repository,...(args[0]==='init'?[]:['--work-tree='+project])]:[];
  const result=spawnSync('git',[...routing,'-c','commit.gpgsign=false',...args],{cwd:project,env,input,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:128000});
  if(result.error)throw new Error('shadow Git process failed');return result;
 }
 function run(entry,args,input){const result=native(entry.project,entry.repository,args,input);if(result.status!==0)throw new Error('shadow Git operation failed');return result.stdout.trim();}
 function validate(handle){const entry=owned.get(handle);if(!entry)throw new Error('shadow handle not owned');
  for(const directory of [entry.project,entry.state,entry.repository,entry.store])ordinaryDirectory(directory);
  if(fs.lstatSync(path.join(entry.project,'.git'),{throwIfNoEntry:false}))throw new Error('shadow project gained Git metadata');
  if(key(fs.realpathSync(run(entry,['rev-parse','--path-format=absolute','--git-common-dir'])))!==key(entry.repository)
    ||key(fs.realpathSync(run(entry,['rev-parse','--show-toplevel'])))!==key(entry.project)
    ||run(entry,['symbolic-ref','HEAD'])!=='refs/heads/codex/shadow-fixture'
    ||run(entry,['config','--local','core.worktree'])!==entry.project)throw new Error('shadow repository binding changed');
  return entry;
 }
 function create({projectDirectory,stateDirectory}){
  const project=ordinaryDirectory(projectDirectory),state=ordinaryDirectory(stateDirectory);
  if(key(project)===key(state)||key(state).startsWith(key(project)+path.sep)||key(project).startsWith(key(state)+path.sep)||fs.readdirSync(state).length)throw new Error('shadow state boundary invalid');
  if(fs.lstatSync(path.join(project,'.git'),{throwIfNoEntry:false}))throw new Error('shadow project already has Git metadata');
  const discovery=native(project,null,['rev-parse','--show-toplevel']);if(discovery.status!==128||!/not a git repository/i.test(discovery.stderr))throw new Error('shadow project Git discovery not clear');
  const entry={project,state,repository:path.join(state,'repository'),store:path.join(state,'indexes')},template=path.join(state,'empty-template');fs.mkdirSync(template);fs.mkdirSync(entry.store);
  run(entry,['init','--bare','--quiet','--object-format=sha1','--template='+template,entry.repository]);
  run(entry,['config','core.bare','false']);run(entry,['config','core.worktree',project]);run(entry,['config','core.autocrlf','false']);run(entry,['config','core.hooksPath',template]);
  const tree=run(entry,['mktree'],''),commit=run(entry,['commit-tree',tree],'Empty shadow fixture baseline\n');
  run(entry,['symbolic-ref','HEAD','refs/heads/codex/shadow-fixture']);run(entry,['update-ref','refs/heads/codex/shadow-fixture',commit,'0'.repeat(40)]);run(entry,['read-tree','--empty']);
  const handle=Object.freeze({projectDirectory:project,repositoryDirectory:entry.repository,storeDirectory:entry.store});owned.set(handle,entry);validate(handle);return handle;
 }
 function open(handle){const entry=validate(handle);return createGitCheckpoints({member:entry.project,repositoryDirectory:entry.repository,storeDirectory:entry.store,validate:()=>validate(handle)});}
 return {create,validate,open};
}
module.exports={createShadowRepositories};

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createShadowRepositories}=require('../scripts/shadow-repository');
const {git}=require('../scripts/worktree-lifecycle');
const {treeFiles,removeTemp}=require('../scripts/run-basics');
const {shadowPassed}=require('../scripts/run-shadow-checkpoints');
test('shadow setup refuses existing Git, occupied state, forged handles and changed project metadata',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-shadow-test-')),project=path.join(base,'project'),state=path.join(base,'state'),occupied=path.join(base,'occupied'),gitProject=path.join(base,'git-project');
 for(const directory of [project,state,occupied,gitProject])fs.mkdirSync(directory);fs.writeFileSync(path.join(project,'canary.txt'),'project bytes\n');fs.writeFileSync(path.join(occupied,'foreign.txt'),'foreign bytes\n');
 git(gitProject,['init','--quiet','--object-format=sha1']);const manager=createShadowRepositories(),foreign=createShadowRepositories(),before=treeFiles(project);
 try{
  assert.throws(()=>manager.create({projectDirectory:gitProject,stateDirectory:state}));assert.equal(fs.readdirSync(state).length,0);
  assert.throws(()=>manager.create({projectDirectory:project,stateDirectory:occupied}));assert.equal(fs.readFileSync(path.join(occupied,'foreign.txt'),'utf8'),'foreign bytes\n');
  assert.throws(()=>manager.create({projectDirectory:project,stateDirectory:project}));const handle=manager.create({projectDirectory:project,stateDirectory:state});
  assert.deepEqual(treeFiles(project),before);assert.equal(fs.existsSync(path.join(project,'.git')),false);assert.throws(()=>manager.open({...handle}));assert.throws(()=>foreign.open(handle));
  const checkpoints=manager.open(handle),saved=checkpoints.capture('shadow-test',1);assert.throws(()=>checkpoints.load('shadow-test',1,'0'.repeat(40)));
  assert.equal(manager.open(handle).load('shadow-test',1,saved.commit).files.length,1);
  fs.writeFileSync(path.join(project,'.git'),'fixture substituted metadata\n');assert.throws(()=>manager.open(handle));assert.throws(()=>checkpoints.capture('shadow-test',2));fs.unlinkSync(path.join(project,'.git'));
  const link=path.join(base,'state-link');fs.symlinkSync(occupied,link,'junction');try{assert.throws(()=>manager.create({projectDirectory:project,stateDirectory:link}));assert.equal(fs.readFileSync(path.join(occupied,'foreign.txt'),'utf8'),'foreign bytes\n');}finally{if(fs.realpathSync(link)!==fs.realpathSync(occupied))throw new Error('Test link changed');fs.unlinkSync(link);}
 }finally{treeFiles(base);removeTemp(base,'tiye-s3-shadow-test-');}
});
test('shadow evidence requires state preservation and both bounded timing observations',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/shadow-checkpoints-latest.json')));assert.equal(shadowPassed(record),true);
 for(const field of ['shadowCreationPreservedFiles','noProjectGitMetadata','shadowReopened','originalRootUnchanged','registryRootOnly','tempRemoved'])assert.equal(shadowPassed({...record,[field]:false}),false,field);
 for(const phase of ['gitCase','shadowCase']){assert.equal(shadowPassed({...record,[phase]:{...record[phase],indexBytesPreserved:false}}),false);assert.equal(shadowPassed({...record,[phase]:{...record[phase],captureMs:NaN}}),false);}
});

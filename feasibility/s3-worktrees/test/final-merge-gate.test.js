'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {git,createWorktreeLifecycle}=require('../scripts/worktree-lifecycle');
const {initialize,treeFiles,removeTemp}=require('../scripts/run-basics');
const {createFinalMergeGate}=require('../scripts/final-merge-gate');
const {finalMergePassed}=require('../scripts/run-final-merge');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('final approval refuses source/integration drift, dirty state, active Git, special index flags and divergence',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-final-test-')),root=path.join(base,'root'),slots=path.join(base,'slots'),store=path.join(base,'indexes');for(const directory of [root,slots,store])fs.mkdirSync(directory);
 initialize(root,slots);const settings=path.join(root,'local-settings.json');assert.equal(fs.readFileSync(settings,'utf8'),'{"mode":"fixture"}\n');fs.unlinkSync(settings);
 const lifecycle=createWorktreeLifecycle({repository:root,base:slots}),integration=lifecycle.create({name:'integration',branch:'codex/test-final'}),identity={memberId:'engine',memberName:'Fixture Engine',sessionId:'final-test'};
 function validateSource(){assert.equal(fs.realpathSync(root),path.resolve(root));assert.equal(git(root,['symbolic-ref','HEAD']).output,'refs/heads/main');}
 const gate=createFinalMergeGate({source:root,integration,lifecycle,validateSource,identity,storeDirectory:store,hooksDirectory:path.join(slots,'no-hooks')});
 const state=()=>({head:git(root,['rev-parse','HEAD']).output,status:git(root,['--no-optional-locks','status','--porcelain','--untracked-files=all','--ignored']).output,index:hash(fs.readFileSync(path.join(root,'.git/index'))),files:treeFiles(root),integrationHead:git(integration,['rev-parse','HEAD']).output,integrationFiles:treeFiles(integration),integrationIndex:hash(fs.readFileSync(git(integration,['rev-parse','--path-format=absolute','--git-path','index']).output)),refs:git(root,['for-each-ref','--format=%(refname)','refs/tiye/']).output});
 const selection=()=>({expectedSourceHead:git(root,['rev-parse','HEAD']).output,expectedIntegrationHead:git(integration,['rev-parse','HEAD']).output});
 try{
  git(integration,['commit','--quiet','--allow-empty','-m','Fixture integration result']);const initial=gate.prepare(selection());assert.equal(initial.eligible,true);assert.throws(()=>gate.approve({...initial}));
  assert.equal(gate.merge({approved:true},{session:'final-test',sequence:1}).reason,'unapproved');
  const wrongSession=gate.approve(gate.prepare(selection())),beforeSession=state();assert.throws(()=>gate.merge(wrongSession,{session:'foreign-session',sequence:1}));assert.deepEqual(state(),beforeSession);assert.equal(gate.merge(wrongSession,{session:'final-test',sequence:1}).reason,'unapproved');
  const staleIntegration=gate.approve(initial);git(integration,['commit','--quiet','--allow-empty','-m','Newer fixture integration']);const beforeStale=state();assert.equal(gate.merge(staleIntegration,{session:'final-test',sequence:1}).reason,'stale-integration-head');assert.deepEqual(state(),beforeStale);
  const file=path.join(root,'member-b.txt'),marker=path.join(root,'marker.txt'),ignored=path.join(root,'node_modules'),mergeHead=path.join(root,'.git/MERGE_HEAD');
  const variants=[
   {name:'unstaged',change:()=>fs.writeFileSync(file,'fixture unstaged\n'),undo:()=>fs.writeFileSync(file,'original b\n'),reason:'dirty-worktree'},
   {name:'staged',change:()=>{fs.writeFileSync(file,'fixture staged\n');git(root,['add','--','member-b.txt']);},undo:()=>{git(root,['restore','--source=HEAD','--staged','--worktree','--','member-b.txt']);},reason:'dirty-worktree'},
   {name:'untracked',change:()=>fs.writeFileSync(marker,'fixture untracked\n'),undo:()=>fs.unlinkSync(marker),reason:'dirty-worktree'},
   {name:'ignored',change:()=>{fs.mkdirSync(ignored);fs.writeFileSync(path.join(ignored,'canary.txt'),'fixture ignored\n');},undo:()=>{fs.unlinkSync(path.join(ignored,'canary.txt'));fs.rmdirSync(ignored);},reason:'dirty-worktree'},
   {name:'active',change:()=>fs.writeFileSync(mergeHead,selection().expectedSourceHead+'\n',{flag:'wx'}),undo:()=>fs.unlinkSync(mergeHead),reason:'active-operation'},
   {name:'bisect',change:()=>fs.writeFileSync(path.join(root,'.git/BISECT_LOG'),'fixture active bisect\n',{flag:'wx'}),undo:()=>fs.unlinkSync(path.join(root,'.git/BISECT_LOG')),reason:'active-operation'},
   {name:'hidden index flag',change:()=>git(root,['update-index','--assume-unchanged','--','member-b.txt']),undo:()=>git(root,['update-index','--no-assume-unchanged','--','member-b.txt']),reason:'unsupported-index-flags'},
   {name:'dirty integration',change:()=>fs.writeFileSync(path.join(integration,'member-b.txt'),'fixture dirty integration\n'),undo:()=>fs.writeFileSync(path.join(integration,'member-b.txt'),'original b\n'),reason:'dirty-worktree'},
  ];
  for(const variant of variants){const token=gate.approve(gate.prepare(selection()));variant.change();try{const before=state(),result=gate.merge(token,{session:'final-test',sequence:1});assert.equal(result.reason,variant.reason,variant.name);assert.equal(result.resultBranch,'refs/heads/codex/test-final');assert.deepEqual(state(),before,variant.name);assert.equal(gate.merge(token,{session:'final-test',sequence:1}).reason,'unapproved');}finally{variant.undo();}}
  const staleSource=gate.approve(gate.prepare(selection()));git(root,['commit','--quiet','--allow-empty','-m','Independent fixture source']);const beforeSource=state();assert.equal(gate.merge(staleSource,{session:'final-test',sequence:1}).reason,'stale-source-head');assert.deepEqual(state(),beforeSource);
  const diverged=gate.prepare(selection());assert.equal(diverged.eligible,false);assert.equal(diverged.reason,'diverged-source');assert.throws(()=>gate.approve(diverged));assert.deepEqual(state(),beforeSource);
 }finally{lifecycle.remove(integration);assert.equal(lifecycle.registry().length,1);treeFiles(base);removeTemp(base,'tiye-s3-final-test-');}
});
test('final merge qualification requires dirty-root preservation, safety and approved history transfer',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/final-merge-latest.json')));assert.equal(finalMergePassed(record),true);
 for(const field of ['memberAudited','dirtySourceRefused','dirtySourcePreserved','integrationBranchRetained','cleanFinalMerged','safetyCheckpointSaved','expectedSourceFiles','memberCommitPreserved','integrationCommitPreserved','approvalReplayBlocked','registryRootOnly','tempRemoved'])assert.equal(finalMergePassed({...record,[field]:false}),false,field);
 assert.equal(finalMergePassed({...record,worktreesRemoved:0}),false);assert.equal(finalMergePassed({...record,error:'unknown outcome'}),false);
});

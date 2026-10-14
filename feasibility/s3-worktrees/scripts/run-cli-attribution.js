'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createWorktreeLifecycle,git}=require('./worktree-lifecycle');
const {initialize,rootState,removeTemp}=require('./run-basics');
const {attributionEnvironment,attributionGit,readCommit,commitMatches}=require('./attribution-git');
const {exactCliTool,cliAttributionPassed}=require('./cli-attribution-evidence');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const command='rtk proxy node attribution-task.cjs';

function relay(args,env) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:'ignore'});
    child.once('error',()=>reject(new Error('CLI relay launch failed')));
    child.once('close',code=>resolve(code));
  });
}

async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-cli-attribution-root-'));
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-cli-attribution-worktrees-'));
  const record={recordedAt:new Date().toISOString(),scope:'OpenCode Muse xhigh native shell/Git identity propagation and parent fallback commit in one disposable worktree; no CLI-created commit or automatic trailer qualification',
    platform:process.platform,node:process.version,git:git(root,['--version']).output,
    model:'opencode/muse-spark-1.3-contributor-free',variant:'xhigh',
    sourceHashes:Object.fromEntries(['run-cli-attribution.js','cli-attribution-evidence.js','attribution-git.js','run-basics.js','worktree-lifecycle.js','../fixtures/attribution-task.cjs'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),
    cliCreatedCommitQualified:false,automaticCliTrailersQualified:false,identityEnforced:false,fullS3Qualified:false,productionEligible:false,worktreesRemoved:0};
  let lifecycle,original,member;
  try {
    initialize(root,base);
    fs.copyFileSync(path.resolve(__dirname,'../fixtures/attribution-task.cjs'),path.join(root,'attribution-task.cjs'));
    git(root,['add','--','attribution-task.cjs']);git(root,['commit','--quiet','-m','Native CLI attribution worker']);
    original=rootState(root);lifecycle=createWorktreeLifecycle({repository:root,base});
    member=lifecycle.create({name:'member-a',branch:'codex/s3-cli-attribution-a'});record.worktreesCreated=lifecycle.owned().length;
    const identity={memberId:'member-a',memberName:'CLI Fixture Member A',sessionId:crypto.randomUUID()};record.identity=identity;
    const task={...identity,taskId:crypto.randomUUID(),worktree:fs.realpathSync(member),commonGit:fs.realpathSync(path.join(root,'.git')),content:'native CLI fixture '+crypto.randomUUID()+'\n'};
    const taskBytes=Buffer.from(JSON.stringify(task)+'\n');fs.writeFileSync(path.join(member,'attribution-task.json'),taskBytes,{flag:'wx'});
    const beforeHead=git(member,['rev-parse','HEAD']).output;
    // Keep native artifacts after fixture cleanup so failures remain auditable.
    const out=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-cli-attribution-relay-'));
    record.artifactDirectory=out;
    const brief=path.join(base,'native-cli-brief.txt');
    const installedRelay=path.join(os.homedir(),'.codex/skills/opencode-delegate/scripts/relay.mjs');
    const relaySource=fs.readFileSync(installedRelay,'utf8');
    const needle='const argv = ["run", "--format", "json"];';
    if(relaySource.split(needle).length!==2)throw new Error('private relay adaptation unverified');
    const privateSource=relaySource.replace(needle,'const argv = ["run", "--standalone", "--format", "json"];');
    const privateRelay=path.join(out,'private-relay.mjs');fs.writeFileSync(privateRelay,privateSource,{flag:'wx'});
    record.installedRelaySha256=hash(Buffer.from(relaySource));record.privateRelaySha256=hash(Buffer.from(privateSource));
    record.launchMode='standalone private server';
    fs.writeFileSync(brief,'This is an authorized disposable fixture task. In your current worktree run exactly this one shell command: '+command+'. Use the shell tool once, with no other tools. Do not read or edit files yourself, do not commit or push, do not inspect configuration/authentication, do not access other paths, do not spawn agents or clean up. The fixed script checks native Git identity and writes only member-a.txt and attribution-observation.json. Do not change attribution environment, script or task configuration. Stop after the command and report its success or failure.');
    record.relayExit=await relay([privateRelay,'--brief',brief,'--cd',member,'--model',record.model,'--variant',record.variant,'--timeout','4m','--out-dir',out],attributionEnvironment(identity));
    lifecycle.validate(member);
    const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
    record.cliStatus=result.status;record.cliVersion=result.opencodeVersion;record.cliSessionId=result.sessionId;
    record.cliCompleted=record.relayExit===0&&result.status==='completed';
    const events=fs.readFileSync(path.join(out,'events.jsonl'),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
    record.eventTypes=[...new Set(events.map(event=>event.type))];
    const observation=JSON.parse(fs.readFileSync(path.join(member,'attribution-observation.json')));
    const expected={taskId:task.taskId,directoryMatched:true,authorMatched:true,committerMatched:true,workerSha256:record.sourceHashes['../fixtures/attribution-task.cjs']};
    record.observation=observation;record.observationMatched=JSON.stringify(observation)===JSON.stringify(expected);
    record.exactToolMatched=exactCliTool(events,command,expected,result.sessionId);
    record.nativeTool=record.exactToolMatched?events.filter(event=>event.type==='tool_use').map(event=>event.part).map(part=>({sessionID:part.sessionID,type:part.type,tool:part.tool,
      state:{status:part.state?.status,input:part.state?.input,output:part.state?.output,
        metadata:{metadata:{exit:part.state?.metadata?.metadata?.exit,truncated:part.state?.metadata?.metadata?.truncated}}}})):[];
    record.workerUnchanged=hash(fs.readFileSync(path.join(member,'attribution-task.cjs')))===expected.workerSha256;
    record.taskUnchanged=fs.readFileSync(path.join(member,'attribution-task.json')).equals(taskBytes);
    record.cliDidNotCommit=git(member,['rev-parse','HEAD']).output===beforeHead;
    record.onlyExpectedFilesChanged=JSON.stringify(git(member,['status','--porcelain','--untracked-files=all']).output.split(/\r?\n/).sort())
      ===JSON.stringify(['M member-a.txt','?? attribution-observation.json','?? attribution-task.json'].sort())
      && fs.readFileSync(path.join(member,'member-a.txt'),'utf8')===task.content;
    if(!record.cliCompleted||!record.exactToolMatched||!record.observationMatched||!record.workerUnchanged||!record.taskUnchanged||!record.onlyExpectedFilesChanged||!record.cliDidNotCommit)throw new Error('native CLI proof incomplete');
    attributionGit(member,['add','--','member-a.txt'],identity);
    attributionGit(member,['commit','--quiet','-m','Parent fallback for native CLI edit','--trailer','Tiye-Session: '+identity.sessionId],identity);
    record.fallbackCommit=readCommit(member,git(member,['rev-parse','HEAD']).output,identity);
    record.fallbackCommitMatched=commitMatches(record.fallbackCommit,identity)&&record.fallbackCommit.parents.length===1&&record.fallbackCommit.parents[0]===beforeHead;
    record.nativeShellGitIdentityQualified=true;
  }catch{record.error='native CLI attribution proof incomplete';}
  finally {
    try {
      if(lifecycle) {
        if(member) {
          lifecycle.validate(member);
          for(const name of ['attribution-task.json','attribution-observation.json']) {
            const target=path.join(member,name);if(!fs.existsSync(target))continue;
            if(fs.lstatSync(target).isSymbolicLink()||!fs.lstatSync(target).isFile()||path.dirname(fs.realpathSync(target)).toLowerCase()!==fs.realpathSync(member).toLowerCase())throw new Error('CLI artifact boundary invalid');
            fs.unlinkSync(target);
          }
        }
        for(const entry of lifecycle.owned().reverse()){lifecycle.remove(entry.directory);record.worktreesRemoved++;}
        const entries=lifecycle.registry();record.registryRootOnly=entries.length===1&&path.resolve(entries[0].directory).toLowerCase()===fs.realpathSync(root).toLowerCase();
      }
      if(!record.registryRootOnly)throw new Error('CLI registry cleanup unverified');
      record.originalRootUnchanged=original&&JSON.stringify(rootState(root))===JSON.stringify(original);
      record.baseTempRemoved=removeTemp(base,'tiye-s3-cli-attribution-worktrees-');record.rootTempRemoved=removeTemp(root,'tiye-s3-cli-attribution-root-');
    }catch{record.error='native CLI owned cleanup unverified';}
  }
  record.passed=cliAttributionPassed(record);record.result=record.passed?'CLI_ATTRIBUTION_PASS_S3_PARTIAL':'PARTIAL_OR_FAILED';
  fs.writeFileSync(path.resolve(__dirname,'../evidence/cli-attribution-latest.json'),JSON.stringify(record,null,2)+'\n');
  console.log('[s3-cli-attribution] '+record.result);process.exitCode=record.passed?0:2;
}
if(require.main===module)main().catch(()=>{console.error('native CLI lifecycle failure');process.exitCode=1;});
module.exports={main};

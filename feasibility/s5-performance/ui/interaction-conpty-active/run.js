'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{s1Require}=require('../toolchain');
const sources=['backend-modules.ps1','main.cjs','renderer.js','preload.cjs','index.html','producer.cjs','pty-worker.cjs','logical-lines.js','fixture.js','build.js','run.js','../renderer-recovery/epoch-ledger.js','../toolchain.js','../resources/sampler.js','../resources/sample-processes.ps1'];
const builds=['../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll','../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe','dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function run(){
  const destination=path.join(__dirname,'evidence.json'),publicRoot=path.resolve(__dirname,'../../../../output/s5-interaction-conpty-active');
  if(fs.existsSync(destination)||fs.existsSync(publicRoot))throw Error('Existing evidence preserved; no new launch');
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const buildHashes=Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'tiye-s5-interaction-conpty-active-'));
  fs.writeFileSync(path.join(root,'.owner'),crypto.randomUUID(),{flag:'wx'});
  const provenance={sourceHashes,buildHashes,recordedBeforeLaunch:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'prelaunch.json'),JSON.stringify(provenance),{flag:'wx'});
  const env={...process.env,TIYE_INTERACTION_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const outcome=await new Promise((resolve,reject)=>{
    const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs')],{cwd:__dirname,env,windowsHide:false,stdio:['ignore','pipe','pipe']});
    let timedOut=false;const stdout=fs.openSync(path.join(root,'host-stdout.log'),'wx'),stderr=fs.openSync(path.join(root,'host-stderr.log'),'wx');
    child.stdout.on('data',bytes=>fs.writeSync(stdout,bytes));child.stderr.on('data',bytes=>fs.writeSync(stderr,bytes));
    const deadline=setTimeout(()=>{timedOut=true;child.kill();},60000);
    child.once('error',error=>{clearTimeout(deadline);fs.closeSync(stdout);fs.closeSync(stderr);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(deadline);fs.closeSync(stdout);fs.closeSync(stderr);resolve({code,signal,timedOut});});
  });
  const sourceUnchanged=Object.entries({...sourceHashes,...buildHashes}).every(([name,digest])=>hash(fs.readFileSync(path.join(__dirname,name)))===digest);
  fs.mkdirSync(publicRoot,{recursive:true});const artifacts={};
  // Copy only this launch's regular evidence files, excluding profile state and owner marker.
  for(const name of fs.readdirSync(root))if(/^(backend-\d\.json|prelaunch\.json|journal\.json|checkpoints\.jsonl|failure\.json|result\.json|member-\d\.log|expected-\d\.jsonl|control-\d\.jsonl|host-(stdout|stderr)\.log)$/.test(name)){
    const filename=path.join(root,name),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Unexpected evidence type');
    const bytes=fs.readFileSync(filename);fs.writeFileSync(path.join(publicRoot,name),bytes,{flag:'wx'});artifacts[name]=hash(bytes);
  }
  const evidence={schema:'tiye-s5-paused-launch-v1',recordedAt:new Date().toISOString(),platform:process.platform,outcome,...provenance,sourceUnchanged,artifacts,
    nativeCompleted:outcome.code===0&&!outcome.timedOut&&sourceUnchanged&&fs.existsSync(path.join(publicRoot,'result.json')),
    runtimeRetained:true,runtimeRoot:root,ownedCleanup:false,activeResizeQualified:outcome.code===0&&!outcome.timedOut&&sourceUnchanged&&fs.existsSync(path.join(publicRoot,'result.json')),fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(evidence));
  // A failed control is preserved for analysis, and still has a nonzero probe exit.
  if(!evidence.nativeCompleted)process.exitCode=1;
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={sources,builds};

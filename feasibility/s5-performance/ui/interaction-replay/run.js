'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{s1Require}=require('../toolchain');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=['main.cjs','renderer.js','preload.cjs','index.html','build.js','run.js','../interaction/logical-lines.js','../interaction/fixture.js','../interaction/failure-analysis.js','../toolchain.js'];
const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
async function run(){
  const output=path.resolve(__dirname,'../../../../output/s5-interaction-replay'),destination=path.join(__dirname,'evidence.json');
  if(fs.existsSync(output)||fs.existsSync(destination))throw Error('Existing replay evidence preserved');
  const capture=path.resolve(__dirname,'../../../../output/s5-interaction-paused-boundary');
  const inputFiles=['journal.json','checkpoints.jsonl'],inputHashes=Object.fromEntries(inputFiles.map(name=>[name,hash(fs.readFileSync(path.join(capture,name)))]));
  const checkpoints=fs.readFileSync(path.join(capture,'checkpoints.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse);
  const before=checkpoints.find(row=>row.index===1&&row.stage==='before-resize');
  const input={before,journal:JSON.parse(fs.readFileSync(path.join(capture,'journal.json'),'utf8'))};
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),buildHashes=Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'tiye-s5-replay-'));fs.writeFileSync(path.join(root,'.owner'),crypto.randomUUID(),{flag:'wx'});
  fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input),{flag:'wx'});
  const prelaunch={sourceHashes,buildHashes,inputHashes,recordedAt:new Date().toISOString()};fs.writeFileSync(path.join(root,'prelaunch.json'),JSON.stringify(prelaunch),{flag:'wx'});
  const env={...process.env,TIYE_REPLAY_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
  const outcome=await new Promise((resolve,reject)=>{
    const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs')],{cwd:__dirname,env,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let stderr='',timedOut=false;child.stderr.on('data',bytes=>{stderr+=bytes.toString();});
    const deadline=setTimeout(()=>{timedOut=true;child.kill();},45000);
    child.once('error',error=>{clearTimeout(deadline);reject(error);});child.once('close',(code,signal)=>{clearTimeout(deadline);resolve({code,signal,timedOut,stderr});});
  });
  const unchanged=Object.entries({...sourceHashes,...buildHashes}).every(([name,digest])=>hash(fs.readFileSync(path.join(__dirname,name)))===digest)&&inputFiles.every(name=>hash(fs.readFileSync(path.join(capture,name)))===inputHashes[name]);
  fs.mkdirSync(output,{recursive:true});const artifacts={};
  for(const name of ['result.json','failure.json','prelaunch.json'])if(fs.existsSync(path.join(root,name))){const bytes=fs.readFileSync(path.join(root,name));fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});artifacts[name]=hash(bytes);}
  const evidence={schema:'tiye-s5-resize-replay-v1',...prelaunch,outcome,unchanged,artifacts,runtimeRetained:true,ownedCleanup:false,providerRequests:0,nativePtyLaunched:false,
    activeResizeQualified:false,fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({outcome,unchanged,runtimeRetained:true,root}));
  if(outcome.code!==0||outcome.timedOut||!unchanged)process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=1;});

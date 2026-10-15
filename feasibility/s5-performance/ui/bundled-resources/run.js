'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawn}=require('node:child_process'),{s1Require}=require('../toolchain');
const sources=['worker.cjs','renderer.js','build.js','main.cjs','run.js','backend-modules.ps1','../resources/sampler.js','../resources/sample-processes.ps1','../resources/resource-metrics.js','../flood/metrics.js','../flood/producer.cjs','../flood/preload.cjs','../flood/index.html','../worker-channel.js','../protocol.js','../toolchain.js'];
const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css','../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll','../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function launch(root,view){return new Promise((resolve,reject)=>{
  const env={...process.env,TIYE_S5_FLOOD_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs'),...(view==='focus'?['--focus-view']:[])],{cwd:__dirname,env,windowsHide:false,stdio:['ignore','ignore','pipe']});
  let timedOut=false;const fd=fs.openSync(path.join(root,view+'-stderr.log'),'wx');child.stderr.on('data',bytes=>fs.writeSync(fd,bytes));
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},180000);child.once('error',error=>{clearTimeout(deadline);reject(error);});
  child.once('close',(code,signal)=>{clearTimeout(deadline);fs.closeSync(fd);resolve({view,code,signal,timedOut});});
});}
async function run(){
  const destination=path.join(__dirname,'evidence.json'),output=path.resolve(__dirname,'../../../../output/s5-bundled-resources');
  if(fs.existsSync(destination)||fs.existsSync(output))throw Error('Existing evidence/output preserved');
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),buildHashes=Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'tiye-s5-bundled-resources-'));fs.writeFileSync(path.join(root,'.owner'),crypto.randomUUID(),{flag:'wx'});
  const prelaunch={sourceHashes,buildHashes,recordedBeforeLaunch:new Date().toISOString()};fs.writeFileSync(path.join(root,'prelaunch.json'),JSON.stringify(prelaunch),{flag:'wx'});
  const outcomes=[];
  for(const view of ['grid','focus']){console.log(view+': 60 seconds output, then idle through 120 seconds');const outcome=await launch(root,view);outcomes.push(outcome);if(outcome.code!==0||outcome.timedOut)break;}
  const unchanged=Object.entries({...sourceHashes,...buildHashes}).every(([name,digest])=>hash(fs.readFileSync(path.join(__dirname,name)))===digest);
  fs.mkdirSync(output,{recursive:true});const artifacts={};
  for(const name of fs.readdirSync(root))if(/^(prelaunch\.json|(grid|focus)-(result\.json|stderr\.log|backend-\d\.json|\d\.log))$/.test(name)){
    const filename=path.join(root,name),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Unexpected evidence type');
    const original=fs.readFileSync(filename),compressed=/^((grid|focus)-\d\.log)$/.test(name),publicName=name+(compressed?'.gz':'');
    const bytes=compressed?zlib.gzipSync(original):original;fs.writeFileSync(path.join(output,publicName),bytes,{flag:'wx'});
    artifacts[publicName]={sha256:hash(bytes),decodedSha256:hash(original),decodedBytes:original.length,encoding:compressed?'gzip':'identity'};
  }
  const completed=outcomes.length===2&&outcomes.every(row=>row.code===0&&!row.timedOut)&&unchanged;
  const evidence={schema:'tiye-s5-bundled-resources-v1',...prelaunch,outcomes,unchanged,completed,artifacts,platform:process.platform,providerRequests:0,
    runtimeRetained:true,runtimeRoot:root,ownedCleanup:false,coreProcessPresent:false,fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({completed,unchanged,outcomes,root}));if(!completed)process.exitCode=1;
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={sources,builds};

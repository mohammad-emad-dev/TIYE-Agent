'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {s1Require}=require('../toolchain'),{profileFor}=require('./profiles');
const sources=['profiles.js','producer.cjs','worker.cjs','feed-worker.cjs','feed-client.js','main.cjs','preload.cjs','renderer.js','index.html','build.js','run.js','../toolchain.js','../protocol.js','../worker-channel.js','../mixed/sqlite-feed.js','../mixed/fixture.js','../mixed/protocol.js','../resources/sampler.js','../resources/sample-processes.ps1','../resources/resource-metrics.js','../flood/metrics.js'];
const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function launch(root,profile){return new Promise((resolve,reject)=>{
  const env={...process.env,TIYE_S5_HOUR_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs'),profile.name],{cwd:__dirname,env,windowsHide:false,stdio:['ignore','pipe','pipe']});
  let diagnostics='',timedOut=false;child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>{if(diagnostics.length<65536)diagnostics+=chunk.toString();});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},profile.mixedMs+profile.idleMs+120000);
  child.once('error',error=>{clearTimeout(deadline);reject(error);});child.once('close',code=>{clearTimeout(deadline);if(code!==0||timedOut)reject(Error('combined-host-failed '+code+' timeout='+timedOut+' '+diagnostics));else resolve(JSON.parse(fs.readFileSync(path.join(root,'result.json'))));});
});}
function cleanup(root,parent,marker){
  if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owner-drift');
  const allowed=['.owner','electron-state','feed.sqlite','feed.sqlite-wal','feed.sqlite-shm','result.json',...Array.from({length:5},(_,member)=>`member-${member}.log`)];
  if(fs.readdirSync(root).some(name=>!allowed.includes(name)))throw Error('unexpected-root-content');const entries=[];
  function inventory(directory){for(const name of fs.readdirSync(directory)){
    const filename=path.join(directory,name),stat=fs.lstatSync(filename);if(stat.isSymbolicLink()||!fs.realpathSync(filename).startsWith(root+path.sep)||(!stat.isDirectory()&&(!stat.isFile()||stat.nlink!==1)))throw Error('unsafe-cleanup-entry');
    if(stat.isDirectory())inventory(filename);entries.push({filename,directory:stat.isDirectory()});
  }}inventory(root);for(const entry of entries)if(entry.directory)fs.rmdirSync(entry.filename);else fs.unlinkSync(entry.filename);fs.rmdirSync(root);
}
async function run(){
  const profile=profileFor(process.argv[2]),destination=path.join(__dirname,'evidence-'+profile.name+'.json');if(fs.existsSync(destination))throw Error('Existing evidence preserved; no new launch');
  if(profile.name==='hour'&&!fs.existsSync(path.join(__dirname,'evidence-smoke.json')))throw Error('Combined smoke evidence required first');
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const buildHashes=Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-combined-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  console.log(JSON.stringify({started:profile.name,mixedSeconds:profile.mixedMs/1000,idleSeconds:profile.idleMs/1000}));
  let native;try{native=await launch(root,profile);}catch(error){console.error('Failed runtime retained: '+root);throw error;}
  for(const [name,digest]of Object.entries({...sourceHashes,...buildHashes}))if(hash(fs.readFileSync(path.join(__dirname,name)))!==digest)throw Error('Measured source/build changed during run; runtime retained: '+root);
  cleanup(root,parent,marker);const evidence={...native,sourceHashes,buildHashes,platform:process.platform,ownedCleanup:true};fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log('Combined '+profile.name+' evidence recorded');
}
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={sources,builds};

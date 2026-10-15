'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {s1Require}=require('../toolchain');
const sourceNames=['fixture.js','sqlite-feed.js','feed-worker.cjs','worker-client.js','protocol.js','main.cjs','preload.cjs','renderer.js','index.html','build.js','run.js','../toolchain.js'];
const buildNames=['dist/preload.cjs','dist/renderer.js','dist/index.html'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function launch(root){return new Promise((resolve,reject)=>{
  const env={...process.env,TIYE_S5_FEED_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs')],{env,cwd:__dirname,windowsHide:false,stdio:['ignore','pipe','pipe']});
  let diagnostics='',timedOut=false;child.stdout.resume();child.stderr.on('data',chunk=>{if(diagnostics.length<65536)diagnostics+=chunk.toString();});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},60000);
  child.once('error',error=>{clearTimeout(deadline);reject(error);});
  child.once('close',code=>{clearTimeout(deadline);if(code!==0||timedOut)reject(Error('feed-host-failed '+code+' timeout='+timedOut+' '+diagnostics));else resolve(JSON.parse(fs.readFileSync(path.join(root,'result.json'))));});
});}
function cleanup(root,parent,marker){
  if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owner-drift');
  if(fs.readdirSync(root).some(name=>!['.owner','electron-state','feed.sqlite','feed.sqlite-wal','feed.sqlite-shm','result.json'].includes(name)))throw Error('unexpected-root-content');
  const entries=[];
  function inventory(directory){for(const name of fs.readdirSync(directory)){
    const filename=path.join(directory,name),stat=fs.lstatSync(filename);
    if(stat.isSymbolicLink()||!fs.realpathSync(filename).startsWith(root+path.sep)||(!stat.isDirectory()&&(!stat.isFile()||stat.nlink!==1)))throw Error('unsafe-cleanup-entry');
    if(stat.isDirectory())inventory(filename);entries.push({filename,directory:stat.isDirectory()});
  }}
  inventory(root);for(const entry of entries)if(entry.directory)fs.rmdirSync(entry.filename);else fs.unlinkSync(entry.filename);fs.rmdirSync(root);
}
async function run(){
  const destination=path.join(__dirname,'evidence.json');if(fs.existsSync(destination))throw Error('Existing evidence preserved; no new launch');
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-feed-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  let native;try{native=await launch(root);}catch(error){console.error('Failed runtime retained: '+root);throw error;}
  cleanup(root,parent,marker);
  const evidence={...native,recordedAt:new Date().toISOString(),platform:process.platform,ownedCleanup:true,
    sourceHashes:Object.fromEntries(sourceNames.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),buildHashes:Object.fromEntries(buildNames.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]))};
  fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log('50,000-event SQLite/native viewport evidence recorded; combined hour workload unqualified');
}
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={sourceNames,buildNames};

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{s1Require}=require('../toolchain');
const sources=['backend-modules.ps1','main.cjs','renderer.js','preload.cjs','index.html','producer.cjs','pty-worker.cjs','../renderer-recovery/epoch-ledger.js','run.js','build.js','../toolchain.js','../hour/feed-client.js','../hour/feed-worker.cjs','../mixed/sqlite-feed.js','../mixed/fixture.js','../mixed/protocol.js','../resources/sampler.js','../resources/sample-processes.ps1'];
const builds=['../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll','../../../s1-terminal/node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe','dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
const publicFiles=['prelaunch.json',...Array.from({length:5},(_,member)=>`backend-${member}.json`),'journal.json',...Array.from({length:5},(_,member)=>`member-${member}.log`)];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function launch(root){return new Promise((resolve,reject)=>{
  const env={...process.env,TIYE_RENDERER_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs')],{cwd:__dirname,env,windowsHide:false,stdio:['ignore','pipe','pipe']});
  let diagnostics='',timedOut=false;child.stdout.on('data',bytes=>process.stdout.write(bytes));child.stderr.on('data',bytes=>{if(diagnostics.length<65536)diagnostics+=bytes.toString();});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},60000);child.once('error',error=>{clearTimeout(deadline);reject(error);});
  child.once('close',code=>{clearTimeout(deadline);if(code!==0||timedOut)reject(Error('renderer-host-failed '+code+' timeout='+timedOut+' '+diagnostics));else resolve(JSON.parse(fs.readFileSync(path.join(root,'result.json'))));});
});}
function cleanup(root,parent,marker){
  if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owner-drift');
  const allowed=['.owner','electron-state','feed.sqlite','feed.sqlite-wal','feed.sqlite-shm','result.json',...publicFiles],entries=[];
  if(fs.readdirSync(root).some(name=>!allowed.includes(name)))throw Error('unexpected-root-content');
  function inventory(directory){for(const name of fs.readdirSync(directory)){
    const filename=path.join(directory,name),stat=fs.lstatSync(filename);if(stat.isSymbolicLink()||!fs.realpathSync(filename).startsWith(root+path.sep)||(!stat.isDirectory()&&(!stat.isFile()||stat.nlink!==1)))throw Error('unsafe-cleanup-entry');
    if(stat.isDirectory())inventory(filename);entries.push({filename,directory:stat.isDirectory()});
  }}inventory(root);for(const entry of entries)if(entry.directory)fs.rmdirSync(entry.filename);else fs.unlinkSync(entry.filename);fs.rmdirSync(root);
}
async function run(){
  const destination=path.join(__dirname,'evidence-renderer.json'),publicRoot=path.resolve(__dirname,'../../../../output/s5-bundled-recovery');
  if(fs.existsSync(destination)||fs.existsSync(publicRoot))throw Error('Existing evidence/output preserved; no new launch');
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),buildHashes=Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-bundled-recovery-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  fs.writeFileSync(path.join(root,'prelaunch.json'),JSON.stringify({sourceHashes,buildHashes,recordedBeforeLaunch:new Date().toISOString()}),{flag:'wx'});
  let native;try{native=await launch(root);
    for(const [name,digest]of Object.entries({...sourceHashes,...buildHashes}))if(hash(fs.readFileSync(path.join(__dirname,name)))!==digest)throw Error('measured-source-drift');
    fs.mkdirSync(publicRoot,{recursive:true});for(const name of publicFiles)fs.writeFileSync(path.join(publicRoot,name),fs.readFileSync(path.join(root,name)),{flag:'wx'});
    cleanup(root,parent,marker);
  }catch(error){console.error('Failed runtime retained: '+root);throw error;}
  fs.writeFileSync(destination,JSON.stringify({...native,sourceHashes,buildHashes,platform:process.platform,ownedCleanup:true},null,2)+'\n',{flag:'wx'});console.log('Renderer recovery evidence recorded; owned cleanup complete');
}
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={sources,builds,publicFiles};

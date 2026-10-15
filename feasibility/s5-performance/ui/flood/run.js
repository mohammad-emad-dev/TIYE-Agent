'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {s1Require}=require('../toolchain');
function launch(root,view){return new Promise((resolve,reject)=>{
  const env={...process.env,TIYE_S5_FLOOD_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(s1Require('electron'),[path.join(__dirname,'main.cjs'),...(view==='focus'?['--focus-view']:[])],{cwd:__dirname,env,windowsHide:false,stdio:['ignore','pipe','pipe']});let diagnostics='',timedOut=false;
  child.stdout.resume();child.stderr.on('data',chunk=>{if(diagnostics.length<65536)diagnostics+=chunk.toString();});
  const deadline=setTimeout(()=>{timedOut=true;child.kill();},110000);child.once('error',error=>{clearTimeout(deadline);reject(error);});
  child.once('close',code=>{clearTimeout(deadline);if(code!==0||timedOut)reject(Error('Owned flood host failed code='+code+' deadline='+timedOut+': '+diagnostics));else resolve(JSON.parse(fs.readFileSync(path.join(root,view+'-result.json'))));});
});}
function cleanup(root,parent,marker){if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owner-drift');
  const allowed=['.owner',...['grid','focus'].flatMap(view=>[view+'-state',view+'-result.json',...Array.from({length:5},(_,member)=>`${view}-${member}.log`)])];
  if(fs.readdirSync(root).some(name=>!allowed.includes(name)))throw Error('unexpected-root-content');const paths=[];
  function inventory(directory){for(const name of fs.readdirSync(directory)){const entry=path.join(directory,name),stat=fs.lstatSync(entry);if(stat.isSymbolicLink()||!fs.realpathSync(entry).startsWith(root+path.sep)||(!stat.isDirectory()&&(!stat.isFile()||stat.nlink!==1)))throw Error('unsafe-cleanup-entry');if(stat.isDirectory())inventory(entry);paths.push([entry,stat.isDirectory()]);}}
  inventory(root);for(const [entry,directory]of paths)if(directory)fs.rmdirSync(entry);else fs.unlinkSync(entry);fs.rmdirSync(root);
}
async function run(){const record=path.join(__dirname,'evidence.json');if(fs.existsSync(record))throw Error('Existing evidence preserved; no new launch');
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-flood-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  let views;try{console.log('Visible grid flood: 60 seconds');const grid=await launch(root,'grid');console.log('Visible focus flood: 60 seconds');views=[grid,await launch(root,'focus')];}catch(error){console.error('Failed runtime retained: '+root);throw error;}
  cleanup(root,parent,marker);
  const sources=['metrics.js','producer.cjs','worker.cjs','preload.cjs','renderer.js','index.html','build.js','main.cjs','run.js','../worker-channel.js','../protocol.js','../toolchain.js'];
  const builds=['dist/renderer.js','dist/preload.cjs','dist/index.html','dist/xterm.css'];
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const evidence={schema:'tiye-s5-visible-flood-v1',recordedAt:new Date().toISOString(),platform:process.platform,views,ownedCleanup:true,providerRequests:0,
    sourceHashes:Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),buildHashes:Object.fromEntries(builds.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])),fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(record,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log('Visible flood observations recorded; S5 remains partial');}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

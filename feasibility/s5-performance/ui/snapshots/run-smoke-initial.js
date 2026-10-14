'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {s1Require}=require('./toolchain');
function launch(root,view) {
  return new Promise((resolve,reject)=>{
    const env={...process.env,TIYE_S5_RUN_ROOT:root,TIYE_S5_NODE_BINARY:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
    const args=[path.join(__dirname,'src/main.cjs'),...(view==='focus'?['--s5-focus']:[]),...(process.argv.includes('--visible')?['--visible']:[])];
    const child=spawn(s1Require('electron'),args,{cwd:__dirname,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk.toString();});child.stdout.resume();
    const timeout=setTimeout(()=>{child.kill();reject(Error('owned-electron-deadline'));},30000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('close',code=>{clearTimeout(timeout);if(code!==0)reject(Error('Electron exit '+code+': '+stderr));else resolve(JSON.parse(fs.readFileSync(path.join(root,view+'-result.json'))));});
  });
}
function cleanOwnedRoot(root,parent,marker) {
  if(path.dirname(fs.realpathSync(root))!==parent||fs.readFileSync(path.join(root,'.owner'),'utf8')!==marker)throw Error('owned-cleanup-refused');
  const allowed=['.owner',...['grid','focus'].flatMap(view=>[view+'-state',view+'-result.json',...Array.from({length:5},(_,member)=>`${view}-${member}.log`)])];
  if(fs.readdirSync(root).some(name=>!allowed.includes(name)))throw Error('unexpected-owned-root-file');
  const paths=[];
  function inventory(directory) {for(const name of fs.readdirSync(directory)){const entry=path.join(directory,name),stat=fs.lstatSync(entry);if(stat.isSymbolicLink()||!fs.realpathSync(entry).startsWith(root+path.sep))throw Error('owned-cleanup-link-refused');if(stat.isDirectory())inventory(entry);else if(!stat.isFile()||stat.nlink!==1)throw Error('owned-cleanup-file-refused');paths.push([entry,stat.isDirectory()]);}}
  inventory(root);for(const [entry,directory]of paths)if(directory)fs.rmdirSync(entry);else fs.unlinkSync(entry);fs.rmdirSync(root);
}
async function run() {
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-ui-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  let views;
  try {views=[await launch(root,'grid'),await launch(root,'focus')];} finally {cleanOwnedRoot(root,parent,marker);}
  const sources=['toolchain.js','build.js','protocol.js','fixture.js','run-smoke.js','src/main.cjs','src/preload.cjs','src/renderer.js','src/index.html','src/display-producer.cjs'];
  const evidence={schema:'tiye-s5-five-terminal-smoke-v1',recordedAt:new Date().toISOString(),platform:process.platform,views,ownedCleanup:true,
    sourceHashes:Object.fromEntries(sources.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')])),fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(path.join(__dirname,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log('Five-PTY grid/focus smoke captured and owned runtime cleaned');
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {s1Require}=require('../toolchain'),{eventAt,fixtureDigest}=require('../mixed/fixture'),{identities,requireIdentity,goneChecks,cleanup}=require('./owned-runtime');
const sources=['run.js','feed-worker.cjs','pty-worker.cjs','producer.cjs','owned-runtime.js','recovery-policy.js','../toolchain.js','../mixed/sqlite-feed.js','../mixed/fixture.js','../resources/sampler.js','../resources/sample-processes.ps1'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),children=[],registry=new Map(),capturedIdentities=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const deadline=performance.now()+15000;while(!predicate()){if(performance.now()>deadline)throw Error('deadline-'+label);await wait(20);}}
function ownedChild(binary,args,env){
  const child=spawn(binary,args,{windowsHide:true,env,stdio:['ignore','ignore','pipe','ipc']}),session={child,messages:[],closed:false,exitCode:null,signal:null,error:null,diagnostics:''};children.push(session);
  child.on('message',message=>{if(session.onMessage){try{session.onMessage(message);}catch(error){session.error=error;}}else session.messages.push(message);});
  child.stderr.on('data',bytes=>{if(session.diagnostics.length<4096)session.diagnostics+=bytes.toString();});
  child.once('error',error=>{session.error=error;});child.once('close',(code,signal)=>{session.exitCode=code;session.signal=signal;session.closed=true;});return session;
}
async function message(session,event){await until(()=>{if(session.error)throw session.error;return session.messages.some(packet=>packet.event===event)||session.closed;},event);
  const packet=session.messages.find(packet=>packet.event===event);if(!packet)throw Error('missing-'+event+' '+session.diagnostics);return packet;}
async function closed(session){await until(()=>{if(session.error)throw session.error;return session.closed;},'child-close');}
async function register(session,role){
  const pid=session.child.pid;if(registry.has(pid))throw Error('pid-reused-within-cohort');const captured=await identities(new Map([[pid,role]]));registry.set(pid,role);capturedIdentities.set(pid,captured.get(pid));
}
function prefixDigest(){const digest=crypto.createHash('sha256');for(let id=1;id<=10000;id++)digest.update(JSON.stringify(eventAt(id))+'\n');return digest.digest('hex');}
async function databaseFault(root,env){
  const writer=ownedChild(process.execPath,[path.join(__dirname,'feed-worker.cjs'),root],env);await message(writer,'ready');await register(writer,'writer');writer.child.send({action:'arm'});
  const armed=await message(writer,'armed');assert.equal(armed.writerVisible,11000);assert(armed.walArmedBytes>armed.walBeforeBytes);assert.equal(armed.journalMode,'wal');assert.equal(armed.synchronous,2);assert.equal(armed.cacheSize,10);
  await requireIdentity(writer.child.pid,'writer',capturedIdentities.get(writer.child.pid));if(writer.closed||!writer.child.kill('SIGKILL'))throw Error('writer-kill-failed');await closed(writer);
  const abnormal=Number.isInteger(writer.exitCode)&&writer.exitCode!==0||!!writer.signal;assert(abnormal);
  const reader=ownedChild(process.execPath,[path.join(__dirname,'feed-worker.cjs'),root],env);await message(reader,'ready');await register(reader,'recovery-reader');reader.child.send({action:'recover'});
  const recovered=await message(reader,'recovered');await closed(reader);assert.equal(reader.exitCode,0);
  return {committedBefore:armed.committedBefore,uncommittedCount:armed.uncommittedCount,writerVisible:armed.writerVisible,walBeforeBytes:armed.walBeforeBytes,walArmedBytes:armed.walArmedBytes,
    journalMode:armed.journalMode,synchronous:armed.synchronous,cacheSize:armed.cacheSize,
    prefixMatches:recovered.prefixMatches,finalMatches:recovered.finalMatches,finalTotal:recovered.finalTotal,
    killedWriter:{abnormal,exitCode:writer.exitCode,signal:writer.signal},recoveredPrefix:recovered.recoveredPrefix,expectedPrefixSha256:prefixDigest(),final:recovered.final,expectedFullSha256:fixtureDigest()};
}
function terminalSession(root,member,generation,env){
  const session=ownedChild(s1Require('electron'),[path.join(__dirname,'pty-worker.cjs'),root,process.execPath,String(member),String(generation)],{...env,ELECTRON_RUN_AS_NODE:'1'});
  session.filename=path.join(root,`member-${member}-${generation}.log`);session.fd=fs.openSync(session.filename,'wx');session.hash=crypto.createHash('sha256');session.text='';session.member=member;session.generation=generation;
  session.onMessage=packet=>{if(packet?.event==='chunk'){
    if(typeof packet.text!=='string'||Buffer.byteLength(packet.text)>65536||session.text.length+packet.text.length>100000)throw Error('invalid-terminal-chunk');
    const bytes=Buffer.from(packet.text);fs.writeSync(session.fd,bytes);session.hash.update(bytes);session.text+=packet.text;
  }else if(packet?.event==='producer-pid'||packet?.event==='terminal-exit')session.messages.push(packet);else throw Error('invalid-terminal-message');};return session;
}
function sequences(session){return [...session.text.matchAll(new RegExp(`REC member=${session.member} generation=${session.generation} seq=(\\d+)`,'g'))].map(match=>Number(match[1]));}
async function registerTerminals(sessions){
  const additional=new Map();for(const session of sessions){
    const packet=await message(session,'producer-pid');if(!Number.isInteger(packet.pid)||packet.pid<=0||registry.has(packet.pid)||additional.has(packet.pid)||registry.has(session.child.pid))throw Error('invalid-producer-pid');
    additional.set(session.child.pid,`worker-${session.member}-${session.generation}`);additional.set(packet.pid,`producer-${session.member}-${session.generation}`);
  }
  const captured=await identities(additional);for(const [pid,role]of additional){registry.set(pid,role);capturedIdentities.set(pid,captured.get(pid));}
}
function terminalEvidence(session,role){
  fs.closeSync(session.fd);session.fd=null;const bytes=fs.readFileSync(session.filename),observed=sequences(session);
  return {member:session.member,generation:session.generation,role,records:observed.length,expectedRecords:300,ordered:observed.every((sequence,index)=>sequence===index),
    ended:session.text.includes(`END member=${session.member} generation=${session.generation}`),exitCode:session.exitCode,signal:session.signal,bytes:bytes.length,
    captureSha256:session.hash.digest('hex'),storedSha256:hash(bytes)};
}
async function terminalFault(root,env){
  const initial=Array.from({length:5},(_,member)=>terminalSession(root,member,0,env));await registerTerminals(initial);
  await until(()=>initial.every(session=>{if(session.error)throw session.error;return sequences(session).length>=10;}),'initial-output');
  const beforeFaultRecords=initial.map(session=>sequences(session).length),victim=initial[0];await requireIdentity(victim.child.pid,'worker-0-0',capturedIdentities.get(victim.child.pid));
  if(victim.closed||!victim.child.kill('SIGKILL'))throw Error('victim-kill-failed');await closed(victim);
  const replacement=terminalSession(root,0,1,env);await registerTerminals([replacement]);await Promise.all([...initial.slice(1),replacement].map(closed));
  for(const session of [...initial.slice(1),replacement])assert.equal((await message(session,'terminal-exit')).exitCode,0);
  return {beforeFaultRecords,terminals:[terminalEvidence(victim,'victim'),...initial.slice(1).map(session=>terminalEvidence(session,'survivor')),terminalEvidence(replacement,'replacement')]};
}
async function waitForOwnedExit(){
  let checks;const deadline=performance.now()+15000;do{checks=await goneChecks(registry,capturedIdentities);if(checks.every(check=>check.status!=='not-confirmed-exited'))return checks;await wait(250);}while(performance.now()<deadline);throw Error('owned-process-still-present');
}
async function run(){
  const destination=path.join(__dirname,'evidence-recovery.json');if(fs.existsSync(destination))throw Error('Existing evidence preserved; no new launch');
  const publicRoot=path.resolve(__dirname,'../../../../output/s5-recovery');if(fs.existsSync(publicRoot))throw Error('Existing output logs preserved; no new launch');
  const sourceHashes=Object.fromEntries(sources.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'tiye-s5-recovery-')),marker=crypto.randomUUID();fs.writeFileSync(path.join(root,'.owner'),marker,{flag:'wx'});
  const env={SystemRoot:process.env.SystemRoot||'C:\\Windows'},start=performance.now();
  try{
    const database=await databaseFault(root,env);console.log('SQLite writer fault and independent reopen completed');const terminals=await terminalFault(root,env);const ownedProcessChecks=await waitForOwnedExit();
    const evidence={schema:'tiye-s5-recovery-v1',recordedAt:new Date().toISOString(),platform:process.platform,elapsedMs:performance.now()-start,database,...terminals,ownedProcessChecks,ownedProcessesGone:true,
      outputIntegrity:terminals.terminals.every(session=>session.captureSha256===session.storedSha256),ownedCleanup:true,providerRequests:0,fullS5Qualified:false,productionEligible:false,coreProcessPresent:false,sourceHashes,
      versions:{node:process.version,sqlite:process.versions.sqlite,electron:s1Require('electron/package.json').version,nodePty:s1Require('node-pty/package.json').version}};
    require('./recovery-policy').validateRecoveryEvidence(evidence);
    for(const [name,digest]of Object.entries(sourceHashes))assert.equal(hash(fs.readFileSync(path.join(__dirname,name))),digest,'measured-source-changed '+name);
    fs.mkdirSync(publicRoot,{recursive:true});for(const terminal of evidence.terminals){const name=`member-${terminal.member}-${terminal.generation}.log`;fs.writeFileSync(path.join(publicRoot,name),fs.readFileSync(path.join(root,name)),{flag:'wx'});}
    cleanup(root,parent,marker);fs.writeFileSync(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log('Recovery evidence recorded; owned cleanup complete');
  }catch(error){for(const session of children){if(!session.closed)session.child.kill();if(session.fd!=null){fs.closeSync(session.fd);session.fd=null;}}console.error('Failed runtime retained: '+root);throw error;}
}
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={sources};

'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {FeedClient}=require('../hour/feed-client'),{eventAt,fixtureDigest}=require('../mixed/fixture'),{sampleProcesses}=require('../resources/sampler'),{s1Require}=require('../toolchain'),{createLedger}=require('./epoch-ledger');
const root=process.env.TIYE_RENDERER_ROOT,nodeBinary=process.env.TIYE_S5_NODE_BINARY;
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!nodeBinary||!path.isAbsolute(nodeBinary))throw Error('owned-runtime-required');
app.setPath('userData',path.join(root,'electron-state'));app.disableHardwareAcceleration();
const ledger=createLedger(),members=[],pages=[],registry=new Map();let window,feed,epoch=0,delivery=false,readyEpoch=-1,completed=false,failed=false,expectedCrash=false,gone,staleCount=0,staleChallengeRejected=false,journalBytes=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const deadline=performance.now()+20000;while(!predicate()){if(failed)throw Error('host-failed');if(performance.now()>deadline)throw Error('deadline-'+label);await wait(20);}}
function dispatch(session,ordinal){ledger.dispatch(epoch,session.member,ordinal);window.webContents.send('recovery-chunk',{epoch,member:session.member,ordinal,text:session.journal[ordinal]});}
function capture(session,text){
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw Error('invalid-capture');const bytes=Buffer.from(text);journalBytes+=bytes.length;if(journalBytes>2097152)throw Error('journal-limit');
  fs.writeSync(session.fd,bytes);session.hash.update(bytes);session.chain=crypto.createHash('sha256').update(session.chain).update(bytes).digest();session.bytes+=bytes.length;session.text+=text;
  session.journal.push(text);if(delivery)dispatch(session,session.journal.length-1);
}
function launchMembers(){for(let member=0;member<5;member++){
  const child=spawn(process.execPath,[path.join(__dirname,'pty-worker.cjs'),root,nodeBinary,String(member),'0'],{cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  const session={member,child,fd:fs.openSync(path.join(root,`member-${member}.log`),'wx'),hash:crypto.createHash('sha256'),chain:Buffer.alloc(32),bytes:0,text:'',journal:[],closed:false,terminalExit:null};members.push(session);
  child.stderr.resume();child.once('error',fail);child.once('close',(code,signal)=>{session.closed=true;session.exitCode=code;session.signal=signal;if(code!==0)fail(Error('pty-worker-exit'));});
  child.on('message',packet=>{try{
    if(packet?.event==='producer-pid'){if(session.producerPid||!Number.isInteger(packet.pid)||packet.pid<=0)throw Error('invalid-producer-pid');session.producerPid=packet.pid;}
    else if(packet?.event==='chunk')capture(session,packet.text);
    else if(packet?.event==='terminal-exit')session.terminalExit=packet.exitCode;else throw Error('invalid-worker-message');
  }catch(error){fail(error);}});
}}
function records(session){return [...session.text.matchAll(new RegExp(`REC member=${session.member} generation=0 seq=(\\d+)`,'g'))].map(match=>Number(match[1]));}
function owned(event){if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('foreign-renderer');}
function registerIPC(){
  ipcMain.handle('recovery-bootstrap',event=>{owned(event);return epoch;});
  ipcMain.on('recovery-ready',(event,current)=>{try{owned(event);if(current!==epoch||readyEpoch===epoch)throw Error('invalid-ready');readyEpoch=epoch;delivery=true;for(const session of members)for(let ordinal=0;ordinal<session.journal.length;ordinal++)dispatch(session,ordinal);}catch(error){fail(error);}});
  ipcMain.on('recovery-ack',(event,packet)=>{try{owned(event);const before=ledger.snapshot(),accepted=ledger.acknowledge(packet?.epoch,packet?.member,packet?.ordinal);if(!accepted)staleCount++;
    if(packet?.challenge){assert.equal(epoch,1);assert.equal(accepted,false);assert.deepEqual(ledger.snapshot(),before);staleChallengeRejected=true;}
  }catch(error){fail(error);}});
  ipcMain.on('recovery-failure',(event,message)=>{try{owned(event);throw Error('renderer-error '+String(message).slice(0,500));}catch(error){fail(error);}});
}
async function page(query,offset,count){
  const response=await feed.request('page',{query,offset,limit:20});assert.equal(response.countAtQuery,count);
  const expected=query==='needle'?Array.from({length:Math.min(20,Math.floor(count/997))},(_,index)=>(index+1)*997):Array.from({length:Math.min(20,count-offset)},(_,index)=>offset+index+1);
  assert.deepEqual(response.rows.map(row=>row.id),expected);const observed=await window.webContents.executeJavaScript('window.__recoveryFeed('+JSON.stringify(response.rows)+')');
  assert.equal(observed.epoch,epoch);assert.deepEqual(observed.ids,expected);assert.deepEqual(observed.text,expected.map(id=>eventAt(id).text));assert.equal(observed.domRows,expected.length);
  pages.push({epoch,query,offset,count,ids:observed.ids,domRows:observed.domRows});
}
async function persistentSnapshot(rendererRole){
  registry.clear();registry.set(process.pid,'main');registry.set(feed.worker.pid,'feed');for(const session of members){registry.set(session.child.pid,'worker-'+session.member);registry.set(session.producerPid,'producer-'+session.member);}
  registry.set(window.webContents.getOSProcessId(),rendererRole);const rows=await sampleProcesses(registry);assert(rows.every(row=>row.status==='present'));return new Map(rows.map(row=>[registry.get(row.pid),row]));
}
async function run(){
  await until(()=>readyEpoch===0,'initial-ready');launchMembers();await until(()=>members.every(session=>session.producerPid&&records(session).length>=20),'initial-output');
  await feed.request('append',{target:10000});await page('needle',0,10000);const before=await persistentSnapshot('renderer-before');
  const initialRenderer=await window.webContents.executeJavaScript('window.__recoveryInspect()');assert.equal(initialRenderer.epoch,0);assert(initialRenderer.members.every(session=>session.records.length>=20));
  const crashCounts=members.map(session=>records(session).length),crashCuts=members.map(session=>session.journal.length),crashAt=performance.now();delivery=false;expectedCrash=true;window.webContents.forcefullyCrashRenderer();
  await until(()=>!!gone,'renderer-gone');const goneCounts=members.map(session=>records(session).length);
  await until(()=>members.every((session,index)=>records(session).length>=goneCounts[index]+5),'output-during-outage');await feed.request('append',{target:20000});
  const outageCounts=members.map(session=>records(session).length),replayCuts=members.map(session=>session.journal.length),outageMs=performance.now()-crashAt;epoch=1;ledger.begin(1);await window.loadFile(path.join(__dirname,'dist/index.html'));await until(()=>readyEpoch===1,'replacement-ready');
  await until(()=>ledger.snapshot().acked.every((count,index)=>count>=replayCuts[index]),'replayed-outage-cut');await page('needle',0,20000);const restoredMs=performance.now()-crashAt,after=await persistentSnapshot('renderer-after');
  const survivingRoles=[...before.keys()].filter(role=>role!=='renderer-before').map(role=>{const old=before.get(role),current=after.get(role);assert.equal(current.pid,old.pid);assert.equal(current.identity,old.identity);return {role,sameIdentity:true};});
  const old=before.get('renderer-before'),current=after.get('renderer-after');assert(old.pid!==current.pid||old.identity!==current.identity);
  const oldProbe=(await sampleProcesses(new Map([[old.pid,'renderer-before']])))[0];assert(oldProbe.status==='exited'||oldProbe.status==='present'&&oldProbe.identity!==old.identity);
  await feed.request('append',{target:50000});await page('',49980,50000);await page('needle',0,50000);
  await until(()=>members.every(session=>session.closed),'pty-exit');await until(()=>ledger.snapshot().acked.every((count,index)=>count===members[index].journal.length),'final-acks');
  const renderer=await window.webContents.executeJavaScript('window.__recoveryInspect()');assert.equal(renderer.epoch,1);const stored=[];
  for(const session of members){assert.equal(session.terminalExit,0);assert.equal(session.signal,null);assert.deepEqual(records(session),Array.from({length:600},(_,index)=>index));fs.closeSync(session.fd);session.fd=null;
    const bytes=fs.readFileSync(path.join(root,`member-${session.member}.log`)),observed=renderer.members[session.member],sha256=session.hash.digest('hex');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha256);
    assert.equal(observed.bytes,session.bytes);assert.equal(observed.chunks,session.journal.length);assert.equal(observed.chain,session.chain.toString('hex'));assert.deepEqual(observed.records,records(session));assert.equal(observed.ended,true);
    stored.push({member:session.member,bytes:session.bytes,chunks:session.journal.length,sha256,chain:observed.chain,records:600,workerExit:session.exitCode,terminalExit:session.terminalExit});
  }
  const feedIntegrity=await feed.request('verify');assert.equal(feedIntegrity.sha256,fixtureDigest());await feed.close();
  const closedRegistry=new Map([...after.entries()].filter(([role])=>role!=='main'&&role!=='renderer-after').map(([role,row])=>[row.pid,role]));
  const childExitChecks=(await sampleProcesses(closedRegistry)).map(row=>{const role=closedRegistry.get(row.pid),status=row.status==='exited'?'exited':row.status==='present'&&row.identity!==after.get(role).identity?'original-exited-pid-reused':'not-confirmed';assert.notEqual(status,'not-confirmed');return {role,status};});
  const evidence={schema:'tiye-s5-renderer-recovery-v1',recordedAt:new Date().toISOString(),gone,crashCounts,crashCuts,goneCounts,replayCuts,outageCounts,outageMs,restoredMs,survivingRoles,rendererChanged:true,oldRendererGone:true,initialRenderer,childExitChecks,
    staleCount,staleChallengeRejected,ledger:ledger.snapshot(),renderer,stored,pages,feedIntegrity,providerRequests:0,coreProcessPresent:false,fullS5Qualified:false,productionEligible:false,physicalPaintQualified:false,journalLimitBytes:2097152,journalBytes,
    versions:{electron:process.versions.electron,nodePty:s1Require('node-pty/package.json').version,xterm:s1Require('@xterm/xterm/package.json').version}};
  fs.writeFileSync(path.join(root,'journal.json'),JSON.stringify(members.map(session=>({member:session.member,chunks:session.journal}))),{flag:'wx'});
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(evidence),{flag:'wx'});completed=true;app.quit();
}
function fail(error){if(failed||completed)return;failed=true;console.error(error.message);members.forEach(session=>{if(!session.closed)session.child.kill();if(session.fd!=null){fs.closeSync(session.fd);session.fd=null;}});if(feed&&!feed.closed)feed.worker.kill();app.exit(1);}
app.whenReady().then(async()=>{
  feed=new FeedClient(nodeBinary,root);await feed.request('init');ledger.begin(0);
  window=new BrowserWindow({width:1500,height:950,show:true,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('render-process-gone',(_event,details)=>{if(!expectedCrash||gone){fail(Error('unexpected-renderer-exit'));return;}gone={reason:details.reason,exitCode:details.exitCode};if(details.reason!=='crashed')fail(Error('unexpected-crash-reason'));});
  registerIPC();await window.loadFile(path.join(__dirname,'dist/index.html'));run().catch(fail);
}).catch(fail);

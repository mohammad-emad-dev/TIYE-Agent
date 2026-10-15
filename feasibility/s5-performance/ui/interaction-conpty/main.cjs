'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {phases,recordAt}=require('./fixture'),{createLedger}=require('../renderer-recovery/epoch-ledger'),{sampleProcesses}=require('../resources/sampler');
const buildNumber=Number(require('node:os').release().split('.')[2]);assert(Number.isInteger(buildNumber)&&buildNumber>=21376);
const root=process.env.TIYE_INTERACTION_ROOT,nodeBinary=process.env.TIYE_S5_NODE_BINARY;
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!nodeBinary||!path.isAbsolute(nodeBinary))throw Error('owned-runtime-required');
app.setPath('userData',path.join(root,'electron-state'));app.disableHardwareAcceleration();
const members=[],observations=[],ledger=createLedger();ledger.begin(0);let window,ready=false,delivery=true,failed=false,completed=false,journalBytes=0,lastObservation=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const deadline=performance.now()+15000;while(!predicate()){if(failed)throw Error('host-failed');if(performance.now()>deadline)throw Error('deadline-'+label);await wait(20);}}
function jsonLines(filename){if(!fs.existsSync(filename))return [];return fs.readFileSync(filename,'utf8').split('\n').slice(0,-1).map(JSON.parse);}
function expected(session){return jsonLines(path.join(root,`expected-${session.member}.jsonl`));}
function control(session,kind,token){return jsonLines(path.join(root,`control-${session.member}.jsonl`)).filter(row=>row.kind===kind&&row.token===token).at(-1);}
function commandAll(text){members.forEach(session=>session.child.send({action:'input',text:text+'\n'}));}
function dispatch(session,ordinal){ledger.dispatch(0,session.member,ordinal);window.webContents.send('interaction-chunk',{member:session.member,ordinal,text:session.journal[ordinal]});}
function capture(session,text){
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw Error('invalid-chunk');const bytes=Buffer.from(text);journalBytes+=bytes.length;if(journalBytes>8388608)throw Error('journal-limit');
  fs.writeSync(session.fd,bytes);session.hash.update(bytes);session.chain=crypto.createHash('sha256').update(session.chain).update(bytes).digest();session.bytes+=bytes.length;session.text+=text;session.journal.push(text);if(delivery)dispatch(session,session.journal.length-1);
}
function launch(){for(let member=0;member<5;member++){
  const child=spawn(process.execPath,[path.join(__dirname,'pty-worker.cjs'),root,nodeBinary,String(member)],{cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  const session={member,child,fd:fs.openSync(path.join(root,`member-${member}.log`),'wx'),hash:crypto.createHash('sha256'),chain:Buffer.alloc(32),journal:[],text:'',bytes:0,closed:false,terminalExit:null};members.push(session);
  child.stderr.resume();child.once('error',fail);child.once('close',(code,signal)=>{session.closed=true;session.exitCode=code;session.signal=signal;if(code!==0)fail(Error('worker-exit'));});
  child.on('message',packet=>{try{
    if(packet?.event==='producer-pid'){if(session.producerPid||!Number.isInteger(packet.pid)||packet.pid<=0)throw Error('invalid-producer');session.producerPid=packet.pid;}
    else if(packet?.event==='chunk')capture(session,packet.text);else if(packet?.event==='terminal-exit')session.terminalExit=packet.exitCode;else throw Error('invalid-worker-message');
  }catch(error){fail(error);}});
}}
async function flush(){await until(()=>ledger.snapshot().acked.every((count,index)=>count===members[index].journal.length),'write-acks');}
async function hold(token){
  commandAll('HOLD '+token);await until(()=>members.every(session=>{const report=control(session,'hold',token);return report&&session.text.includes(`HOLD m=${session.member} token=${token} count=${report.count}`);}),'hold-barrier');await flush();
  return members.map(session=>control(session,'hold',token).count);
}
function assertContents(snapshots,counts){snapshots.forEach((snapshot,member)=>{assert.equal(snapshot.member,member);assert.deepEqual(snapshot.records,Array.from({length:counts[member]},(_,sequence)=>recordAt(member,sequence)));});}
async function snapshot(action){await flush();return window.webContents.executeJavaScript('window.__interactionSnapshot('+JSON.stringify(action)+')');}
async function convergedSizes(plan,index){
  const start=performance.now();while(true){
    const sizes=members.map(session=>control(session,'size',index));if(sizes.every(report=>report&&report.cols===plan.cols&&report.rows===plan.rows))return {sizes,convergenceMs:performance.now()-start};
    if(performance.now()-start>2000)throw Error('size-convergence-timeout');await wait(50);commandAll('SIZE '+index);
  }
}
async function phase(plan,index){
  const beforeCounts=await hold(100+index),before=await snapshot('inspect');
  lastObservation={stage:'before-resize',index,plan,heldCounts:beforeCounts,top:before};checkpoint();assertContents(before,beforeCounts);
  delivery=false;window.setBounds({width:plan.width,height:plan.height});await window.webContents.executeJavaScript('window.__interactionResize('+JSON.stringify(plan)+')');
  const local=await snapshot('inspect');lastObservation={stage:'after-xterm-before-native',index,plan,heldCounts:beforeCounts,top:local};checkpoint();assertContents(local,beforeCounts);
  members.forEach(session=>session.child.send({action:'resize',cols:plan.cols,rows:plan.rows,token:index}));delivery=true;
  for(const session of members)for(let ordinal=ledger.snapshot().sent[session.member];ordinal<session.journal.length;ordinal++)dispatch(session,ordinal);
  const {sizes,convergenceMs}=await convergedSizes(plan,index);
  const heldCounts=await hold(200+index),top=await snapshot('top');
  lastObservation={stage:'after-held-resize',index,plan,heldCounts,top,sizes,convergenceMs};checkpoint();
  assert.deepEqual(heldCounts,beforeCounts);assertContents(top,heldCounts);
  top.forEach(state=>{assert.equal(state.bufferType,'normal');assert.equal(state.cols,plan.cols);assert.equal(state.rows,plan.rows);assert.equal(state.viewportY,0);assert(state.baseY>7);});
  commandAll('GO');await until(()=>members.every((session,member)=>expected(session).length>=heldCounts[member]+10),'output-while-scrolled');
  const liveCounts=await hold(2*index+2),afterLive=await snapshot('inspect');lastObservation={...lastObservation,stage:'after-resume',liveCounts,afterLive};checkpoint();assertContents(afterLive,liveCounts);
  afterLive.forEach((state,member)=>{assert.equal(state.viewportY,0);assert.equal(state.topLine,top[member].topLine);assert(state.baseY>top[member].baseY);});
  const middle=await snapshot('middle');middle.forEach((state,member)=>{assert.equal(state.viewportY,7);assert.equal(state.topLine,afterLive[member].line7);});
  const bottom=await snapshot('bottom');bottom.forEach(state=>assert.equal(state.viewportY,state.baseY));
  observations.push({index,plan,bounds:window.getBounds(),beforeCounts,sizes,convergenceMs,beforeCountsAtResize:beforeCounts,heldCounts,liveCounts,top,afterLive,middle,bottom});
}
async function run(){
  await until(()=>ready,'renderer-ready');launch();await until(()=>members.every(session=>session.producerPid&&expected(session).length>=60),'initial-history');await hold(0);
  for(const [index,plan]of phases.entries())await phase(plan,index);
  commandAll('FINISH');await until(()=>members.every(session=>session.closed),'worker-close');await flush();const final=await snapshot('inspect'),stored=[];
  assertContents(final,members.map(session=>expected(session).length));
  for(const session of members){assert.equal(session.terminalExit,0);assert.equal(session.signal,null);assert(session.text.includes(`END m=${session.member} count=${expected(session).length}`));fs.closeSync(session.fd);session.fd=null;
    const bytes=fs.readFileSync(path.join(root,`member-${session.member}.log`)),sha256=session.hash.digest('hex');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha256);
    const observed=final[session.member];assert.equal(observed.bytes,session.bytes);assert.equal(observed.chunks,session.journal.length);assert.equal(observed.chain,session.chain.toString('hex'));
    stored.push({member:session.member,bytes:session.bytes,chunks:session.journal.length,sha256,chain:observed.chain,records:expected(session).length,workerExit:session.exitCode,terminalExit:session.terminalExit});
  }
  const registry=new Map();for(const session of members){registry.set(session.child.pid,'worker-'+session.member);registry.set(session.producerPid,'producer-'+session.member);}
  const exitRows=await sampleProcesses(registry);assert(exitRows.every(row=>row.status==='exited'));const childExitChecks=exitRows.map(row=>({role:registry.get(row.pid),status:row.status}));
  fs.writeFileSync(path.join(root,'journal.json'),JSON.stringify(members.map(session=>({member:session.member,chunks:session.journal}))),{flag:'wx'});
  const evidence={schema:'tiye-s5-interaction-conpty-v1',windowsPty:{backend:'conpty',buildNumber},recordedAt:new Date().toISOString(),observations,final,stored,ledger:ledger.snapshot(),journalBytes,journalLimitBytes:8388608,childExitChecks,
    providerRequests:0,coreProcessPresent:false,fullS5Qualified:false,productionEligible:false,physicalWheelQualified:false,physicalPaintQualified:false};
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(evidence),{flag:'wx'});completed=true;app.quit();
}
function checkpoint(){fs.appendFileSync(path.join(root,'checkpoints.jsonl'),JSON.stringify(lastObservation)+'\n');}
function saveJournal(){fs.writeFileSync(path.join(root,'journal.json'),JSON.stringify(members.map(session=>({member:session.member,chunks:session.journal}))),{flag:'wx'});}
function fail(error){if(failed||completed)return;failed=true;saveJournal();fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({message:error.message,lastObservation,ledger:ledger.snapshot(),journalBytes,observations}),{flag:'wx'});console.error(error.message);members.forEach(session=>{if(!session.closed)session.child.kill();if(session.fd!=null){fs.closeSync(session.fd);session.fd=null;}});app.exit(1);}
app.whenReady().then(async()=>{
  window=new BrowserWindow({width:1500,height:950,show:true,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),additionalArguments:['--tiye-windows-build='+buildNumber],contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  const owned=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('foreign-renderer');};
  ipcMain.on('interaction-ready',event=>{try{owned(event);if(ready)throw Error('duplicate-ready');ready=true;}catch(error){fail(error);}});
  ipcMain.on('interaction-ack',(event,packet)=>{try{owned(event);ledger.acknowledge(0,packet?.member,packet?.ordinal);}catch(error){fail(error);}});
  ipcMain.on('interaction-failure',(event,message)=>{try{owned(event);throw Error('renderer-error '+message);}catch(error){fail(error);}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('render-process-gone',()=>fail(Error('renderer-exit')));
  await window.loadFile(path.join(__dirname,'dist/index.html'));run().catch(fail);
}).catch(fail);

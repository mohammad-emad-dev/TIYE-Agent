'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {finished}=require('node:stream/promises');
const {s1Require}=require('../toolchain'),{createWorkerDecoder}=require('../worker-channel'),{isMember}=require('../protocol');
const {evaluateTargets,distribution}=require('./metrics');
const root=process.env.TIYE_S5_FLOOD_ROOT,nodeBinary=process.env.TIYE_S5_NODE_BINARY,view=process.argv.includes('--focus-view')?'focus':'grid';
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!nodeBinary||!path.isAbsolute(nodeBinary))throw Error('owned-run-required');
app.setPath('userData',path.join(root,view+'-state'));app.disableHardwareAcceleration();
const members=[],hostLatencies=[],probeStarts=new Map();let window,started=false,launched=false,failed=false,start=0,timer,plannedInputs=0,focusSkipped=0,injected=0,inputRequests=0,visibleAtStart=false,hostVisibilityLost=false;
const control=(session,action)=>{if(session.workerExit===null&&!session.worker.stdin.destroyed)session.worker.stdin.write(JSON.stringify({action})+'\n');};
function flow(session){const shouldPause=session.fileBlocked||session.pendingBytes>262144;if(shouldPause&&!session.paused){session.paused=true;session.pauseCount++;control(session,'pause');}else if(session.paused&&!session.fileBlocked&&session.pendingBytes<131072){session.paused=false;control(session,'resume');}}
async function startFlood(){if(started||members.length!==5||!members.every(member=>member.ready))return;started=true;visibleAtStart=window.isVisible();
  await window.webContents.executeJavaScript('window.__floodStart()');start=performance.now();members.forEach(member=>control(member,'start'));
  timer=setInterval(()=>{if(performance.now()-start>=58000){clearInterval(timer);return;}if(!window.isVisible())hostVisibilityLost=true;plannedInputs++;if(!window.isFocused()){focusSkipped++;return;}
    probeStarts.set(++injected,performance.now());window.webContents.sendInputEvent({type:'keyDown',keyCode:'X'});window.webContents.sendInputEvent({type:'char',keyCode:'x'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'X'});
  },2000);
}
function launchMembers(){for(let member=0;member<5;member++){
  const file=fs.createWriteStream(path.join(root,`${view}-${member}.log`),{flags:'wx',highWaterMark:65536}),fileDone=finished(file);fileDone.catch(fail);
  const worker=spawn(process.execPath,[path.join(__dirname,'worker.cjs'),nodeBinary,root,String(member)],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const session={member,worker,file,fileDone,digest:crypto.createHash('sha256'),bytes:0,chunks:0,ackChunks:0,pendingBytes:0,pending:new Map(),fileBlocked:false,paused:false,pauseCount:0,decoder:createWorkerDecoder(),ready:false,readyTail:'',workerExit:null,terminalExit:null,producer:null};members.push(session);
  file.on('drain',()=>{session.fileBlocked=false;flow(session);});
  worker.stdout.on('data',chunk=>{try{for(const message of session.decoder.push(chunk)){
    if(message.event==='exit'){session.terminalExit=message.exitCode;session.producer=message.producer;file.end();}
    else {const bytes=Buffer.from(message.text);session.bytes+=bytes.length;session.digest.update(bytes);session.fileBlocked=!file.write(bytes)||session.fileBlocked;
      const ordinal=session.chunks++;session.pending.set(ordinal,bytes.length);session.pendingBytes+=bytes.length;
      window.webContents.send('flood-chunk',{member,ordinal,text:message.text});
      if(!session.ready){session.readyTail=(session.readyTail+message.text).slice(-1024);session.ready=session.readyTail.includes(`FLOOD_READY_${member}`);if(session.ready)startFlood().catch(fail);}flow(session);
    }
  }}catch(error){fail(error);}});
  worker.stderr.resume();worker.once('error',()=>fail(Error('worker-launch')));worker.once('close',code=>{session.workerExit=code;try{session.decoder.finish();if(code!==0||session.terminalExit!==0)throw Error('worker-exit');}catch(error){fail(error);}});
}}
function registerIPC(){
  const own=event=>event.sender===window.webContents;
  ipcMain.on('flood-ready',event=>{if(!own(event)||launched)return;launched=true;launchMembers();measure().catch(fail);});
  ipcMain.on('flood-ack',(event,packet)=>{if(!own(event)||!packet||!isMember(packet.member))return;const member=members[packet.member];if(packet.ordinal!==member.ackChunks||!member.pending.has(packet.ordinal)){fail(Error('invalid-render-ack'));return;}member.ackChunks++;member.pendingBytes-=member.pending.get(packet.ordinal);member.pending.delete(packet.ordinal);flow(member);});
  ipcMain.on('flood-input',event=>{if(own(event)&&started&&inputRequests<injected){inputRequests++;control(members[0],'probe');}});
  ipcMain.on('flood-rendered',(event,ordinal)=>{if(!own(event)||!Number.isInteger(ordinal)||!probeStarts.has(ordinal))return;hostLatencies.push(performance.now()-probeStarts.get(ordinal));probeStarts.delete(ordinal);});
}
async function measure(){const deadline=Date.now()+100000;let renderer;
  while(Date.now()<deadline){if(members.length===5&&members.every(member=>member.workerExit===0&&member.terminalExit===0&&member.pendingBytes===0)){await Promise.all(members.map(member=>member.fileDone));renderer=await window.webContents.executeJavaScript('window.__floodFinish()');if(renderer)break;}await new Promise(resolve=>setTimeout(resolve,100));}
  clearInterval(timer);if(!renderer)throw Error('flood-deadline');
  const stored=members.map((member,index)=>{const bytes=fs.readFileSync(path.join(root,`${view}-${member.member}.log`)),digest=member.digest.digest('hex'),observed=renderer.members[index];
    if(!member.producer||member.producer.elapsedMs<60000||member.producer.records<1||bytes.length!==member.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==digest||observed.member!==member.member||observed.bytes!==member.bytes||observed.sha256!==digest||observed.chunks!==member.chunks)throw Error('flood-integrity-mismatch');
    return {member:member.member,bytes:member.bytes,chunks:member.chunks,sha256:digest,producer:member.producer,pauseCount:member.pauseCount,workerExit:member.workerExit,terminalExit:member.terminalExit};
  });
  const observation={view,visible:window.isVisible(),visibleAtStart,hostVisibilityLost,plannedInputs,focusSkipped,injected,inputRequests,hostLatencies,renderer,stored,outputIntegrity:true,hardwareAcceleration:false,
    versions:{electron:process.versions.electron,nodePty:s1Require('node-pty/package.json').version,xterm:s1Require('@xterm/xterm/package.json').version},fullS5Qualified:false,productionEligible:false};
  observation.targets=evaluateTargets(observation);observation.hostDispatchToRenderAck=distribution(hostLatencies);
  observation.hostInputCoverageComplete=hostLatencies.length===injected&&injected===plannedInputs&&focusSkipped===0;
  observation.hostInputUnder100Ms=observation.hostInputCoverageComplete&&observation.hostDispatchToRenderAck?observation.hostDispatchToRenderAck.maxMs<100:null;
  fs.writeFileSync(path.join(root,view+'-result.json'),JSON.stringify(observation),{flag:'wx'});app.quit();
}
function fail(error){if(failed)return;failed=true;clearInterval(timer);console.error('Flood failed: '+error.message);members.forEach(member=>{if(member.workerExit===null)member.worker.kill();});app.exit(1);}
app.whenReady().then(async()=>{window=new BrowserWindow({width:1280,height:900,show:true,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,additionalArguments:view==='focus'?['--focus-view']:[]}});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());registerIPC();await window.loadFile(path.join(__dirname,'dist/index.html'));window.show();window.focus();}).catch(fail);

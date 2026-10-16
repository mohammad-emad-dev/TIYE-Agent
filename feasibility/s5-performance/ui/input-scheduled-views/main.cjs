'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{finished}=require('node:stream/promises');
const {s1Require}=require('../toolchain'),{createWorkerDecoder}=require('../worker-channel'),{isMember}=require('../protocol');
const {createTrace}=require('./trace-ledger');
const {startInputSchedule}=require('./input-schedule');
const {createViewGate}=require('./view-gate');
const trace=createTrace();let loopTimer,inputSchedule;
const viewGate=createViewGate({clock:()=>performance.now()-start,dispatch:sendInput,change:next=>window.webContents.executeJavaScript('window.__combinedView('+JSON.stringify(next)+')'),inputPending:()=>probeStarts.size>0,wait:()=>wait(5),setView:next=>{view=next;}});
const {FeedClient}=require('../hour/feed-client'),{eventAt,fixtureDigest,EVENT_COUNT}=require('../mixed/fixture'),{profileFor}=require('./profiles');
const {sampleProcesses,redactRows}=require('../resources/sampler'),{roleSeries}=require('../resources/resource-metrics'),{distribution}=require('../flood/metrics');
const root=process.env.TIYE_S5_HOUR_ROOT,nodeBinary=process.env.TIYE_S5_NODE_BINARY,profile=profileFor(process.argv[2]);
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!nodeBinary||!path.isAbsolute(nodeBinary))throw Error('owned-run-required');
app.setPath('userData',path.join(root,'electron-state'));app.disableHardwareAcceleration();
const members=[],resources=[],registry=new Map(),identities=new Map(),pendingReports=new Map(),searches=[],ingestion=[],views=[],input={grid:{planned:0,skipped:0,latencies:[]},focus:{planned:0,skipped:0,latencies:[]}},probeStarts=new Map();
let window,feed,feedInfo,started=false,failed=false,launched=false,start=0,view='grid',feedCount=0,stopSampling=false,sampling,token=0,injected=0,inputRequests=0,visibleAtStart=false,visibilityLost=false,auxiliaryOrdinal=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function control(member,action,probeOrdinal){
  if(member.workerExit!==null||member.worker.stdin.destroyed){if(probeOrdinal)throw Error('control-unavailable');return;}
  if(probeOrdinal)trace.controlStarted(probeOrdinal,performance.now()-start);
  member.worker.stdin.write(JSON.stringify({action,...(probeOrdinal?{probeOrdinal}:{})})+'\n',error=>{
    if(error){fail(error);return;}if(probeOrdinal)try{trace.controlFlushed(probeOrdinal,performance.now()-start);}catch(error){fail(error);}
  });
}
function flow(member){const paused=member.fileBlocked||member.pendingBytes>262144;
  if(paused&&!member.paused){member.paused=true;member.pauseCount++;control(member,'pause');}
  else if(member.paused&&!member.fileBlocked&&member.pendingBytes<131072){member.paused=false;control(member,'resume');}}
function launchMembers(){for(let member=0;member<5;member++){
  const file=fs.createWriteStream(path.join(root,`member-${member}.log`),{flags:'wx',highWaterMark:65536}),fileDone=finished(file);fileDone.catch(fail);
  const worker=spawn(process.execPath,[path.join(__dirname,'worker.cjs'),nodeBinary,root,String(member),profile.name],{cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});
  const session={member,worker,file,fileDone,hash:crypto.createHash('sha256'),chain:Buffer.alloc(32),bytes:0,chunks:0,ack:0,pending:new Map(),pendingBytes:0,fileBlocked:false,paused:false,pauseCount:0,decoder:createWorkerDecoder(),ready:false,tail:'',workerExit:null,terminalExit:null,producer:null};members.push(session);
  worker.on('message',message=>{if(message?.event==='probe-worker-timing'){try{if(member!==0)throw Error('foreign-worker-trace');trace.notice(message,performance.now()-start);}catch(error){fail(error);}return;}if(!message||message.event!=='producer-pid'||!Number.isInteger(message.pid)||message.pid<=0||session.producerPid){fail(Error('invalid-producer-pid'));return;}session.producerPid=message.pid;tryStart().catch(fail);});
  file.on('drain',()=>{session.fileBlocked=false;flow(session);});
  worker.stdout.on('data',chunk=>{try{for(const message of session.decoder.push(chunk)){
    if(message.event==='exit'){session.terminalExit=message.exitCode;session.producer=message.producer;file.end();}
    else{const bytes=Buffer.from(message.text);session.bytes+=bytes.length;session.hash.update(bytes);session.chain=crypto.createHash('sha256').update(session.chain).update(bytes).digest();
      session.fileBlocked=!file.write(bytes)||session.fileBlocked;const ordinal=session.chunks++;session.pending.set(ordinal,bytes.length);session.pendingBytes+=bytes.length;
      const probeOrdinals=member===0?trace.ingress(message.text,ordinal,performance.now()-start):[];
      window.webContents.send('combined-chunk',{member,ordinal,text:message.text,probeOrdinals});
      if(!session.ready){session.tail=(session.tail+message.text).slice(-1024);session.ready=session.tail.includes(`FLOOD_READY_${member}`);if(session.ready)tryStart().catch(fail);}flow(session);
    }
  }}catch(error){fail(error);}});
  worker.stderr.resume();worker.once('error',fail);worker.once('close',code=>{session.workerExit=code;try{session.decoder.finish();if(code!==0||session.terminalExit!==0)throw Error('worker-exit');}catch(error){fail(error);}});
}}
async function tryStart(){if(started||members.length!==5||!members.every(member=>member.ready&&member.producerPid))return;
  started=true;visibleAtStart=window.isVisible();await window.webContents.executeJavaScript('window.__combinedStart()');start=performance.now();let previousTick=0;loopTimer=setInterval(()=>{const now=performance.now()-start;trace.loop(previousTick,now);previousTick=now;},20);views.push({elapsedMs:0,view});members.forEach(member=>control(member,'start'));inputSchedule=startInputSchedule({clock:()=>performance.now()-start,schedule:setTimeout,cancel:clearTimeout,dispatch:packet=>viewGate.input(packet),onError:fail,periodMs:profile.inputMs,stopBeforeMs:profile.mixedMs-2000});sampling=collectResources().catch(fail);runMixed().catch(fail);
}
async function collectResources(){while(!stopSampling){
  registry.set(process.pid,'main');registry.set(window.webContents.getOSProcessId(),'renderer');registry.set(feed.worker.pid,'feed');
  for(const member of members){registry.set(member.worker.pid,'worker-'+member.member);registry.set(member.producerPid,'producer-'+member.member);}
  for(const metric of app.getAppMetrics())if(!registry.has(metric.pid))registry.set(metric.pid,'electron-'+metric.type+'-'+(++auxiliaryOrdinal));
  const before=performance.now(),elapsedMs=before-start,rows=await trace.operation('resource-sample',()=>sampleProcesses(registry),()=>performance.now()-start),collectionMs=performance.now()-before;
  const phase=elapsedMs+collectionMs<profile.mixedMs?'mixed':elapsedMs>=profile.mixedMs+5000&&members.every(member=>member.workerExit===0)?'idle':'transition';
  resources.push({elapsedMs,collectionMs,phase,view,processes:redactRows(rows,registry,identities)});if(!stopSampling)await wait(10000);
}}
function sendInput({slot,dueMs,checkedMs,viewWaitStartMs=null,viewWaitEndMs=null}){input[view].planned++;const dispatchAt=performance.now(),dispatchMs=dispatchAt-start;
  assert(dispatchMs<Math.min(dueMs+profile.inputMs,profile.mixedMs-2000),'queued-input-slot-missed');
  if(!window.isFocused()){input[view].skipped++;trace.skipped(view,dueMs,checkedMs);return;}
  if(probeStarts.size)throw Error('overlapping-input-probe');
  const ordinal=++injected;trace.dispatched(ordinal,view,dueMs,dispatchMs);trace.schedule(ordinal,{slot,checkedMs,viewTransitioning:false,viewWaitStartMs,viewWaitEndMs});probeStarts.set(ordinal,{start:dispatchAt,view});
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'X'});window.webContents.sendInputEvent({type:'char',keyCode:'x'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'X'});
}
async function runMixed(){let nextAppend=0,nextSearch=0,nextView=profile.viewMs,nextProgress=60000,queryOrdinal=0;
  while(performance.now()-start<profile.mixedMs){
    const elapsed=performance.now()-start;if(!window.isVisible())visibilityLost=true;
    if(elapsed>=nextView){const next=view==='grid'?'focus':'grid';await trace.operation('view-change',()=>viewGate.switchTo(next),()=>performance.now()-start);views.push({elapsedMs:performance.now()-start,view});nextView+=profile.viewMs;}
    if(elapsed>=nextAppend){const target=Math.floor(Math.min(elapsed/profile.mixedMs,1)*EVENT_COUNT),response=await trace.operation('feed-append',()=>feed.request('append',{target}),()=>performance.now()-start);feedCount=response.count;ingestion.push({elapsedMs:performance.now()-start,count:feedCount,appendMs:response.appendMs});nextAppend=elapsed+1000;}
    if(elapsed>=nextSearch){const query=['needle','','absenttoken'][queryOrdinal++%3],offset=query?0:Math.max(0,feedCount-20);await trace.operation('render-search',()=>window.webContents.executeJavaScript('window.__combinedSearch('+JSON.stringify({query,offset,limit:20})+')'),()=>performance.now()-start);nextSearch=elapsed+5000;}
    if(elapsed>=nextProgress){console.log(JSON.stringify({progressMinutes:Math.floor(elapsed/60000),events:feedCount,searches:searches.length,view}));nextProgress+=60000;}
    await wait(50);
  }
  assert.equal(inputSchedule.snapshot().status,'completed');assert.equal(viewGate.snapshot().pendingInput,null);inputSchedule.stop();
  const final=await trace.operation('feed-append',()=>feed.request('append',{target:EVENT_COUNT}),()=>performance.now()-start);feedCount=final.count;ingestion.push({elapsedMs:performance.now()-start,count:feedCount,appendMs:final.appendMs});
  const feedIntegrity=await feed.request('verify');assert.equal(feedIntegrity.sha256,fixtureDigest());assert.equal(feedIntegrity.count,EVENT_COUNT);
  const deadline=performance.now()+profile.idleMs+60000;let renderer,nextIdleProgress=profile.mixedMs;
  while(performance.now()<deadline){if(performance.now()-start>=nextIdleProgress){console.log(JSON.stringify({idleElapsedSeconds:Math.floor((performance.now()-start-profile.mixedMs)/1000),events:feedCount,resourceSamples:resources.length,workersClosed:members.filter(member=>member.workerExit===0).length}));nextIdleProgress+=60000;}if(performance.now()-start>=profile.mixedMs+profile.idleMs&&members.every(member=>member.workerExit===0&&member.terminalExit===0&&member.pendingBytes===0)){
    await Promise.all(members.map(member=>member.fileDone));renderer=await window.webContents.executeJavaScript('window.__combinedFinish()');if(renderer)break;}await wait(100);}
  if(!renderer)throw Error('combined-deadline');stopSampling=true;await sampling;clearInterval(loopTimer);await feed.close();
  const stored=[];for(const member of members){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(path.join(root,`member-${member.member}.log`)))hash.update(chunk);
    const sha256=member.hash.digest('hex'),observed=renderer.members[member.member];assert.equal(hash.digest('hex'),sha256);assert.equal(fs.statSync(path.join(root,`member-${member.member}.log`)).size,member.bytes);
    assert.equal(observed.chain,member.chain.toString('hex'));assert.equal(observed.bytes,member.bytes);assert.equal(observed.chunks,member.chunks);assert(member.producer.elapsedMs>=profile.mixedMs);
    stored.push({member:member.member,bytes:member.bytes,chunks:member.chunks,sha256,chain:member.chain.toString('hex'),producer:member.producer,pauseCount:member.pauseCount,workerExit:member.workerExit,terminalExit:member.terminalExit});}
  const elapsedMs=performance.now()-start;
  const evidence={schema:'tiye-s5-input-scheduled-views-v1',profile,elapsedMs,recordedAt:new Date().toISOString(),feedInfo,feedIntegrity,ingestion,searches,views,input,injected,inputRequests,missingHostAcks:probeStarts.size,renderer,stored,resources,visibleAtStart,visibleAtEnd:window.isVisible(),visibilityLost,
    providerRequests:0,outputIntegrity:true,combinedPtyWorkload:true,hourMixedWorkloadQualified:profile.name==='hour'&&elapsedMs>=3600000,coreProcessPresent:false,memorySettlingQualified:false,fullS5Qualified:false,productionEligible:false,
    versions:{electron:process.versions.electron,nodePty:s1Require('node-pty/package.json').version,xterm:s1Require('@xterm/xterm/package.json').version}};
  evidence.viewGate=viewGate.snapshot();evidence.scheduler=inputSchedule.snapshot();evidence.trace=trace.snapshot();evidence.boundedMemorySettlingQualified=false;
  evidence.metrics={grid:{input:distribution(input.grid.latencies),frames:distribution(renderer.frames.grid)},focus:{input:distribution(input.focus.latencies),frames:distribution(renderer.frames.focus)},searchDb:distribution(searches.map(search=>search.queryMs)),searchRaf:distribution(searches.map(search=>search.requestToRafMs)),
    resourceRoles:[...new Set(resources.flatMap(sample=>sample.processes.map(process=>process.role)))].map(role=>({role,series:roleSeries(resources,role)}))};
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(evidence),{flag:'wx'});app.quit();
}
function registerIPC(){const own=event=>{if(event.sender!==window.webContents)throw Error('foreign-renderer');};
  ipcMain.on('combined-ready',event=>{try{own(event);if(launched)return;launched=true;launchMembers();}catch(error){fail(error);}});
  ipcMain.on('combined-ack',(event,packet)=>{try{own(event);if(!packet||!isMember(packet.member))throw Error('invalid-member');const member=members[packet.member];if(packet.ordinal!==member.ack||!member.pending.has(packet.ordinal))throw Error('ack-order');member.ack++;member.pendingBytes-=member.pending.get(packet.ordinal);member.pending.delete(packet.ordinal);flow(member);}catch(error){fail(error);}});
  ipcMain.on('combined-input',(event,packet)=>{try{own(event);if(inputRequests>=injected||packet?.ordinal!==inputRequests+1)throw Error('unplanned-input');inputRequests++;trace.input(packet,performance.now()-start);control(members[0],'probe',packet.ordinal);}catch(error){fail(error);}});
  ipcMain.on('combined-rendered',(event,packet)=>{try{own(event);const ordinal=packet?.ordinal,completedAt=performance.now();trace.rendered(packet,completedAt-start);const probe=probeStarts.get(ordinal);if(!probe)throw Error('uncorrelated-input');input[probe.view].latencies.push(completedAt-probe.start);probeStarts.delete(ordinal);}catch(error){fail(error);}});
  ipcMain.handle('combined-page',async(event,request)=>{own(event);if(pendingReports.size>=2||!request||!['needle','','absenttoken'].includes(request.query)||request.limit!==20||!Number.isInteger(request.offset)||request.offset<0||request.offset>EVENT_COUNT)throw Error('invalid-page');
    const response=await trace.operation('feed-page',()=>feed.request('page',request),()=>performance.now()-start),id=++token;pendingReports.set(id,{request,response});return {...response,token:id};});
  ipcMain.handle('combined-report',(event,report)=>{own(event);const expected=pendingReports.get(report?.token);if(!expected)throw Error('uncorrelated-report');const {request,response}=expected;
    const total=request.query==='needle'?Math.floor(response.countAtQuery/997):request.query===''?response.countAtQuery:0;
    const ids=Array.from({length:Math.min(20,Math.max(0,total-request.offset))},(_,index)=>(request.offset+index+1)*(request.query==='needle'?997:1));
    assert.equal(response.total,total);assert.deepEqual(response.rows.map(row=>row.id),ids);assert.deepEqual(report.ids,ids);assert.deepEqual(report.text,ids.map(id=>eventAt(id).text));assert.equal(report.domRows,ids.length);assert.equal(report.visible,true);
    assert(Number.isFinite(report.requestToRafMs)&&report.requestToRafMs>=0);searches.push({elapsedMs:performance.now()-start,view:report.view,query:request.query,count:response.countAtQuery,total,ids,domRows:report.domRows,documentVisible:report.documentVisible,queryMs:response.queryMs,requestToRafMs:report.requestToRafMs});pendingReports.delete(report.token);return true;});
}
function fail(error){if(failed)return;failed=true;stopSampling=true;clearInterval(loopTimer);inputSchedule?.stop();fs.writeFileSync(path.join(root,'trace-failure.json'),JSON.stringify({message:error.message,scheduler:inputSchedule?.snapshot()??null,viewGate:viewGate.snapshot(),trace:trace.snapshot()}),{flag:'wx'});console.error(error.message);members.forEach(member=>{if(member.workerExit===null)member.worker.kill();});if(feed&&!feed.closed)feed.worker.kill();app.exit(1);}
app.whenReady().then(async()=>{
  feed=new FeedClient(nodeBinary,root);feedInfo=await feed.request('init');assert.equal(feedInfo.count,0);assert.equal(feedInfo.journalMode,'wal');
  window=new BrowserWindow({width:1500,height:950,show:true,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());registerIPC();await window.loadFile(path.join(__dirname,'dist/index.html'));window.show();window.focus();
}).catch(fail);

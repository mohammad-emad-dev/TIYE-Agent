'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {s1Require}=require('../toolchain');
const {spawn}=require('node:child_process');
const {verifyMember}=require('../protocol');
const root=process.env.TIYE_S5_RUN_ROOT,view=process.argv.includes('--s5-focus')?'focus':'grid';
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))) throw Error('owned-run-root-required');
const nodeBinary=process.env.TIYE_S5_NODE_BINARY;
if(!nodeBinary||!path.isAbsolute(nodeBinary)||!fs.statSync(nodeBinary).isFile()) throw Error('node-runtime-required');
app.setPath('userData',path.join(root,view+'-state'));
app.disableHardwareAcceleration();
const members=[];let window,launched=false;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function launchMembers() {
  for(let member=0;member<5;member++) {
    const logPath=path.join(root,`${view}-${member}.log`);fs.writeFileSync(logPath,'',{flag:'wx'});
    const worker=spawn(process.execPath,[path.join(__dirname,'pty-worker.cjs'),nodeBinary,root,String(member)],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const session={member,worker,logPath,chunks:0,bytes:0,texts:[],exitCode:null,workerExitCode:null,buffer:''};members.push(session);
    worker.stdout.on('data',chunk=>{
      session.buffer+=chunk.toString('utf8');
      if(session.buffer.length>1048576){fail(Error('worker-frame-limit'));return;}
      let end;
      while((end=session.buffer.indexOf('\n'))>=0) {
        const line=session.buffer.slice(0,end);session.buffer=session.buffer.slice(end+1);
        try {
          const message=JSON.parse(line);
          if(message.event==='exit'&&Number.isInteger(message.exitCode)&&session.exitCode===null)session.exitCode=message.exitCode;
          else if(message.event==='chunk'&&typeof message.text==='string'&&session.exitCode===null) {
            const text=message.text,packet={member,ordinal:session.chunks++,text},bytes=Buffer.from(text);
            session.bytes+=bytes.length;session.texts.push(bytes);fs.appendFileSync(logPath,bytes);window.webContents.send('s5-chunk',packet);
          }else throw Error('invalid-worker-message');
        }catch(error){fail(error);return;}
      }
    });
    worker.stderr.resume();
    worker.once('error',()=>fail(Error('worker-launch-failed')));
    worker.once('close',code=>{session.workerExitCode=code;if(code!==0||session.exitCode!==0||session.buffer)fail(Error('worker-exit-failed'));});
  }
}
async function awaitIntegrity() {
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
    if(members.length===5&&members.every(member=>member.exitCode===0&&member.workerExitCode===0)) {
      await new Promise(resolve=>setTimeout(resolve,100));
      const renderer=await window.webContents.executeJavaScript('window.__s5Finish()');
      if(renderer) return renderer;
    }
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('terminal-render-deadline');
}
async function measure() {
  const renderer=await awaitIntegrity();
  const stored=members.map(session=>{
    const capture=Buffer.concat(session.texts),persisted=fs.readFileSync(session.logPath);
    if(hash(capture)!==hash(persisted)||capture.length!==persisted.length) throw Error('stored-pty-bytes-mismatch');
    const summary={member:session.member,chunks:session.chunks,bytes:session.bytes,sha256:hash(capture),exitCode:session.exitCode,workerExitCode:session.workerExitCode};
    verifyMember(summary,renderer.find(observation=>observation.member===session.member));return summary;
  });
  const result={view,hiddenWindow:!window.isVisible(),hardwareAcceleration:false,ptyMembers:5,isolatedPtyWorkers:5,stored,renderer,
    electron:process.versions.electron,nodePty:s1Require('node-pty/package.json').version,xterm:s1Require('@xterm/xterm/package.json').version,
    outputIntegrity:true,screenRecordIntegrity:true,providerRequests:0,keyboardLatencyMeasured:false,frameRateMeasured:false,fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(path.join(root,view+'-result.json'),JSON.stringify(result),{flag:'wx'});
  console.log('S5 '+view+' native PTY/render integrity passed');app.quit();
}
app.whenReady().then(async()=>{
  window=new BrowserWindow({width:1280,height:900,show:process.argv.includes('--visible'),webPreferences:{preload:path.resolve(__dirname,'../dist/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,additionalArguments:view==='focus'?['--s5-focus']:[]}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  ipcMain.on('s5-ready',event=>{if(event.sender!==window.webContents||launched)return;launched=true;launchMembers();measure().catch(fail);});
  await window.loadFile(path.resolve(__dirname,'../dist/index.html'));
}).catch(fail);
function fail(error) {console.error('S5 native smoke failed: '+error.message);for(const member of members)if(member.workerExitCode===null)member.worker.kill();app.exit(1);}

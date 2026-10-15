'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=process.env.TIYE_REPLAY_ROOT;
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('Owned runtime required');
app.setPath('userData',path.join(root,'electron-state'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const window=new BrowserWindow({width:1200,height:900,show:false,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  function owned(event){if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Foreign renderer');}
  ipcMain.handle('replay-input',event=>{owned(event);return JSON.parse(fs.readFileSync(path.join(root,'input.json'),'utf8'));});
  ipcMain.on('replay-complete',(event,packet)=>{owned(event);if(!Array.isArray(packet?.observations)||packet.observations.length!==15)throw Error('Invalid replay result');fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(packet),{flag:'wx'});app.quit();});
  ipcMain.on('replay-failure',(event,message)=>{owned(event);fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({message}),{flag:'wx'});app.exit(1);});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  await window.loadFile(path.join(__dirname,'dist/index.html'));
}).catch(error=>{console.error(error);app.exit(1);});

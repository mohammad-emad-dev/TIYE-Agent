'use strict';
const {contextBridge,ipcRenderer}=require('electron'),{isChunk}=require('../protocol');
contextBridge.exposeInMainWorld('combined',{
  ready:()=>ipcRenderer.send('combined-ready'),ack:(member,ordinal)=>ipcRenderer.send('combined-ack',{member,ordinal}),
  input:()=>ipcRenderer.send('combined-input'),rendered:ordinal=>ipcRenderer.send('combined-rendered',ordinal),
  page:request=>ipcRenderer.invoke('combined-page',request),report:report=>ipcRenderer.invoke('combined-report',report),
  onChunk:callback=>ipcRenderer.on('combined-chunk',(_event,packet)=>{if(isChunk(packet))callback(packet);})
});

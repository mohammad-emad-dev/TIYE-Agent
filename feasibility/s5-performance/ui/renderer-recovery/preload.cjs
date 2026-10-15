'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('recovery',{
  bootstrap:()=>ipcRenderer.invoke('recovery-bootstrap'),ready:epoch=>ipcRenderer.send('recovery-ready',epoch),
  ack:packet=>ipcRenderer.send('recovery-ack',packet),failure:message=>ipcRenderer.send('recovery-failure',String(message).slice(0,500)),
  onChunk:callback=>ipcRenderer.on('recovery-chunk',(_event,packet)=>callback(packet))
});

'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('interaction',{
  ready:()=>ipcRenderer.send('interaction-ready'),ack:(member,ordinal)=>ipcRenderer.send('interaction-ack',{member,ordinal}),
  failure:message=>ipcRenderer.send('interaction-failure',String(message).slice(0,500)),
  onChunk:callback=>ipcRenderer.on('interaction-chunk',(_event,packet)=>callback(packet))
});

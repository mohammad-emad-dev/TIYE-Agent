'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const {isChunk}=require('../protocol');
contextBridge.exposeInMainWorld('s5',{
  ready:()=>ipcRenderer.send('s5-ready'),
  onChunk:callback=>ipcRenderer.on('s5-chunk',(_event,packet)=>{if(isChunk(packet)) callback(packet);}),
  view:process.argv.includes('--s5-focus')?'focus':'grid'
});

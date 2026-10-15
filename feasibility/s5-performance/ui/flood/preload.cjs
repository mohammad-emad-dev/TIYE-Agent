'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const {isChunk}=require('../protocol');
contextBridge.exposeInMainWorld('flood',{
  ready:()=>ipcRenderer.send('flood-ready'),
  ack:(member,ordinal)=>ipcRenderer.send('flood-ack',{member,ordinal}),
  input:()=>ipcRenderer.send('flood-input'),
  rendered:ordinal=>ipcRenderer.send('flood-rendered',ordinal),
  onChunk:callback=>ipcRenderer.on('flood-chunk',(_event,packet)=>{if(isChunk(packet))callback(packet);}),
  view:process.argv.includes('--focus-view')?'focus':'grid'
});

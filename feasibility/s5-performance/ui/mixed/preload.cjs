'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('feed',{
  page:request=>ipcRenderer.invoke('feed-page',request),
  rendered:report=>ipcRenderer.invoke('feed-rendered',report)
});

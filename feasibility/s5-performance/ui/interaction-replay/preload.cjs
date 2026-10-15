const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('replay',{input:()=>ipcRenderer.invoke('replay-input'),complete:packet=>ipcRenderer.send('replay-complete',packet),failure:message=>ipcRenderer.send('replay-failure',message)});

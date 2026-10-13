'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('terminalBridge', {
  ready: () => ipcRenderer.send('terminal-ready'),
  input: data => { if (typeof data === 'string' && data.length <= 65536) ipcRenderer.send('terminal-input', data); },
  data: callback => ipcRenderer.on('terminal-data', (_event, data) => { if (typeof data === 'string') callback(data); }),
});

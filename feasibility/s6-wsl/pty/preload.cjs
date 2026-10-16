'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('mockPty', {
  input: text => ipcRenderer.send('pty-input', text),
  ready: () => ipcRenderer.send('renderer-ready'),
  onOutput: callback => ipcRenderer.on('pty-output', (_event, text) => callback(text))
});

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  loadSetup: () => ipcRenderer.invoke('setup:load'),
  saveSetup: value => ipcRenderer.invoke('setup:save', value)
});

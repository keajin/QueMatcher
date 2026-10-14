const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  getSetupCapabilities: () => ipcRenderer.invoke('setup:capabilities'),
  getDisplayScreens: () => ipcRenderer.invoke('display:screens'),
  openDisplayBoard: options => ipcRenderer.invoke('display:open', options),
  closeDisplayBoard: () => ipcRenderer.invoke('display:close'),
  publishDisplayState: value => ipcRenderer.send('display:publish', value),
  loadSetup: () => ipcRenderer.invoke('setup:load'),
  saveSetup: value => ipcRenderer.invoke('setup:save', value)
});

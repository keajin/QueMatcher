const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('displayBoard', {
  getState: () => ipcRenderer.invoke('display:state'),
  onUpdate: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('display:update', listener);
    return () => ipcRenderer.removeListener('display:update', listener);
  }
});

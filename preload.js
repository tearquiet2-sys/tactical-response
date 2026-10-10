const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', on),
  // synchronous file-backed save slots (profile.json, resume.json) in the user data folder
  readSave: (name) => ipcRenderer.sendSync('save:read', name),
  writeSave: (name, text) => ipcRenderer.sendSync('save:write', name, text),
  isDesktop: true
});

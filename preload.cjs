const { contextBridge, ipcRenderer } = require('electron');
const allowedModules = new Set(['vaccine', 'ua-online', 'documents-local']);
const allowedPages = new Set(['vaccine', 'ua-online', 'documents-local']);
contextBridge.exposeInMainWorld('homeHospital', Object.freeze({
  status: () => ipcRenderer.invoke('platform:status'),
  navigate: (name) => allowedPages.has(name) ? ipcRenderer.invoke('platform:navigate', name) : Promise.resolve({ ok:false,message:'ไม่รู้จักหน้านี้' }),
  launch: (name) => allowedModules.has(name) ? ipcRenderer.invoke('platform:launch', name) : Promise.resolve({ ok:false,message:'ไม่รู้จักโมดูลนี้' }),
  getDocumentsUrl: () => ipcRenderer.invoke('platform:documents-url:get'),
  setDocumentsUrl: (url) => typeof url === 'string' ? ipcRenderer.invoke('platform:documents-url:set', url) : Promise.resolve({ ok:false,message:'URL ไม่ถูกต้อง' }),
  getUpdateState: () => ipcRenderer.invoke('platform:update:state'),
  checkForUpdates: () => ipcRenderer.invoke('platform:update:check'),
  installUpdate: () => ipcRenderer.invoke('platform:update:install'),
  onUpdateState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('platform:update:state-changed', listener);
    return () => ipcRenderer.removeListener('platform:update:state-changed', listener);
  }
}));

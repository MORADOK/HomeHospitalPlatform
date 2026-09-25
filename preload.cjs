const { contextBridge, ipcRenderer } = require('electron');
const allowedModules = new Set(['vaccine', 'ua-online']);
const allowedPages = new Set(['home', 'ua-online']);
contextBridge.exposeInMainWorld('homeHospital', Object.freeze({
  status: () => ipcRenderer.invoke('platform:status'),
  navigate: (name) => allowedPages.has(name) ? ipcRenderer.invoke('platform:navigate', name) : Promise.resolve({ ok:false,message:'ไม่รู้จักหน้านี้' }),
  launch: (name) => allowedModules.has(name) ? ipcRenderer.invoke('platform:launch', name) : Promise.resolve({ ok:false,message:'ไม่รู้จักโมดูลนี้' })
}));

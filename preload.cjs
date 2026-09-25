const { contextBridge, ipcRenderer } = require('electron');
const allowedModules = new Set(['vaccine', 'ua-online']);
contextBridge.exposeInMainWorld('homeHospital', Object.freeze({
  status: () => ipcRenderer.invoke('platform:status'),
  launch: (name) => allowedModules.has(name)
    ? ipcRenderer.invoke('platform:launch', name)
    : Promise.resolve({ ok: false, message: 'ไม่รู้จักโมดูลนี้' })
}));

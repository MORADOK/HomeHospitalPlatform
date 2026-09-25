const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const { createModuleRegistry, isKnownModule, DEFAULT_UA_ONLINE_URL } = require('./modules.cjs');
const modules = createModuleRegistry();
let mainWindow;
let uaView;

function layoutUaView() {
  if (!mainWindow || !uaView || mainWindow.getBrowserView() !== uaView) return;
  const [width, height] = mainWindow.getContentSize();
  uaView.setBounds({ x: 210, y: 64, width: Math.max(500, width - 210), height: Math.max(400, height - 98) });
  uaView.setAutoResize({ width: true, height: true });
}
function createUaView() {
  if (uaView) return uaView;
  uaView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  uaView.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://labhomereport.streamlit.app/')) uaView.webContents.loadURL(url);
    return { action: 'deny' };
  });
  uaView.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://labhomereport.streamlit.app/')) event.preventDefault();
  });
  return uaView;
}
function showHome() { if (mainWindow?.getBrowserView()) mainWindow.setBrowserView(null); }
async function showUa() {
  const view = createUaView();
  mainWindow.setBrowserView(view);
  layoutUaView();
  if (!view.webContents.getURL().startsWith('https://labhomereport.streamlit.app/')) await view.webContents.loadURL(DEFAULT_UA_ONLINE_URL);
}
function createWindow() {
  mainWindow = new BrowserWindow({ width:1280,height:820,minWidth:1000,minHeight:650,backgroundColor:'#f4f8f5',title:'Home Hospital Platform',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== mainWindow.webContents.getURL()) event.preventDefault(); });
  mainWindow.on('resize', layoutUaView);
  mainWindow.on('closed', () => { mainWindow = null; uaView = null; });
  mainWindow.loadFile('index.html');
}
ipcMain.handle('platform:status', async () => Object.fromEntries(await Promise.all(Object.entries(modules).map(async ([name,module]) => [name,await module.status()]))));
ipcMain.handle('platform:navigate', async (_event, name) => {
  if (name === 'home') { showHome(); return { ok:true,message:'หน้าหลัก' }; }
  if (name === 'ua-online') { try { await showUa(); return { ok:true,message:'UA Report เปิดภายในแพลตฟอร์มแล้ว' }; } catch(error) { console.error(error); return { ok:false,message:'โหลด UA Report ไม่สำเร็จ' }; } }
  return { ok:false,message:'ไม่รู้จักหน้านี้' };
});
ipcMain.handle('platform:launch', async (_event, name) => {
  if (!isKnownModule(name)) return { ok:false,message:'ไม่รู้จักโมดูลนี้' };
  if (name === 'ua-online') { try { await showUa(); return { ok:true,message:'UA Report เปิดภายในแพลตฟอร์มแล้ว' }; } catch { return { ok:false,message:'โหลด UA Report ไม่สำเร็จ' }; } }
  try { return await modules[name].launch(); } catch(error) { console.error(error); return { ok:false,message:`เปิด ${modules[name].label} ไม่สำเร็จ` }; }
});
app.whenReady().then(() => { createWindow(); app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow()); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

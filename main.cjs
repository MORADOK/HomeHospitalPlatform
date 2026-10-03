const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');
const { createModuleRegistry, isKnownModule } = require('./modules.cjs');
const modules = createModuleRegistry();
// This Windows host is currently rendering Electron's BrowserWindow as a fully black surface
// with the default GPU path. Use software rendering for the platform shell to avoid the D3D
// compositor failure; remote Vaccine/UA pages still run normally in Chromium.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
let mainWindow;
let moduleView;
let activeModule = null;

function isAllowedModuleUrl(name, value) {
  if (!isKnownModule(name) || typeof value !== 'string') return false;
  try {
    const target = new URL(value);
    const configured = new URL(modules[name].url);
    if (name === 'documents-local') {
      return target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname) && target.port === '8501';
    }
    if (target.protocol !== 'https:') return false;
    if (target.hostname === configured.hostname) return true;
    // Embedded apps legitimately redirect to service/CDN/auth hosts. Keep the allow-list narrow
    // enough to prevent arbitrary navigation while permitting each module's normal boot flow.
    if (name === 'vaccine') {
      return target.hostname === 'moradok.github.io' ||
        target.hostname.endsWith('.supabase.co') ||
        target.hostname === 'supabase.co';
    }
    if (name === 'ua-online') {
      return target.hostname === 'share.streamlit.io' ||
        target.hostname.endsWith('.streamlit.app') ||
        target.hostname === 'streamlit.io' ||
        target.hostname.endsWith('.streamlit.io');
    }
    return false;
  } catch { return false; }
}

function layoutModuleView() {
  if (!mainWindow || !moduleView || mainWindow.getBrowserView() !== moduleView) return;
  const [width, height] = mainWindow.getContentSize();
  moduleView.setBounds({ x: 210, y: 64, width: Math.max(500, width - 210), height: Math.max(400, height - 98) });
  moduleView.setAutoResize({ width: true, height: true });
}
function destroyModuleView() {
  if (!moduleView) return;
  if (mainWindow && mainWindow.getBrowserView() === moduleView) mainWindow.setBrowserView(null);
  try { moduleView.webContents.close(); } catch (error) { console.error('Module view cleanup failed', error); }
  moduleView = null;
}
function createModuleView() {
  moduleView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  moduleView.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[module console]', { module: activeModule, level, message, line, sourceId });
  });
  moduleView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[module did-fail-load]', { module: activeModule, errorCode, errorDescription, validatedURL, isMainFrame });
  });
  moduleView.webContents.on('render-process-gone', (_event, details) => {
    console.error('[module renderer gone]', { module: activeModule, details });
  });
  moduleView.webContents.setWindowOpenHandler(({ url }) => {
    if (activeModule && isAllowedModuleUrl(activeModule, url)) {
      moduleView.webContents.loadURL(url).catch(console.error);
    } else if (url.startsWith('https://')) {
      shell.openExternal(url).catch(console.error);
    }
    return { action: 'deny' };
  });
  moduleView.webContents.on('will-navigate', (event, url) => {
    if (activeModule && !isAllowedModuleUrl(activeModule, url)) event.preventDefault();
  });
  return moduleView;
}
async function showModule(name) {
  if (!isKnownModule(name)) throw new Error('Unknown module');
  const result = await modules[name].launch();
  if (!result.ok || !result.url) throw new Error(result.message || 'Module URL unavailable');
  // Give every module switch a fresh renderer. Vaccine and Streamlit maintain very different
  // navigation/session state, so sharing one WebContents can leave the next module behind a
  // stalled loader from the previous app.
  destroyModuleView();
  activeModule = name;
  const view = createModuleView();
  // BrowserView is attached through BrowserWindow's dedicated overlay surface. This avoids the
  // Windows/NVIDIA compositor issue seen with nested WebContentsView while preserving the shell
  // sidebar/header/footer around the embedded module.
  mainWindow.setBrowserView(view);
  layoutModuleView();
  const configuredUrl = new URL(result.url).href;
  try {
    await view.webContents.loadURL(configuredUrl);
  } catch (error) {
    // Chromium reports ERR_ABORTED for normal client-side redirects. Only fail if the resulting
    // page did not land on an allowed URL for this module.
    const landedUrl = view.webContents.getURL();
    if (!isAllowedModuleUrl(name, landedUrl)) throw error;
  }
  return result;
}
function createWindow() {
  mainWindow = new BrowserWindow({ width:1280,height:820,minWidth:1000,minHeight:650,backgroundColor:'#f4f8f5',title:'Home Hospital Platform',icon:path.join(__dirname,'uninstallerIcon.ico'),autoHideMenuBar:true,show:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== mainWindow.webContents.getURL()) event.preventDefault(); });
  mainWindow.on('resize', layoutModuleView);
  mainWindow.on('closed', () => { mainWindow = null; moduleView = null; activeModule = null; });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Platform shell failed to load', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('Platform renderer exited', details));
  mainWindow.loadFile(path.join(__dirname, 'index.html')).then(() => {
    console.log('Platform shell loaded', mainWindow.webContents.getURL());
    mainWindow.show();
    mainWindow.focus();
  }).catch((error) => console.error('Platform loadFile failed', error));
}
ipcMain.handle('platform:status', async () => Object.fromEntries(await Promise.all(Object.entries(modules).map(async ([name,module]) => [name,await module.status()]))));
ipcMain.handle('platform:navigate', async (_event, name) => {
  if (isKnownModule(name)) { try { await showModule(name); return { ok:true,message:`${modules[name].label} เปิดภายในแพลตฟอร์มแล้ว` }; } catch(error) { console.error(error); return { ok:false,message:`โหลด ${modules[name].label} ไม่สำเร็จ` }; } }
  return { ok:false,message:'ไม่รู้จักหน้านี้' };
});
ipcMain.handle('platform:launch', async (_event, name) => {
  if (!isKnownModule(name)) return { ok:false,message:'ไม่รู้จักโมดูลนี้' };
  try { await showModule(name); return { ok:true,message:`${modules[name].label} เปิดภายในแพลตฟอร์มแล้ว` }; } catch(error) { console.error(error); return { ok:false,message:`โหลด ${modules[name].label} ไม่สำเร็จ` }; }
});
app.whenReady().then(() => { createWindow(); app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow()); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

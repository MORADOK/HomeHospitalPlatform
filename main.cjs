const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { createModuleRegistry, isKnownModule, normalizeDocumentsUrl, DEFAULT_DOCUMENTS_LOCAL_URL } = require('./modules.cjs');
let documentsUrl = DEFAULT_DOCUMENTS_LOCAL_URL;
let modules;
// This Windows host is currently rendering Electron's BrowserWindow as a fully black surface
// with the default GPU path. Use software rendering for the platform shell to avoid the D3D
// compositor failure; remote Vaccine/UA pages still run normally in Chromium.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
let mainWindow;
let moduleView;
let activeModule = null;
let updateState = { status: 'idle', version: app.getVersion(), percent: 0, message: 'พร้อมตรวจสอบอัปเดต' };

function updaterLogPath() { return path.join(app.getPath('userData'), 'updater.log'); }
function writeUpdaterLog(event, detail = '') {
  try {
    const line = `[${new Date().toISOString()}] ${event}${detail ? `: ${String(detail).replace(/\r?\n/g, ' ')}` : ''}\n`;
    require('fs').appendFileSync(updaterLogPath(), line, 'utf8');
  } catch (error) { console.error('Updater log write failed', error); }
}
function publishUpdateState(patch) {
  updateState = { ...updateState, ...patch, version: app.getVersion() };
  writeUpdaterLog(updateState.status, updateState.message);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('platform:update:state-changed', updateState);
}
function setupAutoUpdater() {
  if (!app.isPackaged) {
    publishUpdateState({ status: 'dev', message: 'Auto Update ทำงานเมื่อใช้โปรแกรมที่ติดตั้งแล้ว' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', percent: 0, message: 'กำลังตรวจสอบอัปเดต...' }));
  autoUpdater.on('update-available', info => publishUpdateState({ status: 'available', availableVersion: info.version, percent: 0, message: `พบเวอร์ชันใหม่ ${info.version} กำลังดาวน์โหลด...` }));
  autoUpdater.on('update-not-available', info => publishUpdateState({ status: 'current', version: info.version || app.getVersion(), percent: 0, message: 'เป็นเวอร์ชันล่าสุดแล้ว' }));
  autoUpdater.on('download-progress', progress => publishUpdateState({ status: 'downloading', percent: Math.round(progress.percent || 0), message: `กำลังดาวน์โหลดอัปเดต ${Math.round(progress.percent || 0)}%` }));
  autoUpdater.on('update-downloaded', info => publishUpdateState({ status: 'ready', availableVersion: info.version, percent: 100, message: `เวอร์ชัน ${info.version} พร้อมติดตั้ง` }));
  autoUpdater.on('error', error => {
    console.error('Auto update error', error);
    const detail = error?.stack || error?.message || String(error);
    writeUpdaterLog('ERROR DETAIL', detail);
    publishUpdateState({ status: 'error', errorDetail: error?.message || String(error), message: `อัปเดตไม่สำเร็จ: ${error?.message || String(error)}` });
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch(error => {
    writeUpdaterLog('INITIAL CHECK ERROR', error?.stack || error?.message || String(error));
    console.error('Initial update check failed', error);
  }), 5000);
}

function documentsSettingsPath() { return path.join(app.getPath('userData'), 'documents-settings.json'); }
function loadDocumentsUrl() {
  try {
    const saved = require('fs').readFileSync(documentsSettingsPath(), 'utf8');
    const parsed = JSON.parse(saved);
    documentsUrl = normalizeDocumentsUrl(parsed?.url) || DEFAULT_DOCUMENTS_LOCAL_URL;
  } catch { documentsUrl = DEFAULT_DOCUMENTS_LOCAL_URL; }
  modules = createModuleRegistry({ documentsUrl });
}
function saveDocumentsUrl(value) {
  const normalized = normalizeDocumentsUrl(value);
  if (!normalized) return null;
  require('fs').writeFileSync(documentsSettingsPath(), JSON.stringify({ url: normalized }, null, 2), 'utf8');
  documentsUrl = normalized;
  modules = createModuleRegistry({ documentsUrl });
  return normalized;
}

function isAllowedModuleUrl(name, value) {
  if (!isKnownModule(name) || typeof value !== 'string') return false;
  try {
    const target = new URL(value);
    const configured = new URL(modules[name].url);
    if (name === 'documents-local') {
      return ['http:', 'https:'].includes(target.protocol) && target.origin === configured.origin;
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

function getShellMetrics(width, height) {
  // Platform navigation lives in a compact top bar so embedded modules get the full width.
  if (width <= 760) return { sidebarWidth: 0, headerHeight: 54, footerHeight: 20 };
  if (width <= 1050) return { sidebarWidth: 0, headerHeight: 58, footerHeight: 22 };
  return { sidebarWidth: 0, headerHeight: 62, footerHeight: 24 };
}
function getModuleZoom(name, viewWidth, viewHeight) {
  // Legacy DOC and dashboard pages were designed for a wider browser canvas.
  // Scale the embedded renderer (not the shell) so the complete right edge remains visible.
  const idealWidth = name === 'documents-local' ? 1180 : name === 'ua-online' ? 1120 : 1080;
  const widthScale = Math.min(1, viewWidth / idealWidth);
  const heightScale = viewHeight < 650 ? Math.min(1, viewHeight / 650) : 1;
  return Math.max(0.72, Math.min(widthScale, heightScale));
}
function layoutModuleView() {
  if (!mainWindow || !moduleView || mainWindow.getBrowserView() !== moduleView) return;
  const [width, height] = mainWindow.getContentSize();
  const { sidebarWidth, headerHeight, footerHeight } = getShellMetrics(width, height);
  const viewWidth = Math.max(0, width - sidebarWidth);
  const viewHeight = Math.max(0, height - headerHeight - footerHeight);
  moduleView.setBounds({ x: sidebarWidth, y: headerHeight, width: viewWidth, height: viewHeight });
  moduleView.setAutoResize({ width: true, height: true });
  try { moduleView.webContents.setZoomFactor(getModuleZoom(activeModule, viewWidth, viewHeight)); } catch (error) { console.error('Module zoom failed', error); }
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
  const { width: workWidth, height: workHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({ width:Math.min(1440,workWidth),height:Math.min(900,workHeight),minWidth:720,minHeight:520,backgroundColor:'#f4f8f5',title:'Home Hospital Platform',icon:path.join(__dirname,'uninstallerIcon.ico'),autoHideMenuBar:true,show:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
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
ipcMain.handle('platform:update:state', async () => updateState);
ipcMain.handle('platform:update:check', async () => {
  if (!app.isPackaged) return { ok: false, ...updateState };
  try { await autoUpdater.checkForUpdates(); return { ok: true, ...updateState }; }
  catch (error) { console.error(error); return { ok: false, ...updateState }; }
});
ipcMain.handle('platform:update:install', async () => {
  if (updateState.status !== 'ready') return { ok: false, message: 'ยังไม่มีอัปเดตที่พร้อมติดตั้ง' };
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true, message: 'กำลังรีสตาร์ตเพื่อติดตั้งอัปเดต' };
});
ipcMain.handle('platform:documents-url:get', async () => ({ ok: true, url: documentsUrl }));
ipcMain.handle('platform:documents-url:set', async (_event, value) => {
  const normalized = saveDocumentsUrl(value);
  if (!normalized) return { ok: false, message: 'URL ต้องขึ้นต้นด้วย http:// หรือ https://' };
  return { ok: true, url: normalized, message: 'บันทึกที่อยู่ระบบบัตรนัด / ใบเสร็จแล้ว' };
});
ipcMain.handle('platform:navigate', async (_event, name) => {
  if (isKnownModule(name)) { try { await showModule(name); return { ok:true,message:`${modules[name].label} เปิดภายในแพลตฟอร์มแล้ว` }; } catch(error) { console.error(error); return { ok:false,message:`โหลด ${modules[name].label} ไม่สำเร็จ` }; } }
  return { ok:false,message:'ไม่รู้จักหน้านี้' };
});
ipcMain.handle('platform:launch', async (_event, name) => {
  if (!isKnownModule(name)) return { ok:false,message:'ไม่รู้จักโมดูลนี้' };
  try { await showModule(name); return { ok:true,message:`${modules[name].label} เปิดภายในแพลตฟอร์มแล้ว` }; } catch(error) { console.error(error); return { ok:false,message:`โหลด ${modules[name].label} ไม่สำเร็จ` }; }
});
app.whenReady().then(() => { loadDocumentsUrl(); createWindow(); setupAutoUpdater(); app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow()); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

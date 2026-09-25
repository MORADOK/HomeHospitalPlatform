const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { createModuleRegistry, isKnownModule } = require('./modules.cjs');
const modules = createModuleRegistry();

function createWindow(){const win=new BrowserWindow({width:1180,height:760,minWidth:900,minHeight:620,backgroundColor:'#f4f8f5',title:'Home Hospital Platform',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL())event.preventDefault();});win.loadFile('index.html');}
ipcMain.handle('platform:status',async()=>Object.fromEntries(await Promise.all(Object.entries(modules).map(async([name,module])=>[name,await module.status()]))));
ipcMain.handle('platform:launch',async(_event,name)=>{if(!isKnownModule(name))return {ok:false,message:'ไม่รู้จักโมดูลนี้'};try{const result=await modules[name].launch();if(result.ok&&result.url)setTimeout(()=>shell.openExternal(result.url),result.delayMs||0);return result;}catch(error){console.error(`Failed to launch module ${name}:`,error);return {ok:false,message:`เปิด ${modules[name].label} ไม่สำเร็จ`};}});
app.whenReady().then(()=>{createWindow();app.on('activate',()=>BrowserWindow.getAllWindows().length===0&&createWindow());});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

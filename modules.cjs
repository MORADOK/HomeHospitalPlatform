const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const MODULE_NAMES = Object.freeze(['vaccine', 'ua-online']);
const DEFAULT_UA_ONLINE_URL = 'https://labhomereport.streamlit.app/dashboard';

function existingFile(candidate) {
  try { return Boolean(candidate) && fs.statSync(candidate).isFile(); } catch { return false; }
}
function firstExisting(candidates) { return candidates.find(existingFile) || null; }
function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function checkHttps(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    if (!isHttpsUrl(url)) return resolve(false);
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function createModuleRegistry({ env = process.env, spawnProcess = spawn, onlineCheck = checkHttps } = {}) {
  const vaccineCandidates = [
    env.VCHOME_EXE,
    path.join(env.LOCALAPPDATA || '', 'Programs', 'VCHome Hospital', 'VCHome Hospital.exe'),
    'D:\\MainProjectVaccineHome\\VaccineHomeBot\\release\\win-unpacked\\VCHome Hospital.exe',
    'D:\\MainProjectVaccineHome\\VaccineHomeBot\\release\\VCHome-Hospital-Portable-1.0.29-x64.exe'
  ].filter(Boolean);
  const uaOnlineUrl = env.UAREPORT_ONLINE_URL || DEFAULT_UA_ONLINE_URL;

  return {
    vaccine: {
      label: 'ระบบวัคซีน',
      async status() {
        const executable = firstExisting(vaccineCandidates);
        return { ready: Boolean(executable), detail: executable ? 'พร้อมใช้งานบนเครื่องนี้' : 'ไม่พบโปรแกรม VCHome Hospital' };
      },
      async launch() {
        const executable = firstExisting(vaccineCandidates);
        if (!executable) return { ok: false, message: 'ไม่พบโปรแกรม Vaccine ในเครื่อง' };
        const child = spawnProcess(executable, [], { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        return { ok: true, message: 'เปิดระบบ Vaccine แล้ว' };
      }
    },
    'ua-online': {
      label: 'UA Report Online',
      async status() {
        const ready = await onlineCheck(uaOnlineUrl);
        return { ready, detail: ready ? 'ออนไลน์ · Streamlit/Supabase พร้อมใช้งาน' : 'UA Report Online ไม่พร้อมใช้งาน' };
      },
      async launch() {
        if (!isHttpsUrl(uaOnlineUrl)) return { ok: false, message: 'URL ของ UA Report Online ไม่ถูกต้อง' };
        return { ok: true, message: 'กำลังเปิด UA Report Online', url: uaOnlineUrl };
      }
    }
  };
}

function isKnownModule(name) { return typeof name === 'string' && MODULE_NAMES.includes(name); }
module.exports = { MODULE_NAMES, DEFAULT_UA_ONLINE_URL, createModuleRegistry, isKnownModule, isHttpsUrl };

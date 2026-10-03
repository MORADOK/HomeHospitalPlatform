const https = require('https');
const http = require('http');

const MODULE_NAMES = Object.freeze(['vaccine', 'ua-online', 'documents-local']);
const DEFAULT_VACCINE_ONLINE_URL = 'https://moradok.github.io/VaccineHomeBot/';
const DEFAULT_UA_ONLINE_URL = 'https://labhomereport.streamlit.app/dashboard';
const DEFAULT_DOCUMENTS_LOCAL_URL = 'http://127.0.0.1:8501/';

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
function checkLocalHttp(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let target;
    try { target = new URL(url); } catch { return resolve(false); }
    if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) return resolve(false);
    const req = http.get(target, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}
function createModuleRegistry({ env = process.env, onlineCheck = checkHttps, localCheck = checkLocalHttp } = {}) {
  const vaccineOnlineUrl = env.VACCINE_ONLINE_URL || DEFAULT_VACCINE_ONLINE_URL;
  const uaOnlineUrl = env.UAREPORT_ONLINE_URL || DEFAULT_UA_ONLINE_URL;
  const documentsLocalUrl = env.DOCUMENTS_LOCAL_URL || DEFAULT_DOCUMENTS_LOCAL_URL;
  const webModule = (label, url, readyDetail) => ({
    label,
    url,
    async status() {
      const ready = await onlineCheck(url);
      return { ready, detail: ready ? readyDetail : `${label} Online ไม่พร้อมใช้งาน` };
    },
    async launch() {
      if (!isHttpsUrl(url)) return { ok: false, message: `URL ของ ${label} ไม่ถูกต้อง` };
      return { ok: true, message: `กำลังเปิด ${label}`, url };
    }
  });

  const documentsLocal = {
    label: 'บัตรนัด / ใบเสร็จ',
    url: documentsLocalUrl,
    async status() {
      const ready = await localCheck(documentsLocalUrl);
      return {
        ready,
        detail: ready
          ? 'Localhost · ใช้ระบบเดิมของเครื่องนี้'
          : 'Localhost:8501 ยังไม่พร้อม · กรุณาตรวจระบบบัตรนัด/ใบเสร็จของเครื่อง'
      };
    },
    async launch() {
      const ready = await localCheck(documentsLocalUrl);
      return ready
        ? { ok: true, message: 'กำลังเปิด บัตรนัด / ใบเสร็จ จากระบบเดิมของเครื่อง', url: documentsLocalUrl }
        : { ok: false, message: 'ระบบบัตรนัด / ใบเสร็จ ในเครื่องยังไม่พร้อมใช้งาน (localhost:8501)' };
    }
  };

  return {
    vaccine: webModule('ระบบวัคซีน', vaccineOnlineUrl, 'ออนไลน์ · GitHub Pages/Supabase พร้อมใช้งาน'),
    'ua-online': webModule('UA Report', uaOnlineUrl, 'ออนไลน์ · Streamlit/Supabase พร้อมใช้งาน'),
    'documents-local': documentsLocal
  };
}

function isKnownModule(name) { return typeof name === 'string' && MODULE_NAMES.includes(name); }
module.exports = { MODULE_NAMES, DEFAULT_VACCINE_ONLINE_URL, DEFAULT_UA_ONLINE_URL, DEFAULT_DOCUMENTS_LOCAL_URL, createModuleRegistry, isKnownModule, isHttpsUrl };

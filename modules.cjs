const https = require('https');
const http = require('http');

const MODULE_NAMES = Object.freeze(['vaccine', 'ua-online', 'documents-local']);
const DEFAULT_VACCINE_ONLINE_URL = 'https://moradok.github.io/VaccineHomeBot/';
const DEFAULT_UA_ONLINE_URL = 'https://labhomereport.streamlit.app/dashboard';
const DEFAULT_DOCUMENTS_LOCAL_URL = 'http://127.0.0.1:8501/';

function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function normalizeDocumentsUrl(value) {
  try {
    const target = new URL(value);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
    if (!target.hostname) return null;
    return target.href;
  } catch { return null; }
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
function checkDocumentsHttp(url, timeoutMs = 1800) {
  return new Promise((resolve) => {
    let target;
    try { target = new URL(url); } catch { return resolve(false); }
    if (!['http:', 'https:'].includes(target.protocol)) return resolve(false);
    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(target, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}
function createModuleRegistry({ env = process.env, onlineCheck = checkHttps, localCheck = checkDocumentsHttp, documentsUrl } = {}) {
  const vaccineOnlineUrl = env.VACCINE_ONLINE_URL || DEFAULT_VACCINE_ONLINE_URL;
  const uaOnlineUrl = env.UAREPORT_ONLINE_URL || DEFAULT_UA_ONLINE_URL;
  const configuredDocumentsUrl = normalizeDocumentsUrl(documentsUrl || env.DOCUMENTS_LOCAL_URL || DEFAULT_DOCUMENTS_LOCAL_URL) || DEFAULT_DOCUMENTS_LOCAL_URL;
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
    url: configuredDocumentsUrl,
    async status() {
      const ready = await localCheck(configuredDocumentsUrl);
      const target = new URL(configuredDocumentsUrl);
      const isLocal = ['127.0.0.1', 'localhost'].includes(target.hostname);
      return {
        ready,
        detail: ready
          ? (isLocal ? 'Localhost · ใช้ระบบเดิมของเครื่องนี้' : `เครื่องแม่ · ${target.host}`)
          : `ระบบบัตรนัด/ใบเสร็จยังไม่พร้อมที่ ${target.host}`
      };
    },
    async launch() {
      const ready = await localCheck(configuredDocumentsUrl);
      return ready
        ? { ok: true, message: 'กำลังเปิด บัตรนัด / ใบเสร็จ จากระบบเดิม', url: configuredDocumentsUrl }
        : { ok: false, message: `ระบบบัตรนัด / ใบเสร็จ ยังไม่พร้อมใช้งาน (${new URL(configuredDocumentsUrl).host})` };
    }
  };

  return {
    vaccine: webModule('ระบบวัคซีน', vaccineOnlineUrl, 'ออนไลน์ · GitHub Pages/Supabase พร้อมใช้งาน'),
    'ua-online': webModule('UA Report', uaOnlineUrl, 'ออนไลน์ · Streamlit/Supabase พร้อมใช้งาน'),
    'documents-local': documentsLocal
  };
}

function isKnownModule(name) { return typeof name === 'string' && MODULE_NAMES.includes(name); }
module.exports = { MODULE_NAMES, DEFAULT_VACCINE_ONLINE_URL, DEFAULT_UA_ONLINE_URL, DEFAULT_DOCUMENTS_LOCAL_URL, createModuleRegistry, isKnownModule, isHttpsUrl, normalizeDocumentsUrl };

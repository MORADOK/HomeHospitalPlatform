const test = require('node:test');
const assert = require('node:assert/strict');
const { createModuleRegistry, isKnownModule, isHttpsUrl, normalizeDocumentsUrl } = require('../modules.cjs');

test('module allowlist contains Vaccine, UA Online and documents', () => {
  assert.equal(isKnownModule('vaccine'), true);
  assert.equal(isKnownModule('ua-online'), true);
  assert.equal(isKnownModule('documents-local'), true);
  assert.equal(isKnownModule('ua-local'), false);
  assert.equal(isKnownModule('anything-else'), false);
});

test('online modules only accept HTTPS', () => {
  assert.equal(isHttpsUrl('https://example.com'), true);
  assert.equal(isHttpsUrl('http://example.com'), false);
  assert.equal(isHttpsUrl('not-a-url'), false);
});

test('documents URL accepts localhost and LAN host but rejects unsafe schemes', () => {
  assert.equal(normalizeDocumentsUrl('http://127.0.0.1:8501'), 'http://127.0.0.1:8501/');
  assert.equal(normalizeDocumentsUrl('http://192.168.0.50:8501'), 'http://192.168.0.50:8501/');
  assert.equal(normalizeDocumentsUrl('file:///C:/Windows'), null);
  assert.equal(normalizeDocumentsUrl('javascript:alert(1)'), null);
});

test('UA Online reports availability and returns its HTTPS URL', async () => {
  const registry = createModuleRegistry({ env: { UAREPORT_ONLINE_URL: 'https://example.com/uareport' }, onlineCheck: async () => true });
  assert.equal((await registry['ua-online'].status()).ready, true);
  assert.equal((await registry['ua-online'].launch()).url, 'https://example.com/uareport');
});

test('Vaccine Online reports availability and returns its HTTPS URL', async () => {
  const registry = createModuleRegistry({ env: { VACCINE_ONLINE_URL: 'https://example.com/vaccine' }, onlineCheck: async () => true });
  assert.equal((await registry.vaccine.status()).ready, true);
  assert.equal((await registry.vaccine.launch()).url, 'https://example.com/vaccine');
});

test('documents uses localhost when configured on the host machine', async () => {
  const registry = createModuleRegistry({ documentsUrl: 'http://127.0.0.1:8501', localCheck: async () => true });
  const launch = await registry['documents-local'].launch();
  assert.equal(launch.ok, true);
  assert.equal(launch.url, 'http://127.0.0.1:8501/');
});

test('documents uses a configured LAN parent host on a client machine', async () => {
  let checkedUrl = '';
  const registry = createModuleRegistry({ documentsUrl: 'http://192.168.0.50:8501', localCheck: async (url) => { checkedUrl = url; return true; } });
  const status = await registry['documents-local'].status();
  const launch = await registry['documents-local'].launch();
  assert.equal(status.ready, true);
  assert.equal(checkedUrl, 'http://192.168.0.50:8501/');
  assert.equal(launch.url, 'http://192.168.0.50:8501/');
});

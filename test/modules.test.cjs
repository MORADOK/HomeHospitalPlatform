const test = require('node:test');
const assert = require('node:assert/strict');
const { createModuleRegistry, isKnownModule, isHttpsUrl } = require('../modules.cjs');

test('module allowlist contains Vaccine, UA Online and local documents', () => {
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

test('local documents returns localhost URL when Streamlit is already running', async () => {
  const registry = createModuleRegistry({ localCheck: async () => true });
  const status = await registry['documents-local'].status();
  const launch = await registry['documents-local'].launch();
  assert.equal(status.ready, true);
  assert.equal(launch.ok, true);
  assert.equal(launch.url, 'http://127.0.0.1:8501/');
});

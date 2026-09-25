const test = require('node:test');
const assert = require('node:assert/strict');
const { createModuleRegistry, isKnownModule, isHttpsUrl } = require('../modules.cjs');

test('module allowlist contains only Vaccine and UA Online', () => {
  assert.equal(isKnownModule('vaccine'), true);
  assert.equal(isKnownModule('ua-online'), true);
  assert.equal(isKnownModule('ua-local'), false);
  assert.equal(isKnownModule('anything-else'), false);
});

test('online UA only accepts HTTPS', () => {
  assert.equal(isHttpsUrl('https://example.com'), true);
  assert.equal(isHttpsUrl('http://example.com'), false);
  assert.equal(isHttpsUrl('not-a-url'), false);
});

test('UA Online reports availability and returns its HTTPS URL', async () => {
  const registry = createModuleRegistry({
    env: { UAREPORT_ONLINE_URL: 'https://example.com/uareport' },
    onlineCheck: async () => true
  });
  assert.equal((await registry['ua-online'].status()).ready, true);
  const result = await registry['ua-online'].launch();
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://example.com/uareport');
});

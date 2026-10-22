'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const pwaLink = require('./pwa-link.cjs');

test('builds an absolute install link from the request origin', () => {
  const request = new Request('https://converter.example/api/generate');

  assert.equal(
    pwaLink.buildPublicPwaUrl(request, '/pwa/abc123', 'state-token'),
    'https://converter.example/pwa/abc123?state=state-token',
  );
});

test('uses the configured public URL and preserves its deployment prefix', () => {
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = 'https://converter.example/tools';

  try {
    const request = new Request('http://internal.local/api/generate');
    assert.equal(
      pwaLink.buildPublicPwaUrl(request, '/pwa/abc123', 'state-token'),
      'https://converter.example/tools/pwa/abc123?state=state-token',
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

test('rejects an invalid configured public URL', () => {
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = 'not-a-url';

  try {
    assert.throws(
      () => pwaLink.buildPublicPwaUrl(new Request('https://converter.example/api/generate'), '/pwa/abc123'),
      (error) => error?.code === 'INVALID_PUBLIC_APP_URL',
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

test('round-trips stateless install state when the backing store is unavailable', async () => {
  const record = {
    id: 'stateless-http',
    targetUrl: 'http://example.com/products?view=mobile',
    appName: 'HTTP Product',
    shortName: 'Product',
    themeColor: '#123456',
    backgroundColor: '#abcdef',
  };
  const state = pwaLink.encodePwaState(record);
  const resolved = await pwaLink.resolvePwaRecord(record.id, state, async () => {
    throw new Error('store unavailable');
  });

  assert.equal(resolved.persisted, false);
  assert.equal(resolved.record.id, record.id);
  assert.equal(resolved.record.targetUrl, record.targetUrl);
  assert.equal(resolved.record.appName, record.appName);
  assert.equal(resolved.record.themeColor, '#123456');
  assert.equal(resolved.record.backgroundColor, '#ABCDEF');
  assert.equal(resolved.record.icon192, null);
  assert.equal(resolved.record.icon512, null);
});

test('keeps uploaded PNG icons in a portable stateless install state', async () => {
  const record = {
    id: 'stateless-icon',
    targetUrl: 'https://example.com/',
    appName: 'Stateless Icon',
    icon192: Buffer.from('icon-192'),
    icon512: Buffer.from('icon-512'),
  };
  const state = pwaLink.encodePwaState(record, { includeIcons: true });
  const resolved = await pwaLink.resolvePwaRecord(record.id, state, async () => {
    throw new Error('store unavailable');
  });

  assert.equal(resolved.persisted, false);
  assert.deepEqual(resolved.record.icon192, record.icon192);
  assert.deepEqual(resolved.record.icon512, record.icon512);
  assert.equal(resolved.state, state);
});

test('preserves the incoming portable state when a stored record is available', async () => {
  const record = {
    id: 'preserve-icon-state',
    targetUrl: 'https://example.com/',
    appName: 'Preserved Icon State',
    icon192: Buffer.from('icon-192'),
    icon512: Buffer.from('icon-512'),
  };
  const state = pwaLink.encodePwaState(record, { includeIcons: true });
  const resolved = await pwaLink.resolvePwaRecord(record.id, state, async () => record);

  assert.equal(resolved.persisted, true);
  assert.equal(resolved.state, state);
  assert.deepEqual(resolved.record.icon192, record.icon192);
});

test('rejects stateless state for a different PWA id', () => {
  const state = pwaLink.encodePwaState({
    id: 'original-id',
    targetUrl: 'https://example.com/',
    appName: 'Original',
  });

  assert.equal(pwaLink.decodePwaState('different-id', state), null);
});

test('keeps state on manifest and icon paths', () => {
  assert.equal(
    pwaLink.withPwaState('/pwa/abc123/icon.png', 'state-token', { size: 192 }),
    '/pwa/abc123/icon.png?size=192&state=state-token',
  );
});

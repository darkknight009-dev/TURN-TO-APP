'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { deflateRawSync } = require('node:zlib');

const pwaLink = require('./pwa-link.cjs');

function encodeLegacyIconState(record) {
  const metadata = JSON.parse(Buffer.from(pwaLink.encodePwaState(record), 'base64url').toString('utf8'));
  return deflateRawSync(Buffer.from(JSON.stringify({
    ...metadata,
    icon192: record.icon192.toString('base64url'),
    icon512: record.icon512.toString('base64url'),
  }))).toString('base64url');
}

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

test('never includes uploaded icon bytes in hosted state, even with the legacy option', async () => {
  const record = {
    id: 'stateless-icon',
    targetUrl: 'https://example.com/',
    appName: 'Stateless Icon',
    icon192: randomBytes(30_000),
    icon512: randomBytes(100_000),
  };
  const state = pwaLink.encodePwaState(record, { includeIcons: true });
  const resolved = await pwaLink.resolvePwaRecord(record.id, state, async () => {
    throw new Error('store unavailable');
  });

  assert.equal(resolved.persisted, false);
  assert.ok(state.length < 1024);
  assert.equal(state, pwaLink.encodePwaState({ ...record, icon192: null, icon512: null }));
  const payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  assert.equal(payload.icon192, undefined);
  assert.equal(payload.icon512, undefined);
  assert.equal(resolved.record.icon192, null);
  assert.equal(resolved.record.icon512, null);
  assert.equal(resolved.state, state);
});

test('canonicalizes legacy icon state using the current stored metadata', async () => {
  const record = {
    id: 'preserve-icon-state',
    targetUrl: 'https://example.com/',
    appName: 'Preserved Icon State',
    icon192: Buffer.from('icon-192'),
    icon512: Buffer.from('icon-512'),
  };
  const state = encodeLegacyIconState({ ...record, appName: 'Old app name', targetUrl: 'https://example.org/old' });
  const resolved = await pwaLink.resolvePwaRecord(record.id, state, async () => record);

  assert.equal(resolved.persisted, true);
  assert.equal(resolved.state, pwaLink.encodePwaState(record));
  assert.notEqual(resolved.state, state);
  assert.deepEqual(resolved.record.icon192, record.icon192);
  assert.equal(pwaLink.decodePwaState(record.id, resolved.state).appName, record.appName);
  assert.equal(pwaLink.decodePwaState(record.id, resolved.state).targetUrl, record.targetUrl);
});

test('reduces legacy stateless icon links to metadata-only fallback state', async () => {
  const record = {
    id: 'legacy-fallback',
    targetUrl: 'https://example.com/',
    appName: 'Legacy fallback',
    iconSource: 'upload',
    icon192: Buffer.from('icon-192'),
    icon512: Buffer.from('icon-512'),
  };
  const incomingState = encodeLegacyIconState(record);
  const resolved = await pwaLink.resolvePwaRecord(record.id, incomingState, async () => null);

  assert.equal(resolved.persisted, false);
  assert.equal(resolved.state, pwaLink.encodePwaState(record));
  assert.equal(resolved.record.icon192, null);
  assert.equal(resolved.record.icon512, null);
  assert.equal(resolved.record.targetUrl, record.targetUrl);
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

test('rejects oversized metadata instead of generating another unlaunchable URL', () => {
  const record = { id: 'long-url', targetUrl: `https://example.com/?q=${'x'.repeat(5000)}`, appName: 'Long URL' };
  assert.throws(() => pwaLink.encodePwaState(record), { code: 'PWA_STATE_TOO_LARGE' });
  const legacy = Buffer.from(JSON.stringify({ v: 1, ...record })).toString('base64url');
  assert.equal(pwaLink.decodePwaState(record.id, legacy), null);
});

function checkHostedRoutes(storePath, persisted) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { deflateRawSync } from 'node:zlib';
    import sharp from 'sharp';
    import { POST } from './app/api/generate/route.js';
    import { GET as getManifest } from './app/pwa/[id]/manifest.webmanifest/route.js';
    import { GET as getWorker } from './app/pwa/[id]/sw.js/route.js';
    import { GET as getIcon } from './app/pwa/[id]/icon.png/route.js';
    import { GET as getDownload } from './app/api/pwa/[id]/download/route.js';
    import pwaLink from './lib/pwa-link.cjs';
    import pwaStore from './lib/pwa-store.cjs';

    const uploadedPng = await sharp({
      create: { width: 32, height: 32, channels: 4, background: '#CC2244' },
    }).png().toBuffer();
    const form = new FormData();
    form.set('url', 'https://example.com/products');
    form.set('name', 'Uploaded icon');
    if (${JSON.stringify(persisted)}) form.set('icon', new File([uploadedPng], 'icon.png', { type: 'image/png' }));
    const generated = await POST(new Request('https://converter.example/api/generate', { method: 'POST', body: form }));
    assert.equal(generated.status, 200);
    const result = await generated.json();
    const installUrl = new URL(result.installUrl);
    const state = installUrl.searchParams.get('state');
    assert.ok(installUrl.href.length < 1024);
    assert.equal(installUrl.pathname, '/pwa/' + result.id);
    const metadata = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    assert.equal(metadata.icon192, undefined);
    assert.equal(metadata.icon512, undefined);
    assert.equal(new URL(result.downloadUrl).searchParams.get('state'), state);
    const storedRecord = await pwaStore.getPwa(result.id);
    assert.equal(Boolean(storedRecord), ${JSON.stringify(persisted)});

    // Old bookmarked state must not propagate into the manifest or worker.
    const legacyState = deflateRawSync(Buffer.from(JSON.stringify({
      ...metadata,
      icon192: uploadedPng.toString('base64url'),
      icon512: uploadedPng.toString('base64url'),
    }))).toString('base64url');
    const routeContext = { params: Promise.resolve({ id: result.id }) };
    const manifestUrl = pwaLink.withPwaState(installUrl.pathname + '/manifest.webmanifest', legacyState);
    const manifestResponse = await getManifest(new Request(new URL(manifestUrl, installUrl)), routeContext);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    const startUrl = new URL(manifest.start_url, installUrl);
    assert.equal(startUrl.href, installUrl.href);
    assert.equal(manifest.scope, installUrl.pathname);
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, installUrl);
      assert.equal(iconUrl.searchParams.get('state'), state);
      assert.ok(iconUrl.href.length < 1024);
      const iconResponse = await getIcon(new Request(iconUrl), routeContext);
      assert.equal(iconResponse.status, 200);
      const png = Buffer.from(await iconResponse.arrayBuffer());
      const size = Number(iconUrl.searchParams.get('size'));
      assert.equal((await sharp(png).metadata()).width, size);
      if (storedRecord) {
        assert.deepEqual(png, storedRecord['icon' + size]);
        const pixels = await sharp(png).raw().toBuffer();
        assert.deepEqual([...pixels.subarray(0, 3)], [204, 34, 68], 'Use the actual uploaded artwork, not a fallback');
      }
    }
    const workerUrl = new URL(pwaLink.withPwaState(installUrl.pathname + '/sw.js', legacyState), installUrl);
    const workerResponse = await getWorker(new Request(workerUrl), routeContext);
    assert.equal(workerResponse.status, 200);
    assert.equal(workerResponse.headers.get('Service-Worker-Allowed'), manifest.scope);
    const worker = await workerResponse.text();
    assert.ok(worker.includes(state));
    assert.equal(worker.includes(legacyState), false);
    assert.equal(worker.includes('/adaptive'), false);
    const downloadResponse = await getDownload(new Request(result.downloadUrl), routeContext);
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get('Content-Type'), 'application/zip');
    if (storedRecord) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await downloadResponse.arrayBuffer());
      assert.deepEqual(await zip.file('icon-192.png').async('nodebuffer'), storedRecord.icon192);
      assert.deepEqual(await zip.file('icon-512.png').async('nodebuffer'), storedRecord.icon512);

      const gif = Buffer.from('R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQICgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQICgAAACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7', 'base64');
      form.set('icon', new File([gif], 'animated.gif', { type: 'image/gif' }));
      const gifResponse = await POST(new Request('https://converter.example/api/generate', { method: 'POST', body: form }));
      assert.equal(gifResponse.status, 200);
      const gifResult = await gifResponse.json();
      const gifUrl = new URL(gifResult.installUrl);
      const previewUrl = new URL(gifUrl);
      previewUrl.pathname += '/icon.png';
      previewUrl.searchParams.set('animated', '1');
      const preview = await getIcon(new Request(previewUrl), { params: Promise.resolve({ id: gifResult.id }) });
      assert.equal(preview.headers.get('Content-Type'), 'image/gif');
      assert.equal((await sharp(Buffer.from(await preview.arrayBuffer()), { animated: true }).metadata()).pages, 2);

      await pwaStore.deletePwa(result.id);
      for (const [handler, url] of [[getIcon, new URL(manifest.icons[0].src, installUrl)], [getManifest, new URL(manifestUrl, installUrl)], [getDownload, result.downloadUrl]]) {
        const unavailable = await handler(new Request(url), routeContext);
        assert.equal(unavailable.status, 503, 'Losing stored uploads must not silently change the app identity');
      }
    }
    if (!${JSON.stringify(persisted)}) {
      form.set('icon', new File([uploadedPng], 'icon.png', { type: 'image/png' }));
      const failedUpload = await POST(new Request('https://converter.example/api/generate', { method: 'POST', body: form }));
      assert.equal(failedUpload.status, 503, 'Never issue a success link after losing an uploaded icon');
      const error = await failedUpload.json();
      assert.equal(error.installUrl, undefined);
      assert.match(error.message, /sav|persist|stor/i);
    }
  `], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      MONGODB_URI: '',
      PWA_STORE_PATH: storePath,
      PUBLIC_APP_URL: '',
      NEXT_PUBLIC_APP_URL: '',
    },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'hosted route scenario failed');
}

test('generate, manifest, worker, icon, and download routes keep uploaded bytes in the store', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-hosted-routes-'));
  try {
    checkHostedRoutes(path.join(directory, 'pwas.json'), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('hosted routes retain metadata-only stateless fallback when persistence fails', () => {
  checkHostedRoutes('/dev/null/pwas.json', false);
});

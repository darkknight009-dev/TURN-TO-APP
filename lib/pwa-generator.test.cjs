'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');

const sharp = require('sharp');

const generator = require('./pwa-generator.cjs');

const ANIMATED_GIF = Buffer.from(
  'R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQICgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQICgAAACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7',
  'base64',
);

test('rejects unsupported and private target URLs', () => {
  assert.equal(generator.isValidTargetUrl('https://example.com/'), true);
  assert.equal(generator.validateTargetUrl('example.com/products').url, 'https://example.com/products');
  assert.equal(generator.isValidTargetUrl('http://example.com/'), true);
  assert.equal(generator.isValidTargetUrl('ftp://example.com/'), false);
  assert.equal(generator.isValidTargetUrl('http://127.0.0.1:3000/'), false);
  assert.equal(generator.isValidTargetUrl('http://service.internal/'), false);
  assert.equal(generator.isValidTargetUrl('/products'), false);
});

test('sanitizes the install name and derives a short name', () => {
  assert.equal(generator.sanitizeAppName('  Launch / Space: App  '), 'Launch Space App');
  assert.equal(generator.getShortName('Launch Space App'), 'Launch Space');
  assert.equal(generator.deriveAppName('https://www.example.com/products'), 'example.com');
});

test('builds an installable hosted manifest with both icon sizes', () => {
  const manifest = generator.buildManifest(
    {
      id: 'abc123',
      targetUrl: 'https://example.com/products',
      appName: 'Example Shop',
      shortName: 'Shop',
      icon192: Buffer.from('192'),
      icon512: Buffer.from('512'),
    },
    { hosted: true },
  );

  assert.equal(manifest.name, 'Example Shop');
  assert.equal(manifest.short_name, 'Shop');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/pwa/abc123');
  assert.equal(manifest.scope, '/pwa/abc123');
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type]),
    [
      ['/pwa/abc123/icon.png?size=192', '192x192', 'image/png'],
      ['/pwa/abc123/icon.png?size=512', '512x512', 'image/png'],
    ],
  );
});

test('keeps stateless hosted manifest assets launchable after a store miss', () => {
  const manifest = generator.buildManifest(
    {
      id: 'stateless-manifest',
      targetUrl: 'https://example.com/',
      appName: 'Stateless Manifest',
    },
    { hosted: true, hostedState: 'state-token' },
  );

  assert.equal(manifest.start_url, '/pwa/stateless-manifest?state=state-token');
  assert.equal(new URL(manifest.start_url, 'https://converter.example').pathname, manifest.scope);
  assert.match(manifest.icons[0].src, /[?&]state=state-token$/);
  assert.match(manifest.icons[1].src, /[?&]state=state-token$/);
});

test('keeps stateless service-worker assets scoped to the generated link', () => {
  const serviceWorker = generator.buildHostedServiceWorker('stateless-worker', {
    state: 'state-token',
    persisted: false,
  });

  assert.match(serviceWorker, /stateless-worker/);
  assert.match(serviceWorker, /state-token/);
  assert.doesNotMatch(serviceWorker, /adaptive/);
});

test('installs the hosted worker without requesting the fallible adaptive preview', async () => {
  const listeners = {};
  const shellAssets = [];
  let skippedWaiting = false;
  const worker = generator.buildHostedServiceWorker('preview-failure', { state: 'state-token', persisted: true });
  vm.runInNewContext(worker, {
    URL,
    self: {
      location: { origin: 'https://converter.example' },
      addEventListener: (name, callback) => { listeners[name] = callback; },
      skipWaiting: async () => { skippedWaiting = true; },
    },
    caches: {
      open: async () => ({
        add: async (asset) => {
          shellAssets.push(asset);
          if (asset.includes('/adaptive')) {
            throw new Error('Adaptive preview returned HTTP 502');
          }
        },
      }),
    },
  });

  let installation;
  listeners.install({ waitUntil: (promise) => { installation = promise; } });
  await installation;

  assert.equal(skippedWaiting, true);
  assert.deepEqual(shellAssets, [
    '/pwa/preview-failure?state=state-token',
    '/pwa/preview-failure/manifest.webmanifest?state=state-token',
    '/pwa/preview-failure/icon.png?size=192&state=state-token',
    '/pwa/preview-failure/icon.png?size=512&state=state-token',
  ]);
});

test('worker handles the canonical launch path and excludes neighboring PWAs', async () => {
  const listeners = {};
  const requests = [];
  vm.runInNewContext(generator.buildHostedServiceWorker('app'), {
    URL,
    Response,
    self: {
      location: { origin: 'https://converter.example' },
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    caches: { open: async () => ({ match: async () => undefined, put: async () => {} }) },
    fetch: async (request) => { requests.push(request.url); return new Response('shell'); },
  });

  for (const pathname of ['/pwa/app?state=token', '/pwa/app/manifest.webmanifest']) {
    let response;
    listeners.fetch({
      request: { url: `https://converter.example${pathname}`, method: 'GET', mode: 'navigate' },
      respondWith: (promise) => { response = promise; },
    });
    assert.ok(response, `Worker must handle ${pathname}`);
    assert.equal((await response).status, 200);
  }

  for (const url of ['https://converter.example/pwa/app-other', 'https://elsewhere.example/pwa/app']) {
    listeners.fetch({
      request: new Request(url),
      respondWith: () => assert.fail(`Worker must not handle ${url}`),
    });
  }
  assert.equal(requests.length, 2);
});

test('creates a fallback icon set and a valid ZIP archive', async () => {
  const icons = await generator.createIconSet(null);
  assert.equal(icons.icon192.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icons.icon512.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const archive = await generator.generatePwaZip({
    id: 'zip-test',
    targetUrl: 'https://example.com/',
    appName: 'ZIP Test',
    icon192: icons.icon192,
    icon512: icons.icon512,
  });

  const JSZip = require('jszip');
  const zip = await (JSZip.default || JSZip).loadAsync(archive);
  assert.deepEqual(Object.keys(zip.files).sort(), [
    'README.md',
    'app.js',
    'icon-192.png',
    'icon-512.png',
    'index.html',
    'manifest.webmanifest',
    'styles.css',
    'sw.js',
  ]);
});

test('accepts animated GIF uploads and emits static PNG icon sizes', async () => {
  const icons = await generator.createIconSet({
    type: 'image/gif',
    size: ANIMATED_GIF.byteLength,
    arrayBuffer: async () => ANIMATED_GIF,
  });

  assert.equal(icons.source, 'upload');
  assert.equal(icons.icon192.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icons.icon512.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const icon192Metadata = await sharp(icons.icon192).metadata();
  const icon512Metadata = await sharp(icons.icon512).metadata();
  const firstFrame = await sharp(icons.icon192).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(
    [icon192Metadata.format, icon192Metadata.width, icon192Metadata.height, icon192Metadata.pages],
    ['png', 192, 192, undefined],
  );
  assert.deepEqual(
    [icon512Metadata.format, icon512Metadata.width, icon512Metadata.height, icon512Metadata.pages],
    ['png', 512, 512, undefined],
  );
  assert.deepEqual([...firstFrame.data.subarray(0, 3)], [255, 0, 0]);
  assert.ok(icons.iconGif, 'Keep an animated display asset separately from the static install icons');
  assert.equal((await sharp(icons.iconGif, { animated: true }).metadata()).pages, 2);
});

test('worker activation only deletes older caches of this exact app', async () => {
  const listeners = {};
  const deleted = [];
  vm.runInNewContext(generator.buildHostedServiceWorker('app'), {
    self: { addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim: async () => {} } },
    caches: {
      keys: async () => ['pwa-wrapper-app-v1', 'pwa-wrapper-app-v2', 'pwa-wrapper-app-v3', 'pwa-wrapper-app-other-v1', 'unrelated'],
      delete: async (name) => { deleted.push(name); },
    },
  });
  let activation;
  listeners.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['pwa-wrapper-app-v1', 'pwa-wrapper-app-v2']);
});

test('worker provides a self-contained launcher when the converter is offline or returns an error', async () => {
  const targetUrl = 'http://example.com/products?view=mobile#details';
  for (const status of [0, 404, 503]) {
    const listeners = {};
    vm.runInNewContext(generator.buildHostedServiceWorker('offline', { targetUrl, appName: 'Offline App' }), {
      URL, Response,
      self: { location: { origin: 'https://converter.example' }, addEventListener: (name, fn) => { listeners[name] = fn; } },
      fetch: async () => { if (!status) throw new Error('server stopped'); return new Response('error', { status }); },
    });
    let reply;
    listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://converter.example/pwa/offline?state=token' }, respondWith: (promise) => { reply = promise; } });
    const response = await reply;
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, /_next\//);
    assert.match(html, /Open app/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const standalone of [false, true]) {
      const opened = [];
      vm.runInNewContext(script, { window: { matchMedia: () => ({ matches: standalone }), location: { replace: (url) => opened.push(url) } }, navigator: {} });
      assert.deepEqual(opened, standalone ? [targetUrl] : []);
    }
  }
});

test('a temporarily unavailable shell asset cannot abort service-worker activation', async () => {
  const listeners = {};
  let ready = false;
  vm.runInNewContext(generator.buildHostedServiceWorker('partial'), {
    self: { addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => { ready = true; } },
    caches: { open: async () => ({ add: async () => { throw new Error('HTTP 503'); } }) },
  });
  let installation;
  listeners.install({ waitUntil: (promise) => { installation = promise; } });
  await installation;
  assert.equal(ready, true);
});

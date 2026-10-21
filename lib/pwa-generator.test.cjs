'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const generator = require('./pwa-generator.cjs');

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
  assert.equal(manifest.start_url, '/pwa/abc123/');
  assert.equal(manifest.scope, '/pwa/abc123/');
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type]),
    [
      ['/pwa/abc123/icon.png?size=192', '192x192', 'image/png'],
      ['/pwa/abc123/icon.png?size=512', '512x512', 'image/png'],
    ],
  );
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

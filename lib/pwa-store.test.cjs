'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-store-test-'));
const storePath = path.join(tempDirectory, 'nested', 'pwas.json');
const projectDirectory = path.resolve(__dirname, '..');
const previousStorePath = process.env.PWA_STORE_PATH;
process.env.PWA_STORE_PATH = storePath;

const store = require('./pwa-store.cjs');

function runFreshStoreScript(source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: projectDirectory,
    env: { ...process.env, PWA_STORE_PATH: storePath },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || 'fresh store process failed');
  return JSON.parse(result.stdout);
}

test('persists records and resized icon buffers across a fresh process', () => {
  store.clearPwaStore();
  const created = store.createPwa({
    id: 'round-trip',
    targetUrl: 'https://example.com/products',
    appName: 'Round Trip',
    shortName: 'Trip',
    themeColor: '#123456',
    backgroundColor: '#abcdef',
    icon192: Buffer.from([0, 1, 2, 255]),
    icon512: Buffer.from([3, 4, 5, 254]),
    createdAt: '2026-01-02T03:04:05.000Z',
  });

  assert.equal(fs.existsSync(storePath), true);
  assert.equal(created.id, 'round-trip');

  const freshRecord = runFreshStoreScript(`
    const { getPwa } = require('./lib/pwa-store.cjs');
    const record = getPwa('round-trip');
    console.log(JSON.stringify({
      ...record,
      icon192: record?.icon192?.toString('base64'),
      icon512: record?.icon512?.toString('base64'),
    }));
  `);

  assert.deepEqual(freshRecord, {
    id: 'round-trip',
    targetUrl: 'https://example.com/products',
    appName: 'Round Trip',
    shortName: 'Trip',
    themeColor: '#123456',
    backgroundColor: '#abcdef',
    icon192: Buffer.from([0, 1, 2, 255]).toString('base64'),
    icon512: Buffer.from([3, 4, 5, 254]).toString('base64'),
    createdAt: '2026-01-02T03:04:05.000Z',
  });
});

test('clearing the store persists an empty record set', () => {
  store.createPwa({
    id: 'clear-me',
    targetUrl: 'https://example.com/',
    appName: 'Clear Me',
    icon192: Buffer.from('192'),
    icon512: Buffer.from('512'),
  });
  assert.equal(store.hasPwa('clear-me'), true);

  store.clearPwaStore();

  assert.equal(store.getPwaStoreSize(), 0);
  const freshState = runFreshStoreScript(`
    const { getPwa, getPwaStoreSize } = require('./lib/pwa-store.cjs');
    console.log(JSON.stringify({ record: getPwa('clear-me'), size: getPwaStoreSize() }));
  `);
  assert.deepEqual(freshState, { record: null, size: 0 });
});

test('refreshes a loaded store when another process changes the file', () => {
  store.clearPwaStore();

  runFreshStoreScript(`
    const { createPwa } = require('./lib/pwa-store.cjs');
    createPwa({
      id: 'external-change',
      targetUrl: 'https://example.com/external',
      appName: 'External Change',
      icon192: Buffer.from('192'),
      icon512: Buffer.from('512'),
    });
    console.log(JSON.stringify({ ok: true }));
  `);

  assert.equal(store.hasPwa('external-change'), true);
  assert.equal(store.getPwa('external-change').appName, 'External Change');
});

test('ignores a corrupt store file without crashing', () => {
  fs.writeFileSync(storePath, '{not-json', 'utf8');

  const freshState = runFreshStoreScript(`
    const { getPwaStoreSize } = require('./lib/pwa-store.cjs');
    console.log(JSON.stringify({ size: getPwaStoreSize() }));
  `);

  assert.deepEqual(freshState, { size: 0 });
});

test.after(() => {
  if (previousStorePath === undefined) delete process.env.PWA_STORE_PATH;
  else process.env.PWA_STORE_PATH = previousStorePath;
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

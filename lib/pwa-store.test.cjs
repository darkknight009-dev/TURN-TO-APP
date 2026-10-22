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
const previousMongoUri = process.env.MONGODB_URI;
const previousNodeEnv = process.env.NODE_ENV;

process.env.PWA_STORE_PATH = storePath;
process.env.MONGODB_URI = '';
process.env.NODE_ENV = 'test';

const store = require('./pwa-store.cjs');

function runFreshStoreScript(source, freshStorePath = storePath, extraEnv = {}) {
  const result = spawnSync(process.execPath, ['-e', `
    (async () => {
      ${source}
    })().catch((error) => {
      console.error(error.stack || error);
      process.exit(1);
    });
  `], {
    cwd: projectDirectory,
    env: { ...process.env, ...extraEnv, PWA_STORE_PATH: freshStorePath, MONGODB_URI: '', NODE_ENV: 'test' },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || 'fresh store process failed');
  return JSON.parse(result.stdout);
}

test('persists records and resized icon buffers across a fresh process', async () => {
  await store.clearPwaStore();
  const created = await store.createPwa({
    id: 'round-trip',
    targetUrl: 'https://example.com/products',
    appName: 'Round Trip',
    shortName: 'Trip',
    themeColor: '#123456',
    backgroundColor: '#abcdef',
    icon192: Buffer.from([0, 1, 2, 255]),
    icon512: Buffer.from([3, 4, 5, 254]),
    iconSource: 'upload',
    iconGif: Buffer.from('GIF89a-preview'),
    createdAt: '2026-01-02T03:04:05.000Z',
  });

  assert.equal(fs.existsSync(storePath), true);
  assert.equal(created.id, 'round-trip');

  const freshRecord = runFreshStoreScript(`
    const { getPwa } = require('./lib/pwa-store.cjs');
    const record = await getPwa('round-trip');
    console.log(JSON.stringify({
      ...record,
      icon192: record?.icon192?.toString('base64'),
      icon512: record?.icon512?.toString('base64'),
      iconGif: record?.iconGif?.toString('base64'),
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
    iconSource: 'upload',
    iconGif: Buffer.from('GIF89a-preview').toString('base64'),
    createdAt: '2026-01-02T03:04:05.000Z',
  });
});

test('clearing the store persists an empty record set', async () => {
  await store.createPwa({
    id: 'clear-me',
    targetUrl: 'https://example.com/',
    appName: 'Clear Me',
    icon192: Buffer.from('192'),
    icon512: Buffer.from('512'),
  });
  assert.equal(await store.hasPwa('clear-me'), true);

  await store.clearPwaStore();

  assert.equal(await store.getPwaStoreSize(), 0);
  const freshState = runFreshStoreScript(`
    const { getPwa, getPwaStoreSize } = require('./lib/pwa-store.cjs');
    console.log(JSON.stringify({ record: await getPwa('clear-me'), size: await getPwaStoreSize() }));
  `);
  assert.deepEqual(freshState, { record: null, size: 0 });
});

test('refreshes a loaded store when another process changes the file', async () => {
  await store.clearPwaStore();

  runFreshStoreScript(`
    const { createPwa } = require('./lib/pwa-store.cjs');
    await createPwa({
      id: 'external-change',
      targetUrl: 'https://example.com/external',
      appName: 'External Change',
      icon192: Buffer.from('192'),
      icon512: Buffer.from('512'),
    });
    console.log(JSON.stringify({ ok: true }));
  `);

  assert.equal(await store.hasPwa('external-change'), true);
  assert.equal((await store.getPwa('external-change')).appName, 'External Change');
});

test('ignores a corrupt store file without crashing', async () => {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, '{not-json', 'utf8');

  const freshState = runFreshStoreScript(`
    const { getPwaStoreSize } = require('./lib/pwa-store.cjs');
    console.log(JSON.stringify({ size: await getPwaStoreSize() }));
  `);

  assert.deepEqual(freshState, { size: 0 });
});

test('can return a volatile record when persistence is unavailable', async () => {
  const result = runFreshStoreScript(`
    const { createPwa } = require('./lib/pwa-store.cjs');
    const record = await createPwa({
      id: 'volatile-record',
      targetUrl: 'https://example.com/volatile',
      appName: 'Volatile Record',
    }, { allowVolatile: true });
    console.log(JSON.stringify({ id: record.id, volatile: record.volatile }));
  `, '/dev/null/pwas.json');

  assert.deepEqual(result, { id: 'volatile-record', volatile: true });
});

test('explains missing MongoDB configuration on a hosted runtime', () => {
  const result = runFreshStoreScript(`
    const { createPwa } = require('./lib/pwa-store.cjs');
    try {
      await createPwa({ id: 'hosted-missing-store', targetUrl: 'https://example.com/', appName: 'Hosted Missing Store', icon192: Buffer.from('icon') });
      process.exit(2);
    } catch (error) {
      console.log(JSON.stringify({ code: error.code, message: error.message }));
    }
  `, '/dev/null/pwas.json', { VERCEL: '1' });

  assert.equal(result.code, 'PWA_STORE_WRITE_FAILED');
  assert.match(result.message, /hosted deployment|MONGODB_URI|serverless/i);
});

test('classifies common MongoDB deployment failures without exposing connection details', () => {
  assert.match(store.mongoFailureHint(new Error('MongoServerSelectionError: connection timed out')), /network|allowlist/i);
  assert.match(store.mongoFailureHint(new Error('Server selection timed out; tls: true')), /network|allowlist/i);
  assert.match(store.mongoFailureHint(new Error('Authentication failed')), /credentials|permissions/i);
  assert.match(store.mongoFailureHint(new Error('querySrv ENOTFOUND cluster.example.mongodb.net')), /hostname|resolved|DNS/i);
  assert.match(store.mongoFailureHint(new Error('certificate verify failed during TLS handshake')), /TLS|certificate/i);
  assert.doesNotMatch(store.mongoFailureHint(new Error('mongodb+srv://user:secret@example.test')), /secret|mongodb\+srv/i);
});

test('reaching local capacity never deletes existing installed apps or their icons', async () => {
  await store.clearPwaStore();
  for (let index = 0; index < store.MAX_PWA_RECORDS; index += 1) {
    await store.createPwa({ id: `keep-${index}`, targetUrl: 'https://example.com/', icon192: Buffer.from('saved-icon') });
  }
  await assert.rejects(store.createPwa({ id: 'overflow', targetUrl: 'https://example.com/' }), { code: 'PWA_STORE_FULL' });
  assert.equal((await store.getPwa('keep-0')).icon192.toString(), 'saved-icon');
  assert.equal(await store.getPwa('overflow'), null);
  assert.equal(await store.getPwaStoreSize(), store.MAX_PWA_RECORDS);
});

test.after(() => {
  if (previousStorePath === undefined) delete process.env.PWA_STORE_PATH;
  else process.env.PWA_STORE_PATH = previousStorePath;
  if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = previousMongoUri;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

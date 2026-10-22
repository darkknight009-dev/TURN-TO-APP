'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const PWA_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PWA_RECORDS = 100;
const STORE_KEY = Symbol.for('pwa-converter.local-store');
const MONGO_STORE_KEY = Symbol.for('pwa-converter.mongo-store');
const DEFAULT_STORE_PATH = '.data/pwas.json';
const DEFAULT_MONGO_DATABASE = 'pwa_converter';
const DEFAULT_MONGO_COLLECTION = 'pwas';

const mongoUri = String(process.env.MONGODB_URI || '').trim();
const mongoDatabase = String(process.env.MONGODB_DB || DEFAULT_MONGO_DATABASE).trim() || DEFAULT_MONGO_DATABASE;
const mongoCollection = String(process.env.MONGODB_COLLECTION || DEFAULT_MONGO_COLLECTION).trim() || DEFAULT_MONGO_COLLECTION;
const useMongoStore = Boolean(mongoUri);

function isHostedRuntime() {
  return process.env.VERCEL === '1'
    || Boolean(String(process.env.VERCEL_ENV || '').trim())
    || Boolean(String(process.env.NOW_REGION || '').trim())
    || Boolean(String(process.env.AWS_LAMBDA_FUNCTION_NAME || '').trim());
}

function localStoreWriteMessage() {
  if (isHostedRuntime() && !useMongoStore) {
    return 'PWA storage is not configured for this hosted deployment. Add MONGODB_URI, MONGODB_DB, and MONGODB_COLLECTION to the deployment environment, then redeploy. A local .data/pwas.json store is not writable or durable on serverless hosts.';
  }
  return 'Unable to persist generated PWA records. Configure MongoDB or a writable local PWA store before generating install links.';
}

function resolveStorePath() {
  const configuredPath = String(process.env.PWA_STORE_PATH || '').trim();
  return path.resolve(configuredPath || DEFAULT_STORE_PATH);
}

const storePath = resolveStorePath();
const existingStore = globalThis[STORE_KEY];
const localStore = existingStore?.path === storePath
  ? existingStore
  : { path: storePath, records: new Map(), fileSignature: undefined };
globalThis[STORE_KEY] = localStore;

function createStoreError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function getMongoTimeout() {
  const configured = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000);
  return Number.isFinite(configured) && configured > 0 ? configured : 5000;
}

function getMongoState() {
  const existing = globalThis[MONGO_STORE_KEY];
  if (existing?.uri === mongoUri && existing.database === mongoDatabase && existing.collection === mongoCollection) {
    return existing;
  }

  const state = {
    uri: mongoUri,
    database: mongoDatabase,
    collection: mongoCollection,
    client: new MongoClient(mongoUri, {
      appName: 'pwa-converter',
      serverSelectionTimeoutMS: getMongoTimeout(),
    }),
    connection: null,
    indexes: null,
  };
  globalThis[MONGO_STORE_KEY] = state;
  return state;
}

async function getMongoCollection() {
  if (!useMongoStore) {
    throw createStoreError('PWA_STORE_NOT_CONFIGURED', 'MONGODB_URI is not configured.');
  }

  const state = getMongoState();
  if (!state.connection) {
    state.connection = state.client.connect().catch((error) => {
      state.connection = null;
      throw createStoreError('PWA_STORE_UNAVAILABLE', 'The configured MongoDB PWA store could not be reached. Verify MONGODB_URI, the database network/IP allowlist, and the deployment environment variables.', error);
    });
  }

  try {
    await state.connection;
    const collection = state.client.db(state.database).collection(state.collection);
    if (!state.indexes) {
      state.indexes = collection.createIndex({ createdAt: 1 }).catch((error) => {
        state.indexes = null;
        throw createStoreError('PWA_STORE_UNAVAILABLE', 'The MongoDB PWA store could not create its index. Verify the database user permissions and deployment network access.', error);
      });
    }
    await state.indexes;
    return collection;
  } catch (error) {
    if (error?.code === 'PWA_STORE_UNAVAILABLE') throw error;
    throw createStoreError('PWA_STORE_UNAVAILABLE', 'The MongoDB PWA store is unavailable. Verify MONGODB_URI and redeploy after changing deployment environment variables.', error);
  }
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }

  return crypto.randomBytes(18).toString('base64url').slice(0, 24);
}

function normalizeId(value) {
  const id = String(value || '').trim();
  return PWA_ID_PATTERN.test(id) ? id : null;
}

function cloneBuffer(value) {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value);
}

function getFileSignature() {
  try {
    const stats = fs.statSync(localStore.path);
    if (!stats.isFile()) return null;
    return [stats.dev, stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs].join(':');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return error?.code ? `error:${error.code}` : 'error:unknown';
  }
}

function deserializeBuffer(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);

  try {
    if (typeof value === 'string') return Buffer.from(value, 'base64');
    if (Array.isArray(value)) return Buffer.from(value);
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value?.value === 'function') return Buffer.from(value.value());
    if (value?.buffer instanceof Uint8Array) return Buffer.from(value.buffer);
  } catch {
    return null;
  }

  return null;
}

function deserializeRecord(value) {
  if (!value || typeof value !== 'object') return null;

  const id = normalizeId(value.id || value._id);
  if (!id) return null;

  return {
    id,
    targetUrl: String(value.targetUrl || ''),
    appName: String(value.appName || value.name || 'Web App'),
    shortName: String(value.shortName || value.appName || value.name || 'Web App'),
    themeColor: String(value.themeColor || '#6757D9'),
    backgroundColor: String(value.backgroundColor || '#F6F7FB'),
    icon192: deserializeBuffer(value.icon192),
    icon512: deserializeBuffer(value.icon512),
    iconGif: deserializeBuffer(value.iconGif),
    iconSource: value.iconSource === 'upload' ? 'upload' : value.iconSource === 'fallback' ? 'fallback' : null,
    createdAt: value.createdAt || new Date().toISOString(),
  };
}

function readRecordsFromDisk() {
  let contents;
  try {
    contents = fs.readFileSync(localStore.path, 'utf8');
  } catch {
    return new Map();
  }

  if (!contents.trim()) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return new Map();
  }

  const values = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.records) ? parsed.records : null;
  if (!values) return new Map();

  const loadedRecords = new Map();
  for (const value of values) {
    const record = deserializeRecord(value);
    if (!record) continue;
    loadedRecords.set(record.id, record);
  }

  return loadedRecords;
}

function refreshLocalStore(force = false) {
  const signature = getFileSignature();
  if (!force && signature === localStore.fileSignature) return;

  const loadedRecords = readRecordsFromDisk();
  localStore.records.clear();
  for (const [id, record] of loadedRecords) localStore.records.set(id, record);
  localStore.fileSignature = getFileSignature();
}

function serializeBuffer(value) {
  const buffer = cloneBuffer(value);
  return buffer ? buffer.toString('base64') : null;
}

function serializeLocalStore() {
  return `${JSON.stringify({
    version: 1,
    records: [...localStore.records.values()].map((record) => ({
      id: record.id,
      targetUrl: record.targetUrl,
      appName: record.appName,
      shortName: record.shortName,
      themeColor: record.themeColor,
      backgroundColor: record.backgroundColor,
      icon192: serializeBuffer(record.icon192),
      icon512: serializeBuffer(record.icon512),
      iconGif: serializeBuffer(record.iconGif),
      iconSource: record.iconSource,
      createdAt: record.createdAt,
    })),
  })}\n`;
}

function persistLocalStore() {
  let tempPath;
  try {
    fs.mkdirSync(path.dirname(localStore.path), { recursive: true });
    tempPath = path.join(
      path.dirname(localStore.path),
      `.${path.basename(localStore.path)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
    );
    fs.writeFileSync(tempPath, serializeLocalStore(), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, localStore.path);
    localStore.fileSignature = getFileSignature();
  } catch (error) {
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup for a failed atomic write.
      }
    }
    throw createStoreError(
      'PWA_STORE_WRITE_FAILED',
      localStoreWriteMessage(),
      error,
    );
  }
}

function restoreLocalRecords(records, fileSignature) {
  localStore.records.clear();
  for (const [id, record] of records) localStore.records.set(id, record);
  localStore.fileSignature = fileSignature;
}

function buildRecord(input, id) {
  return {
    id,
    targetUrl: String(input.targetUrl || ''),
    appName: String(input.appName || input.name || 'Web App'),
    shortName: String(input.shortName || input.appName || input.name || 'Web App'),
    themeColor: String(input.themeColor || '#6757D9'),
    backgroundColor: String(input.backgroundColor || '#F6F7FB'),
    icon192: cloneBuffer(input.icon192),
    icon512: cloneBuffer(input.icon512),
    iconGif: cloneBuffer(input.iconGif),
    iconSource: input.iconSource === 'upload' ? 'upload' : input.iconSource === 'fallback' ? 'fallback' : null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

function createLocalUniqueId() {
  let id = createId();
  while (localStore.records.has(id)) id = createId();
  return id;
}

function createLocalPwa(input = {}) {
  refreshLocalStore();
  const previousRecords = new Map(localStore.records);
  const previousSignature = localStore.fileSignature;
  const id = normalizeId(input.id) || createLocalUniqueId();
  if (!localStore.records.has(id) && localStore.records.size >= MAX_PWA_RECORDS) {
    throw createStoreError('PWA_STORE_FULL', 'The local PWA store is full. Configure MongoDB or explicitly remove unused records; existing apps will not be deleted.');
  }
  const record = buildRecord(input, id);

  localStore.records.set(id, record);
  try {
    persistLocalStore();
  } catch (error) {
    restoreLocalRecords(previousRecords, previousSignature);
    throw error;
  }
  return record;
}

function getLocalPwa(id) {
  refreshLocalStore();
  const normalizedId = normalizeId(id);
  return normalizedId ? localStore.records.get(normalizedId) || null : null;
}

function deleteLocalPwa(id) {
  refreshLocalStore();
  const normalizedId = normalizeId(id);
  const previousRecords = new Map(localStore.records);
  const previousSignature = localStore.fileSignature;
  if (!normalizedId || !localStore.records.delete(normalizedId)) return false;
  try {
    persistLocalStore();
  } catch (error) {
    restoreLocalRecords(previousRecords, previousSignature);
    throw error;
  }
  return true;
}

function clearLocalPwaStore() {
  refreshLocalStore();
  const previousRecords = new Map(localStore.records);
  const previousSignature = localStore.fileSignature;
  localStore.records.clear();
  try {
    persistLocalStore();
  } catch (error) {
    restoreLocalRecords(previousRecords, previousSignature);
    throw error;
  }
}

function getLocalPwaStoreSize() {
  refreshLocalStore();
  return localStore.records.size;
}

function serializeMongoRecord(record) {
  return {
    _id: record.id,
    id: record.id,
    targetUrl: record.targetUrl,
    appName: record.appName,
    shortName: record.shortName,
    themeColor: record.themeColor,
    backgroundColor: record.backgroundColor,
    icon192: cloneBuffer(record.icon192),
    icon512: cloneBuffer(record.icon512),
    iconGif: cloneBuffer(record.iconGif),
    iconSource: record.iconSource,
    createdAt: record.createdAt,
  };
}

async function createMongoPwa(input = {}) {
  const collection = await getMongoCollection();
  const requestedId = normalizeId(input.id);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const record = buildRecord(input, requestedId || createId());

    try {
      await collection.insertOne(serializeMongoRecord(record), { writeConcern: { w: 'majority' } });
      return record;
    } catch (error) {
      if (!requestedId && error?.code === 11000 && attempt < 2) continue;
       throw createStoreError('PWA_STORE_WRITE_FAILED', 'Unable to persist generated PWA records in MongoDB. Check the database user permissions, network/IP allowlist, and MONGODB_DB/MONGODB_COLLECTION values.', error);
    }
  }

  throw createStoreError('PWA_STORE_WRITE_FAILED', 'Unable to allocate a unique PWA id.');
}

async function getMongoPwa(id) {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return null;

  const collection = await getMongoCollection();
  try {
    const document = await collection.findOne({ _id: normalizedId });
    return document ? deserializeRecord(document) : null;
  } catch (error) {
    throw createStoreError('PWA_STORE_UNAVAILABLE', 'The MongoDB PWA store could not read this install link.', error);
  }
}

async function deleteMongoPwa(id) {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return false;

  const collection = await getMongoCollection();
  try {
    const result = await collection.deleteOne({ _id: normalizedId });
    return result.deletedCount === 1;
  } catch (error) {
    throw createStoreError('PWA_STORE_WRITE_FAILED', 'The MongoDB PWA store could not delete this install link.', error);
  }
}

async function clearMongoPwaStore() {
  const collection = await getMongoCollection();
  try {
    await collection.deleteMany({});
  } catch (error) {
    throw createStoreError('PWA_STORE_WRITE_FAILED', 'The MongoDB PWA store could not be cleared.', error);
  }
}

async function getMongoPwaStoreSize() {
  const collection = await getMongoCollection();
  try {
    return await collection.countDocuments({});
  } catch (error) {
    throw createStoreError('PWA_STORE_UNAVAILABLE', 'The MongoDB PWA store could not be counted.', error);
  }
}

async function createPwa(input = {}, options = {}) {
  try {
    return useMongoStore ? await createMongoPwa(input) : createLocalPwa(input);
  } catch (error) {
    if (options.allowVolatile) return { ...buildRecord(input, normalizeId(input.id) || createId()), volatile: true };
    throw error;
  }
}

async function getPwa(id) {
  return useMongoStore ? getMongoPwa(id) : getLocalPwa(id);
}

async function hasPwa(id) {
  return Boolean(await getPwa(id));
}

async function deletePwa(id) {
  return useMongoStore ? deleteMongoPwa(id) : deleteLocalPwa(id);
}

async function clearPwaStore() {
  if (useMongoStore) return clearMongoPwaStore();
  return clearLocalPwaStore();
}

async function getPwaStoreSize() {
  return useMongoStore ? getMongoPwaStoreSize() : getLocalPwaStoreSize();
}

if (!useMongoStore) refreshLocalStore(true);

module.exports = {
  MAX_PWA_RECORDS,
  PWA_ID_PATTERN,
  clearPwaStore,
  createPwa,
  deletePwa,
  getPwa,
  getPwaStoreSize,
  hasPwa,
  normalizeId,
};

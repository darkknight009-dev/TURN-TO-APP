'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PWA_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PWA_RECORDS = 100;
const STORE_KEY = Symbol.for('pwa-converter.store');
const DEFAULT_STORE_PATH = '.data/pwas.json';

function resolveStorePath() {
  const configuredPath = String(process.env.PWA_STORE_PATH || '').trim();
  return path.resolve(configuredPath || DEFAULT_STORE_PATH);
}

const storePath = resolveStorePath();
const existingStore = globalThis[STORE_KEY];
const store = existingStore?.path === storePath
  ? existingStore
  : { path: storePath, records: new Map(), fileSignature: undefined };
globalThis[STORE_KEY] = store;

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
    const stats = fs.statSync(store.path);
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

  try {
    if (typeof value === 'string') return Buffer.from(value, 'base64');
    if (Array.isArray(value)) return Buffer.from(value);
    if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  } catch {
    return null;
  }

  return null;
}

function deserializeRecord(value) {
  if (!value || typeof value !== 'object') return null;

  const id = normalizeId(value.id);
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
    createdAt: value.createdAt || new Date().toISOString(),
  };
}

function readRecordsFromDisk() {
  let contents;
  try {
    contents = fs.readFileSync(store.path, 'utf8');
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
    while (loadedRecords.size > MAX_PWA_RECORDS) {
      const oldestId = loadedRecords.keys().next().value;
      if (oldestId === undefined) break;
      loadedRecords.delete(oldestId);
    }
  }

  return loadedRecords;
}

function refreshStore(force = false) {
  const signature = getFileSignature();
  if (!force && signature === store.fileSignature) return;

  const loadedRecords = readRecordsFromDisk();
  store.records.clear();
  for (const [id, record] of loadedRecords) store.records.set(id, record);
  store.fileSignature = getFileSignature();
}

function serializeBuffer(value) {
  const buffer = cloneBuffer(value);
  return buffer ? buffer.toString('base64') : null;
}

function serializeStore() {
  return `${JSON.stringify({
    version: 1,
    records: [...store.records.values()].map((record) => ({
      id: record.id,
      targetUrl: record.targetUrl,
      appName: record.appName,
      shortName: record.shortName,
      themeColor: record.themeColor,
      backgroundColor: record.backgroundColor,
      icon192: serializeBuffer(record.icon192),
      icon512: serializeBuffer(record.icon512),
      createdAt: record.createdAt,
    })),
  })}\n`;
}

function persistStore() {
  let tempPath;
  try {
    fs.mkdirSync(path.dirname(store.path), { recursive: true });
    tempPath = path.join(
      path.dirname(store.path),
      `.${path.basename(store.path)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
    );
    fs.writeFileSync(tempPath, serializeStore(), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, store.path);
    store.fileSignature = getFileSignature();
  } catch {
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup for a failed atomic write.
      }
    }
  }
}

function trimStore() {
  while (store.records.size > MAX_PWA_RECORDS) {
    const oldestId = store.records.keys().next().value;
    if (oldestId === undefined) break;
    store.records.delete(oldestId);
  }
}

/**
 * Store a generated wrapper in the local file-backed store.
 *
 * PNG buffers are serialized as base64 so the generated install route can
 * survive a local server restart without changing the route API.
 */
function createPwa(input = {}) {
  refreshStore();
  const id = normalizeId(input.id) || createUniqueId();
  const record = {
    id,
    targetUrl: String(input.targetUrl || ''),
    appName: String(input.appName || input.name || 'Web App'),
    shortName: String(input.shortName || input.appName || input.name || 'Web App'),
    themeColor: String(input.themeColor || '#6757D9'),
    backgroundColor: String(input.backgroundColor || '#F6F7FB'),
    icon192: cloneBuffer(input.icon192),
    icon512: cloneBuffer(input.icon512),
    createdAt: input.createdAt || new Date().toISOString(),
  };

  store.records.set(id, record);
  trimStore();
  persistStore();
  return record;
}

function createUniqueId() {
  let id = createId();
  while (store.records.has(id)) id = createId();
  return id;
}

function getPwa(id) {
  refreshStore();
  const normalizedId = normalizeId(id);
  return normalizedId ? store.records.get(normalizedId) || null : null;
}

function hasPwa(id) {
  return Boolean(getPwa(id));
}

function deletePwa(id) {
  refreshStore();
  const normalizedId = normalizeId(id);
  if (!normalizedId || !store.records.delete(normalizedId)) return false;
  persistStore();
  return true;
}

function clearPwaStore() {
  refreshStore();
  store.records.clear();
  persistStore();
}

function getPwaStoreSize() {
  refreshStore();
  return store.records.size;
}

refreshStore(true);

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

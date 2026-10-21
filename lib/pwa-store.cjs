'use strict';

const crypto = require('node:crypto');

const PWA_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PWA_RECORDS = 100;
const STORE_KEY = Symbol.for('pwa-converter.store');
const store = globalThis[STORE_KEY] || { records: new Map() };
globalThis[STORE_KEY] = store;
const { records } = store;

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

/**
 * Store a generated wrapper in the process-local store.
 *
 * The store deliberately keeps the PNG buffers in memory. This is suitable
 * for the small, short-lived conversion flow and keeps the requested API
 * independent from a database or object storage service.
 */
function createPwa(input = {}) {
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

  records.set(id, record);
  while (records.size > MAX_PWA_RECORDS) {
    const oldestId = records.keys().next().value;
    if (oldestId === undefined) break;
    records.delete(oldestId);
  }
  return record;
}

function createUniqueId() {
  let id = createId();
  while (records.has(id)) id = createId();
  return id;
}

function getPwa(id) {
  const normalizedId = normalizeId(id);
  return normalizedId ? records.get(normalizedId) || null : null;
}

function hasPwa(id) {
  return Boolean(getPwa(id));
}

function deletePwa(id) {
  const normalizedId = normalizeId(id);
  return normalizedId ? records.delete(normalizedId) : false;
}

function clearPwaStore() {
  records.clear();
}

function getPwaStoreSize() {
  return records.size;
}

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

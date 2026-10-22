'use strict';

const { normalizeRecord } = require('./pwa-generator.cjs');

const PWA_STATE_VERSION = 1;
const MAX_PWA_STATE_LENGTH = 16 * 1024;

function encodePwaState(record = {}) {
  const normalized = normalizeRecord(record);
  const id = String(normalized.id || '').trim();
  if (!id) throw new Error('A PWA id is required to build a stateless install link.');

  return Buffer.from(JSON.stringify({
    v: PWA_STATE_VERSION,
    id,
    targetUrl: normalized.targetUrl,
    appName: normalized.appName,
    shortName: normalized.shortName,
    themeColor: normalized.themeColor,
    backgroundColor: normalized.backgroundColor,
  }), 'utf8').toString('base64url');
}

function decodePwaState(id, value) {
  const normalizedId = String(id || '').trim();
  const state = String(value || '').trim();
  if (!normalizedId || !state || state.length > MAX_PWA_STATE_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(state)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || payload.v !== PWA_STATE_VERSION || String(payload.id || '') !== normalizedId) return null;

  try {
    const normalized = normalizeRecord({
      id: normalizedId,
      targetUrl: payload.targetUrl,
      appName: payload.appName,
      shortName: payload.shortName,
      themeColor: payload.themeColor,
      backgroundColor: payload.backgroundColor,
    });

    return { ...normalized, icon192: null, icon512: null, stateless: true };
  } catch {
    return null;
  }
}

async function resolvePwaRecord(id, stateValue, getStoredRecord) {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;

  let storedRecord = null;
  if (typeof getStoredRecord === 'function') {
    try {
      storedRecord = await getStoredRecord(normalizedId);
    } catch {
      storedRecord = null;
    }
  }

  if (storedRecord) {
    return { record: storedRecord, state: encodePwaState(storedRecord), persisted: true };
  }

  const fallbackRecord = decodePwaState(normalizedId, stateValue);
  if (!fallbackRecord) return null;
  return { record: fallbackRecord, state: String(stateValue).trim(), persisted: false };
}

function getStateFromRequest(request) {
  try {
    return new URL(request.url).searchParams.get('state') || '';
  } catch {
    return '';
  }
}

function getStateFromSearchParams(searchParams) {
  const value = searchParams?.state;
  if (Array.isArray(value)) return String(value[0] || '');
  return typeof value === 'string' ? value : '';
}

function withPwaState(pathname, state, extraParams = {}) {
  const url = new URL(pathname, 'https://pwa-state.invalid');
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  if (state) url.searchParams.set('state', String(state));
  return `${url.pathname}${url.search}`;
}

function getPublicBase(request) {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (configured) {
    let parsed;
    try {
      parsed = new URL(configured.endsWith('/') ? configured : `${configured}/`);
    } catch (error) {
      const wrapped = new Error('PUBLIC_APP_URL must be an absolute http or https URL.');
      wrapped.code = 'INVALID_PUBLIC_APP_URL';
      wrapped.cause = error;
      throw wrapped;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      const error = new Error('PUBLIC_APP_URL must use http or https.');
      error.code = 'INVALID_PUBLIC_APP_URL';
      throw error;
    }
    return parsed;
  }

  const forwardedHost = request?.headers?.get?.('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    try {
      return new URL(`${forwardedProtocol}://${forwardedHost}/`);
    } catch {
      // Fall through to the request URL when proxy headers are malformed.
    }
  }

  return new URL(request.url);
}

function buildPublicPwaUrl(request, pathname, state) {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const base = getPublicBase(request);
  const prefix = configured ? base.pathname.replace(/\/+$/, '') : '';
  const normalizedPath = String(pathname || '').startsWith('/') ? String(pathname) : `/${pathname}`;
  const url = new URL(`${prefix}${normalizedPath}`, base.origin);
  if (state) url.searchParams.set('state', String(state));
  return url.toString();
}

module.exports = {
  MAX_PWA_STATE_LENGTH,
  PWA_STATE_VERSION,
  buildPublicPwaUrl,
  decodePwaState,
  encodePwaState,
  getStateFromRequest,
  getStateFromSearchParams,
  resolvePwaRecord,
  withPwaState,
};

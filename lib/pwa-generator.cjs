'use strict';

const net = require('node:net');
const { Buffer } = require('node:buffer');

const DEFAULT_THEME_COLOR = '#6757D9';
const DEFAULT_BACKGROUND_COLOR = '#F6F7FB';
const MAX_APP_NAME_LENGTH = 64;
const MAX_SHORT_NAME_LENGTH = 12;
const MAX_ICON_BYTES = 5 * 1024 * 1024;
const MAX_ICON_PIXELS = 40_000_000;

const SUPPORTED_ICON_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/webp',
]);

const SUPPORTED_ICON_FORMATS = new Set(['avif', 'gif', 'heif', 'jpeg', 'png', 'svg', 'tiff', 'webp']);

const IPV4_RESERVED_RANGES = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24
  [0xc0586300, 0xc05863ff], // 192.88.99.0/24
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24
  [0xe0000000, 0xffffffff], // multicast and reserved
];

const PRIVATE_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.test',
  '.invalid',
  '.example',
];

const PRIVATE_HOST_LABELS = new Set([
  'localhost',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
]);

const LOOPBACK_DNS_SUFFIXES = [
  '.localtest.me',
  '.lvh.me',
  '.vcap.me',
  '.nip.io',
  '.sslip.io',
  '.xip.io',
];

const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  nbsp: ' ',
  lt: '<',
  quot: '"',
};

function makeError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function toUrl(value) {
  if (value instanceof URL) return new URL(value.toString());
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmedValue = value.trim();
  if (/^[/?#]/.test(trimmedValue)) return null;
  const hasExplicitScheme = /^[a-z][a-z\d+-]*:/i.test(trimmedValue);
  const candidate = hasExplicitScheme ? trimmedValue : `https://${trimmedValue}`;

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function normalizeHostname(value) {
  let hostname = String(value || '').trim().toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
}

function ipv4ToInteger(hostname) {
  const parts = String(hostname || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function ipv6ToGroups(hostname) {
  let value = normalizeHostname(hostname);
  if (!value || value.includes('%')) return null;

  if (value.includes('.')) {
    const separator = value.lastIndexOf(':');
    if (separator < 0) return null;
    const ipv4 = ipv4ToInteger(value.slice(separator + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, separator)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const doubleColonParts = value.split('::');
  if (doubleColonParts.length > 2) return null;

  const parseGroups = (part) => {
    if (!part) return [];
    const groups = part.split(':');
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => Number.parseInt(group, 16));
  };

  const left = parseGroups(doubleColonParts[0]);
  if (!left) return null;

  if (doubleColonParts.length === 1) return left.length === 8 ? left : null;

  const right = parseGroups(doubleColonParts[1]);
  if (!right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function hasIpv6Prefix(groups, prefix, bits) {
  const fullGroups = Math.floor(bits / 16);
  const remainingBits = bits % 16;

  for (let index = 0; index < fullGroups; index += 1) {
    if (groups[index] !== prefix[index]) return false;
  }

  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (groups[fullGroups] & mask) === (prefix[fullGroups] & mask);
}

function isReservedIpv4(hostname) {
  const integer = ipv4ToInteger(hostname);
  if (integer === null) return false;
  return IPV4_RESERVED_RANGES.some(([start, end]) => integer >= start && integer <= end);
}

function isReservedIpv6(hostname) {
  const groups = ipv6ToGroups(hostname);
  if (!groups) return false;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isMappedIpv4 = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;

  return (
    isUnspecified ||
    isLoopback ||
    isMappedIpv4 ||
    hasIpv6Prefix(groups, [0xfc00], 7) || // unique-local fc00::/7
    hasIpv6Prefix(groups, [0xfe80], 10) || // link-local fe80::/10
    hasIpv6Prefix(groups, [0xfec0], 10) || // deprecated site-local fec0::/10
    hasIpv6Prefix(groups, [0xff00], 8) || // multicast ff00::/8
    hasIpv6Prefix(groups, [0x2001, 0x0db8], 32) || // documentation
    hasIpv6Prefix(groups, [0x2001, 0x0002, 0x0000], 48) || // benchmarking
    hasIpv6Prefix(groups, [0x2001, 0x0010], 28) || // ORCHID
    hasIpv6Prefix(groups, [0x0100, 0x0000, 0x0000, 0x0000], 64) || // discard-only
    hasIpv6Prefix(groups, [0x2001, 0x0000], 32) // protocol assignment
  );
}

function isPrivateOrReservedIp(value) {
  const hostname = normalizeHostname(value);
  const version = net.isIP(hostname);
  if (version === 4) return isReservedIpv4(hostname);
  if (version === 6) return isReservedIpv6(hostname);
  return false;
}

function isPrivateLookingHostname(value) {
  const hostname = normalizeHostname(value);
  if (!hostname || net.isIP(hostname)) return false;

  if (!hostname.includes('.')) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (LOOPBACK_DNS_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;

  const labels = hostname.split('.');
  if (labels.some((label) => PRIVATE_HOST_LABELS.has(label))) return true;

  // Wildcard DNS providers commonly used for loopback testing.
  if (/(?:^|\.)127(?:-0-0-1|\.0\.0\.1)(?:\.|$)/.test(hostname)) return true;
  return false;
}

function validateTargetUrl(value) {
  const parsedUrl = toUrl(value);
  if (!parsedUrl) {
    return { valid: false, code: 'INVALID_TARGET_URL', error: 'Target URL must be an absolute URL.' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { valid: false, code: 'INVALID_TARGET_URL', error: 'Target URL must use http or https.' };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return { valid: false, code: 'INVALID_TARGET_URL', error: 'Target URL must not contain credentials.' };
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (!hostname) {
    return { valid: false, code: 'INVALID_TARGET_URL', error: 'Target URL must include a hostname.' };
  }

  if (isPrivateOrReservedIp(hostname)) {
    return {
      valid: false,
      code: 'PRIVATE_TARGET_URL',
      error: 'Target URL points to a private or reserved IP address.',
    };
  }

  if (isPrivateLookingHostname(hostname)) {
    return {
      valid: false,
      code: 'PRIVATE_TARGET_URL',
      error: 'Target URL uses a private-looking hostname.',
    };
  }

  return {
    valid: true,
    code: null,
    error: null,
    url: parsedUrl.toString(),
    parsedUrl,
    hostname,
  };
}

function assertValidTargetUrl(value) {
  const result = validateTargetUrl(value);
  if (!result.valid) throw makeError(result.code || 'INVALID_TARGET_URL', result.error);
  return result.parsedUrl;
}

function isValidTargetUrl(value) {
  return validateTargetUrl(value).valid;
}

function decodeHtmlEntities(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const lowerEntity = entity.toLowerCase();
    if (lowerEntity.startsWith('#x')) {
      const point = Number.parseInt(lowerEntity.slice(2), 16);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    }
    if (lowerEntity.startsWith('#')) {
      const point = Number.parseInt(lowerEntity.slice(1), 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    }
    return HTML_ENTITIES[lowerEntity] || match;
  });
}

function extractPageTitle(html) {
  if (typeof html !== 'string') return '';
  const match = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i);
  return match ? decodeHtmlEntities(match[1].replace(/<[^>]*>/g, ' ')) : '';
}

function sanitizeAppName(value, fallback = '') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\\/?%*:|"<>]/g, ' ')
    .replace(/[^\p{L}\p{N}\p{M}\s._+'()&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-._\s]+|[-._\s]+$/g, '')
    .slice(0, MAX_APP_NAME_LENGTH)
    .trim();

  if (normalized) return normalized;
  if (!fallback) return '';
  return sanitizeAppName(fallback).slice(0, MAX_APP_NAME_LENGTH).trim() || 'Web App';
}

function getShortName(appName) {
  return [...String(appName || '')].slice(0, MAX_SHORT_NAME_LENGTH).join('').trim() || 'Web App';
}

function normalizeShortName(value, fallback) {
  return getShortName(sanitizeAppName(value) || fallback);
}

function deriveAppName(htmlOrUrl, maybeTargetUrl) {
  if (maybeTargetUrl) {
    const title = sanitizeAppName(extractPageTitle(htmlOrUrl));
    if (title) return title;
  }

  const targetUrl = maybeTargetUrl || htmlOrUrl;
  const parsedUrl = toUrl(targetUrl);
  if (parsedUrl) {
    const hostname = normalizeHostname(parsedUrl.hostname).replace(/^www\./i, '');
    const hostnameName = sanitizeAppName(hostname);
    if (hostnameName) return hostnameName;
  }

  return 'Web App';
}

function normalizeHexColor(value, fallback) {
  const candidate = String(value || '').trim();
  if (/^#[\da-f]{6}$/i.test(candidate)) return candidate.toUpperCase();
  if (/^#[\da-f]{3}$/i.test(candidate)) {
    return `#${[...candidate.slice(1)].map((digit) => `${digit}${digit}`).join('')}`.toUpperCase();
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeJavaScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeMarkdownInline(value) {
  return String(value).replace(/`/g, '\\`');
}

function toSafeFilename(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7e]+/g, '')
    .replace(/[^a-z\d._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64)
    .trim();
  return normalized || 'pwa-app';
}

function resolveSharp(override) {
  if (override) return override.default || override;

  try {
    // Lazy loading keeps URL and manifest helpers usable in environments that
    // only run the pure parts of this module.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const sharp = require('sharp');
    return sharp.default || sharp;
  } catch (error) {
    throw makeError(
      'SHARP_UNAVAILABLE',
      'sharp is required to process PWA icons. Install it in the Next.js runtime.',
      error
    );
  }
}

function createFallbackPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * 0.31;
  const ringRadius = size * 0.36;
  const innerRadius = size * 0.075;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const vertical = y / Math.max(1, size - 1);
      const horizontal = x / Math.max(1, size - 1);
      let red = Math.round(15 + vertical * 39 + horizontal * 11);
      let green = Math.round(23 + vertical * 33 + horizontal * 20);
      let blue = Math.round(42 + vertical * 83 + horizontal * 74);

      const distance = Math.hypot(x - center, y - center);
      const glow = Math.max(0, 1 - distance / (size * 0.72));
      red = Math.round(red * (1 - glow * 0.18) + 114 * glow * 0.18);
      green = Math.round(green * (1 - glow * 0.28) + 213 * glow * 0.28);
      blue = Math.round(blue * (1 - glow * 0.2) + 202 * glow * 0.2);

      if (distance <= radius) {
        const accent = Math.max(0, 1 - distance / radius);
        red = Math.round(red * (1 - accent * 0.55) + 103 * accent * 0.55);
        green = Math.round(green * (1 - accent * 0.55) + 87 * accent * 0.55);
        blue = Math.round(blue * (1 - accent * 0.55) + 217 * accent * 0.55);
      }

      const ringDistance = Math.abs(distance - ringRadius);
      if (ringDistance <= size * 0.018) {
        red = 114;
        green = 213;
        blue = 202;
      }

      // A small light diamond gives the fallback a recognizable mark without
      // introducing an SVG or a hand-written PNG encoder.
      const diamond = Math.abs(x - center) + Math.abs(y - center) <= size * 0.13;
      if (diamond || distance <= innerRadius) {
        red = 248;
        green = 250;
        blue = 252;
      }

      pixels[offset] = Math.max(0, Math.min(255, red));
      pixels[offset + 1] = Math.max(0, Math.min(255, green));
      pixels[offset + 2] = Math.max(0, Math.min(255, blue));
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

async function createFallbackIcon(size, options = {}) {
  const sharp = resolveSharp(options.sharp);
  const pixels = createFallbackPixels(size);
  return sharp(pixels, {
    raw: { width: size, height: size, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function readIconFile(iconFile) {
  if (!iconFile || typeof iconFile.arrayBuffer !== 'function') {
    throw makeError('INVALID_ICON', 'Icon must be an uploaded image file.');
  }

  const declaredSize = Number(iconFile.size);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_ICON_BYTES) {
    throw makeError('ICON_TOO_LARGE', `Icon files must be ${MAX_ICON_BYTES} bytes or smaller.`);
  }

  const declaredType = String(iconFile.type || '').split(';', 1)[0].trim().toLowerCase();
  if (declaredType && !SUPPORTED_ICON_MIME_TYPES.has(declaredType)) {
    throw makeError('UNSUPPORTED_ICON_TYPE', 'Icon must be a PNG, JPEG, WebP, GIF, AVIF, TIFF, or SVG image.');
  }

  let arrayBuffer;
  try {
    arrayBuffer = await iconFile.arrayBuffer();
  } catch (error) {
    throw makeError('INVALID_ICON', 'Unable to read the uploaded icon.', error);
  }

  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.byteLength) throw makeError('INVALID_ICON', 'The uploaded icon is empty.');
  if (buffer.byteLength > MAX_ICON_BYTES) {
    throw makeError('ICON_TOO_LARGE', `Icon files must be ${MAX_ICON_BYTES} bytes or smaller.`);
  }

  return { buffer, declaredType };
}

function mimeMatchesFormat(mimeType, format) {
  if (!mimeType || !format) return true;
  const expected = {
    'image/avif': new Set(['avif', 'heif']),
    'image/gif': new Set(['gif']),
    'image/jpeg': new Set(['jpeg']),
    'image/png': new Set(['png']),
    'image/svg+xml': new Set(['svg']),
    'image/tiff': new Set(['tiff']),
    'image/webp': new Set(['webp']),
  }[mimeType];
  return !expected || expected.has(format);
}

async function resizeIcon(buffer, size, sharp) {
  // PWA manifest icons are served as PNGs. For animated GIF uploads, use the
  // first frame rather than attempting to preserve animation in an install
  // asset whose declared type is image/png.
  return sharp(buffer, { limitInputPixels: MAX_ICON_PIXELS, pages: 1 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'centre',
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function createIconSet(iconFile, options = {}) {
  if (!iconFile) {
    const [icon192, icon512] = await Promise.all([
      createFallbackIcon(192, options),
      createFallbackIcon(512, options),
    ]);
    return { icon192, icon512, source: 'fallback' };
  }

  const { buffer, declaredType } = await readIconFile(iconFile);
  const sharp = resolveSharp(options.sharp);

  try {
    const metadata = await sharp(buffer, { limitInputPixels: MAX_ICON_PIXELS, pages: 1 }).metadata();
    const format = String(metadata?.format || '').toLowerCase();
    if (!SUPPORTED_ICON_FORMATS.has(format)) {
      throw makeError('UNSUPPORTED_ICON_TYPE', 'Icon must be a supported image.');
    }
    if (!metadata.width || !metadata.height) {
      throw makeError('INVALID_ICON', 'The uploaded icon does not have usable dimensions.');
    }
    if (metadata.width * metadata.height > MAX_ICON_PIXELS) {
      throw makeError('ICON_TOO_LARGE', 'The uploaded icon has too many pixels.');
    }
    if (!mimeMatchesFormat(declaredType, format)) {
      throw makeError('UNSUPPORTED_ICON_TYPE', 'The uploaded icon type does not match its image data.');
    }

    const [icon192, icon512] = await Promise.all([
      resizeIcon(buffer, 192, sharp),
      resizeIcon(buffer, 512, sharp),
    ]);
    return { icon192, icon512, source: 'upload' };
  } catch (error) {
    if (error?.code === 'ICON_TOO_LARGE' || error?.code === 'UNSUPPORTED_ICON_TYPE' || error?.code === 'INVALID_ICON') {
      throw error;
    }
    throw makeError('INVALID_ICON', 'The uploaded icon is not a supported image.', error);
  }
}

function normalizeRecord(record = {}) {
  const parsedUrl = assertValidTargetUrl(record.targetUrl || record.url);
  const targetUrl = parsedUrl.toString();
  const appName = sanitizeAppName(record.appName || record.name) || deriveAppName(targetUrl);
  return {
    ...record,
    targetUrl,
    appName,
    shortName: normalizeShortName(record.shortName, appName),
    themeColor: normalizeHexColor(record.themeColor, DEFAULT_THEME_COLOR),
    backgroundColor: normalizeHexColor(record.backgroundColor, DEFAULT_BACKGROUND_COLOR),
  };
}

function buildManifest(record, options = {}) {
  const normalized = normalizeRecord(record);
  const hosted = Boolean(options.hosted);
  const encodedId = hosted ? encodeURIComponent(String(normalized.id || '')) : '';
  const basePath = hosted ? `/pwa/${encodedId}` : '.';
  const rootPath = hosted ? `${basePath}/` : './';
  const hostedState = hosted && options.hostedState ? String(options.hostedState) : '';
  const hostedStateQuery = hostedState ? `&state=${encodeURIComponent(hostedState)}` : '';
  const hostedStartUrl = hosted && hostedState
    ? `${rootPath}?state=${encodeURIComponent(hostedState)}`
    : rootPath;

  return {
    name: normalized.appName,
    short_name: normalized.shortName,
    id: hosted ? basePath : './',
    start_url: hostedStartUrl,
    scope: rootPath,
    display: 'standalone',
    theme_color: normalized.themeColor,
    background_color: normalized.backgroundColor,
    description: `A standalone PWA wrapper for ${normalized.targetUrl}`,
    icons: hosted
      ? [
          {
            src: `${rootPath}icon.png?size=192${hostedStateQuery}`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: `${rootPath}icon.png?size=512${hostedStateQuery}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ]
      : [
          {
            src: './icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: './icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
  };
}

function createDownloadIndexHtml(record) {
  const appName = escapeHtml(record.appName);
  const targetUrl = escapeHtml(record.targetUrl);
  const themeColor = escapeHtml(record.themeColor);
  const backgroundColor = escapeHtml(record.backgroundColor);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="${themeColor}">
    <meta name="background-color" content="${backgroundColor}">
    <meta name="description" content="A standalone PWA wrapper for ${appName}">
    <title>${appName}</title>
    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="icon" href="./icon-192.png" type="image/png">
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Progressive Web App</p>
          <h1 id="app-name">${appName}</h1>
        </div>
        <div class="header-actions">
          <button id="install-button" class="install-button" type="button" hidden>Install app</button>
          <a class="open-link" href="${targetUrl}" target="_blank" rel="noopener noreferrer">Open site</a>
        </div>
      </header>

      <section class="frame-card" aria-label="Embedded site">
        <iframe
          id="site-frame"
          title="${appName}"
          src="${targetUrl}"
          loading="eager"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="fullscreen; clipboard-read; clipboard-write"
        ></iframe>
      </section>

      <p class="install-message" id="install-message" role="status">
        If the site blocks embedding or does not load, use <a href="${targetUrl}" target="_blank" rel="noopener noreferrer">Open site</a> to continue in a browser tab.
      </p>
    </main>
    <script src="./app.js" defer></script>
  </body>
</html>
`;
}

function createDownloadAppJs(record) {
  return `'use strict';

const CONFIG = ${serializeJavaScript({ appName: record.appName, targetUrl: record.targetUrl })};
const frame = document.getElementById('site-frame');
const openLinks = document.querySelectorAll('a[href]');
const appNameElement = document.getElementById('app-name');
const installButton = document.getElementById('install-button');
let deferredInstallPrompt = null;

if (frame) frame.src = CONFIG.targetUrl;
if (appNameElement) appNameElement.textContent = CONFIG.appName;
openLinks.forEach((link) => { link.href = CONFIG.targetUrl; });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // The wrapper remains usable if it is opened outside a service-worker context.
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  installButton.disabled = true;
  await promptEvent.prompt();
  await promptEvent.userChoice;
  installButton.hidden = true;
});
`;
}

function createDownloadStyles() {
  return `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #020617;
  color: #e2e8f0;
}

* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body { min-height: 100vh; background: radial-gradient(circle at top, #172554 0, #020617 58%); }
.app-shell { display: flex; flex-direction: column; gap: 1rem; width: min(100%, 1280px); min-height: 100vh; margin: 0 auto; padding: clamp(1rem, 3vw, 2rem); }
.app-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.eyebrow { margin: 0 0 .25rem; color: #7dd3fc; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2.5rem); }
.header-actions { display: flex; align-items: center; gap: .65rem; }
.open-link, .install-button { display: inline-flex; align-items: center; justify-content: center; border: 1px solid #38bdf8; border-radius: 999px; padding: .65rem 1rem; color: #e0f2fe; background: #0c4a6e; font: inherit; font-weight: 700; text-decoration: none; }
.install-button { border-color: #99f6e4; background: #115e59; cursor: pointer; }
.install-button:disabled { cursor: wait; opacity: .7; }
.frame-card { flex: 1; min-height: min(72vh, 900px); overflow: hidden; border: 1px solid #334155; border-radius: 1rem; background: #f8fafc; box-shadow: 0 1.5rem 4rem rgb(2 6 23 / 35%); }
iframe { display: block; width: 100%; height: 100%; min-height: min(72vh, 900px); border: 0; background: white; }
.install-message { margin: 0; color: #94a3b8; font-size: .9rem; line-height: 1.5; }
.install-message a { color: #7dd3fc; }
@media (max-width: 640px) { .app-header { align-items: flex-start; flex-direction: column; } .header-actions { width: 100%; } .open-link, .install-button { flex: 1; text-align: center; } }
`;
}

function createDownloadServiceWorker() {
  return `const CACHE_NAME = 'pwa-wrapper-shell-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
`;
}

function createReadme(record) {
  return `# ${record.appName}

This package is a standalone Progressive Web App wrapper for:

\`${escapeMarkdownInline(record.targetUrl)}\`

## Files

- **index.html** — responsive wrapper shell with an iframe and Open site fallback.
- **app.js** — target configuration, service-worker registration, and browser install prompt.
- **styles.css** — responsive wrapper styling.
- **manifest.webmanifest** — install metadata and 192px/512px PNG icons.
- **sw.js** — caches the local wrapper shell for offline startup.

## Run locally

Serve this directory over HTTP or HTTPS, then open **index.html** in that server. Service workers do not register from a file URL.

The embedded site may require its own network connection and may refuse to load in an iframe. Use the **Open site** link when that happens.
`;
}

function buildDownloadFiles(record) {
  const normalized = normalizeRecord(record);
  if (!normalized.icon192 || !normalized.icon512) {
    throw makeError('MISSING_ICONS', 'A generated PWA must include both PNG icon sizes.');
  }

  return {
    'index.html': createDownloadIndexHtml(normalized),
    'app.js': createDownloadAppJs(normalized),
    'styles.css': createDownloadStyles(),
    'manifest.webmanifest': `${JSON.stringify(buildManifest(normalized), null, 2)}\n`,
    'sw.js': createDownloadServiceWorker(),
    'icon-192.png': Buffer.from(normalized.icon192),
    'icon-512.png': Buffer.from(normalized.icon512),
    'README.md': createReadme(normalized),
  };
}

function resolveJsZip(override) {
  if (override) return override.default || override;

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const JSZip = require('jszip');
    return JSZip.default || JSZip;
  } catch (error) {
    throw makeError('JSZIP_UNAVAILABLE', 'JSZip is required to generate a PWA download.', error);
  }
}

async function generatePwaZip(record, options = {}) {
  const files = buildDownloadFiles(record);
  const JSZip = resolveJsZip(options.JSZip);
  const zip = new JSZip();

  for (const [filename, content] of Object.entries(files)) {
    zip.file(filename, content);
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

function buildHostedServiceWorker(id, options = {}) {
  const encodedId = encodeURIComponent(String(id || ''));
  const scope = `/pwa/${encodedId}`;
  const scopeRoot = `${scope}/`;
  const cacheName = `pwa-wrapper-${encodedId}-v1`;
  const state = options.state ? String(options.state) : '';
  const stateQuery = state ? `?state=${encodeURIComponent(state)}` : '';
  const shellAssets = [
    `SCOPE_ROOT + ${serializeJavaScript(stateQuery)}`,
    ...(options.persisted === false ? [] : [`SCOPE_ROOT + 'adaptive'${stateQuery ? ` + ${serializeJavaScript(stateQuery)}` : ''}`]),
    `SCOPE_ROOT + 'manifest.webmanifest'${stateQuery ? ` + ${serializeJavaScript(stateQuery)}` : ''}`,
    `SCOPE_ROOT + 'icon.png?size=192'${stateQuery ? ` + ${serializeJavaScript(`&${stateQuery.slice(1)}`)}` : ''}`,
    `SCOPE_ROOT + 'icon.png?size=512'${stateQuery ? ` + ${serializeJavaScript(`&${stateQuery.slice(1)}`)}` : ''}`,
  ];

  return `const CACHE_NAME = ${serializeJavaScript(cacheName)};
const SCOPE = ${serializeJavaScript(scope)};
const SCOPE_ROOT = ${serializeJavaScript(scopeRoot)};
const SHELL_ASSETS = [
  ${shellAssets.join(',\n  ')},
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pwa-wrapper-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(SCOPE_ROOT)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
`;
}

module.exports = {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_THEME_COLOR,
  MAX_ICON_BYTES,
  MAX_ICON_PIXELS,
  SUPPORTED_ICON_MIME_TYPES,
  assertValidTargetUrl,
  buildDownloadFiles,
  buildHostedServiceWorker,
  buildManifest,
  createFallbackIcon,
  createIconSet,
  decodeHtmlEntities,
  deriveAppName,
  escapeHtml,
  extractPageTitle,
  generatePwaZip,
  getShortName,
  isPrivateLookingHostname,
  isPrivateOrReservedIp,
  isValidTargetUrl,
  normalizeHexColor,
  normalizeRecord,
  normalizeShortName,
  sanitizeAppName,
  toSafeFilename,
  validateTargetUrl,
};

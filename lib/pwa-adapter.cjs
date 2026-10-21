'use strict';

const { Buffer } = require('node:buffer');

const { validateTargetUrl } = require('./pwa-generator.cjs');

const ADAPTER_MARKER = 'pwa-adapted';
const ADAPTER_STYLE_ID = 'pwa-adapter-style';
const ADAPTER_SCRIPT_ID = 'pwa-adapter-script';
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';

function escapeAttribute(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}

function normalizeOptions(options) {
  if (typeof options === 'string' || options instanceof URL) return { targetUrl: String(options) };
  return options && typeof options === 'object' ? options : {};
}

function getTargetUrlOption(options) {
  const normalized = normalizeOptions(options);
  return String(normalized.targetUrl || normalized.originalTargetUrl || '').trim();
}

function getAdapterPathOption(options) {
  const normalized = normalizeOptions(options);
  if (normalized.adapterPath || normalized.routePath) {
    return String(normalized.adapterPath || normalized.routePath);
  }

  if (normalized.id != null && String(normalized.id).trim()) {
    return `/pwa/${encodeURIComponent(String(normalized.id).trim())}/adaptive`;
  }

  return '';
}

function getAllowedOriginOption(options, targetUrl) {
  const normalized = normalizeOptions(options);
  if (normalized.allowedOrigin) return String(normalized.allowedOrigin);

  try {
    return new URL(targetUrl).origin;
  } catch {
    return '';
  }
}

function buildAdapterCss() {
  return String.raw`/* Best-effort responsive adaptation; target application styles remain authoritative. */
:where(*, *::before, *::after) {
  box-sizing: border-box;
}

:where(html) {
  max-width: 100%;
  min-width: 0 !important;
  overflow-x: auto !important;
  -webkit-text-size-adjust: 100%;
}

:where(body) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  margin-inline: 0;
  overflow-x: auto !important;
  overflow-wrap: anywhere;
}

:where(body > *, main, section, article, header, footer, nav, form, fieldset) {
  max-width: 100%;
  min-width: 0 !important;
}

:where(img, svg, video, canvas, iframe, embed, object, picture) {
  display: block;
  max-width: 100% !important;
}

:where(img, video, canvas, iframe) {
  height: auto;
}

:where(table) {
  display: block !important;
  width: 100%;
  max-width: 100%;
  overflow-x: auto !important;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

:where(table > *) {
  min-width: max-content;
}

:where(pre, code) {
  max-width: 100% !important;
  overflow-x: auto !important;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

:where(pre) {
  display: block;
  -webkit-overflow-scrolling: touch;
}

:where(code) {
  display: inline-block;
  -webkit-overflow-scrolling: touch;
}

:where(form, fieldset) {
  width: 100%;
}

:where(input, select, textarea, button) {
  max-width: 100%;
  min-width: 0;
  font: inherit;
}

:where(input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']), select, textarea) {
  width: 100%;
}

:where(button, input[type='button'], input[type='submit'], input[type='reset']) {
  min-height: 2.5rem;
  white-space: normal;
}

@media (max-width: 640px) {
  :where(body) {
    padding-inline: max(0px, env(safe-area-inset-left)) max(0px, env(safe-area-inset-right));
  }

  :where([style*='min-width']) {
    min-width: 0 !important;
  }

  :where([style*='width']) {
    max-width: 100% !important;
  }

  :where(h1) {
    font-size: clamp(1.5rem, 7vw, 2.25rem);
  }

  :where(h2) {
    font-size: clamp(1.25rem, 5.5vw, 1.8rem);
  }

  html.pwa-fit-mode {
    min-height: var(--pwa-fit-height) !important;
    overflow-x: hidden !important;
  }

  html.pwa-fit-mode :where(body) {
    width: var(--pwa-natural-width) !important;
    max-width: none !important;
    transform: scale(var(--pwa-fit-scale));
    transform-origin: top left;
  }
}`;
}

function serializeInlineConfig(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildAdapterScript(options = {}) {
  const normalized = normalizeOptions(options);
  const targetUrl = getTargetUrlOption(normalized);
  const adapterPath = getAdapterPathOption(normalized);
  const allowedOrigin = getAllowedOriginOption(normalized, targetUrl);
  const config = { targetUrl, adapterPath, allowedOrigin };

  return `(function () {
  'use strict';

  var config = ${serializeInlineConfig(config)};
  var root = document.documentElement;

  if (root) {
    root.setAttribute('data-pwa-adapted', 'true');
    if (root.classList) root.classList.add('pwa-adapted');
  }

  try {
    window.__PWA_ADAPTED__ = true;
  } catch (_) {}

  function fitFixedLayout() {
    if (!root || !document.body) return;

    root.classList.remove('pwa-fit-mode');
    root.style.removeProperty('--pwa-natural-width');
    root.style.removeProperty('--pwa-fit-scale');
    root.style.removeProperty('--pwa-fit-height');

    var viewportWidth = Math.max(root.clientWidth || 0, window.innerWidth || 0);
    if (!viewportWidth || viewportWidth > 640) return;

    var naturalWidth = Math.max(root.scrollWidth || 0, document.body.scrollWidth || 0);
    if (!naturalWidth || naturalWidth <= viewportWidth * 1.12) return;

    var scale = viewportWidth / naturalWidth;
    var naturalHeight = Math.max(root.scrollHeight || 0, document.body.scrollHeight || 0);
    root.style.setProperty('--pwa-natural-width', naturalWidth + 'px');
    root.style.setProperty('--pwa-fit-scale', String(scale));
    root.style.setProperty('--pwa-fit-height', Math.ceil(naturalHeight * scale) + 'px');
    root.classList.add('pwa-fit-mode');
  }

  window.addEventListener('resize', fitFixedLayout, { passive: true });
  window.addEventListener('load', fitFixedLayout, { once: true });
  window.setTimeout(fitFixedLayout, 250);

  var target;
  try {
    target = config.targetUrl ? new URL(config.targetUrl, window.location.href) : null;
  } catch (_) {
    target = null;
  }

  var targetOrigin = config.allowedOrigin || (target && target.origin);

  function resolveTargetHref(rawHref) {
    if (!target || typeof rawHref !== 'string') return null;
    var href = rawHref.trim();
    if (!href || /^(?:#|javascript:|mailto:|tel:|sms:|data:|blob:)/i.test(href)) return null;

    try {
      var resolved = new URL(href, target.href);
      return targetOrigin && resolved.origin === targetOrigin ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function buildAdapterHref(targetHref) {
    try {
      var adapter = new URL(config.adapterPath || window.location.pathname, window.location.origin);
      adapter.search = '';
      adapter.hash = '';
      adapter.searchParams.set('url', targetHref.href);
      return adapter.href;
    } catch (_) {
      return null;
    }
  }

  function findAnchor(node) {
    if (node && typeof node.closest === 'function') return node.closest('a[href]');
    while (node && node !== document) {
      if (node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() === 'a' && node.hasAttribute('href')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var anchor = findAnchor(event.target);
    if (!anchor || anchor.hasAttribute('download')) return;
    if (String(anchor.target || '').toLowerCase() === '_blank') return;

    var targetHref = resolveTargetHref(anchor.getAttribute('href'));
    if (!targetHref) return;

    var adapterHref = buildAdapterHref(targetHref);
    if (!adapterHref) return;

    event.preventDefault();
    window.location.assign(adapterHref);
  }, true);
})();`;
}

function isViewportMetaTag(tag) {
  return /\bname\s*=\s*(?:["']viewport["']|viewport)\b/i.test(tag);
}

function replaceOrFindViewport(html) {
  let found = false;
  const result = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!isViewportMetaTag(tag)) return tag;
    found = true;
    return VIEWPORT_META;
  });
  return { html: result, found };
}

function styleTag(css) {
  return `<style id="${ADAPTER_STYLE_ID}" data-pwa-adapter="responsive">${css}</style>`;
}

function scriptTag(script) {
  return `<script id="${ADAPTER_SCRIPT_ID}" data-pwa-adapter="responsive">${script}</script>`;
}

function baseTag(targetUrl) {
  return `<base id="pwa-adapter-base" data-pwa-adapter="responsive" href="${escapeAttribute(targetUrl)}">`;
}

function replaceAdapterResource(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function insertIntoHead(html, injection) {
  if (!injection) return html;

  const headOpen = html.match(/<head\b[^>]*>/i);
  if (headOpen) {
    return html.replace(headOpen[0], `${headOpen[0]}\n${injection}`);
  }

  const htmlOpen = html.match(/<html\b[^>]*>/i);
  if (htmlOpen) {
    return html.replace(htmlOpen[0], `${htmlOpen[0]}\n<head>\n${injection}\n</head>`);
  }

  const bodyOpen = html.match(/<body\b[^>]*>/i);
  if (bodyOpen) {
    return html.replace(bodyOpen[0], `<head>\n${injection}\n</head>\n${bodyOpen[0]}`);
  }

  const doctype = html.match(/^\s*<!doctype\b[^>]*>/i);
  if (doctype) {
    const rest = html.slice(doctype[0].length);
    return `${doctype[0]}\n<html>\n<head>\n${injection}\n</head>\n<body>${rest}</body>\n</html>`;
  }

  return `<!doctype html>\n<html>\n<head>\n${injection}\n</head>\n<body>${html}</body>\n</html>`;
}

function adaptHtml(html, options = {}) {
  const normalized = normalizeOptions(options);
  const source = typeof html === 'string' ? html : String(html == null ? '' : html);
  const viewport = replaceOrFindViewport(source);
  let adapted = viewport.html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
  const targetUrl = getTargetUrlOption(normalized);
  const base = baseTag(targetUrl);
  const basePattern = /<base\b[^>]*data-pwa-adapter\s*=\s*["']responsive["'][^>]*>/i;
  const anyBasePattern = /<base\b[^>]*>/i;
  if (anyBasePattern.test(adapted)) {
    adapted = adapted.replace(anyBasePattern, base);
  }

  const css = typeof normalized.css === 'string' ? normalized.css : buildAdapterCss();
  const script = typeof normalized.script === 'string' ? normalized.script : buildAdapterScript(normalized);
  const style = styleTag(css);
  const scriptMarkup = scriptTag(script);
  const stylePattern = /<style\b[^>]*(?:id\s*=\s*["']pwa-adapter-style["']|data-pwa-adapter\s*=\s*["']responsive["'])[^>]*>[\s\S]*?<\/style\s*>/i;
  const scriptPattern = /<script\b[^>]*(?:id\s*=\s*["']pwa-adapter-script["']|data-pwa-adapter\s*=\s*["']responsive["'])[^>]*>[\s\S]*?<\/script\s*>/i;

  const hadStyle = stylePattern.test(adapted);
  const hadScript = scriptPattern.test(adapted);
  const hadBase = basePattern.test(adapted);
  adapted = replaceAdapterResource(adapted, stylePattern, style);
  adapted = replaceAdapterResource(adapted, scriptPattern, scriptMarkup);

  const injection = [
    viewport.found ? '' : VIEWPORT_META,
    hadBase ? '' : base,
    hadStyle ? '' : style,
    hadScript ? '' : scriptMarkup,
  ]
    .filter(Boolean)
    .join('\n');

  return insertIntoHead(adapted, injection);
}

function originFor(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function resolveAdapterTarget(originalTarget, requestedTarget) {
  const originalValue =
    originalTarget && typeof originalTarget === 'object' && 'targetUrl' in originalTarget
      ? originalTarget.targetUrl
      : originalTarget;
  const requestedValue =
    requestedTarget && typeof requestedTarget === 'object' && 'url' in requestedTarget
      ? requestedTarget.url
      : requestedTarget;
  const original = validateTargetUrl(originalValue);

  if (!original.valid) {
    return {
      ...original,
      originalUrl: null,
      originalOrigin: null,
      targetUrl: null,
    };
  }

  const originalOrigin = originFor(original.url);
  const hasRequestedTarget = requestedValue != null && String(requestedValue).trim() !== '';
  const requested = hasRequestedTarget ? validateTargetUrl(requestedValue) : original;

  if (!requested.valid) {
    return {
      ...requested,
      originalUrl: original.url,
      originalOrigin,
      targetUrl: null,
    };
  }

  if (originFor(requested.url) !== originalOrigin) {
    return {
      valid: false,
      code: 'TARGET_ORIGIN_MISMATCH',
      error: 'Preview navigation must stay on the generated target origin.',
      url: null,
      parsedUrl: null,
      originalUrl: original.url,
      originalOrigin,
      targetUrl: null,
    };
  }

  return {
    ...requested,
    originalUrl: original.url,
    originalOrigin,
    targetUrl: requested.url,
  };
}

function makeBodyLimitError(limit, actual) {
  const error = new Error(`The response body exceeds the ${limit}-byte preview limit.`);
  error.code = 'BODY_TOO_LARGE';
  error.limit = limit;
  error.bytes = actual;
  return error;
}

async function readResponseBodyWithLimit(response, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const limit = Number(maxBytes);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new RangeError('maxBytes must be a positive finite number.');
  }

  const declaredLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw makeBodyLimitError(limit, declaredLength);
  }

  if (!response || typeof response.text !== 'function') {
    throw new TypeError('A fetch Response is required.');
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text();
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength > limit) throw makeBodyLimitError(limit, byteLength);
    return text;
  }

  const reader = body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;

      const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
      total += chunk.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {
          // The response is already over the limit; cancellation is best effort.
        }
        throw makeBodyLimitError(limit, total);
      }
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (typeof reader.releaseLock === 'function') reader.releaseLock();
  }

  return Buffer.concat(chunks, total).toString('utf8');
}

function createTimeoutController(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const delay = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.floor(Number(timeoutMs))) : DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  let cleared = false;
  const timer = setTimeout(() => controller.abort(), delay);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    controller,
    signal: controller.signal,
    clearTimeout() {
      if (cleared) return;
      cleared = true;
      clearTimeout(timer);
    },
  };
}

function isHtmlContentType(contentType) {
  return /^\s*(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(String(contentType || ''));
}

module.exports = {
  ADAPTER_MARKER,
  ADAPTER_SCRIPT_ID,
  ADAPTER_STYLE_ID,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_REDIRECTS,
  VIEWPORT_META,
  adaptHtml,
  buildAdapterCss,
  buildAdapterScript,
  createTimeoutController,
  isHtmlContentType,
  readResponseBodyWithLimit,
  resolveAdapterTarget,
};

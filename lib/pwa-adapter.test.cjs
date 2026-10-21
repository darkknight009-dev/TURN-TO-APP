'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const adapter = require('./pwa-adapter.cjs');

test('injects a viewport meta tag and adapter resources into an HTML document', () => {
  const html = adapter.adaptHtml(
    '<!doctype html><html><head><title>Target</title></head><body><main>Content</main></body></html>',
    {
      targetUrl: 'https://example.com/start',
      adapterPath: '/pwa/test/adaptive',
    },
  );

  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<base[^>]+href="https:\/\/example\.com\/start"/);
  assert.match(html, /id="pwa-adapter-style"/);
  assert.match(html, /id="pwa-adapter-script"/);
  assert.equal((html.match(/name="viewport"/g) || []).length, 1);
});

test('replaces an existing viewport and keeps adapter injection idempotent', () => {
  const source =
    '<html><head><meta name="viewport" content="initial-scale=1"><style id="pwa-adapter-style">old</style><script id="pwa-adapter-script">old</script></head><body /></html>';
  const html = adapter.adaptHtml(source, { targetUrl: 'https://example.com/' });

  assert.match(html, /width=device-width/);
  assert.equal((html.match(/id="pwa-adapter-style"/g) || []).length, 1);
  assert.equal((html.match(/id="pwa-adapter-script"/g) || []).length, 1);
  assert.equal((html.match(/id="pwa-adapter-base"/g) || []).length, 1);
  assert.doesNotMatch(html, />old</);
});

test('builds responsive CSS and a same-origin navigation script', () => {
  const css = adapter.buildAdapterCss();
  const script = adapter.buildAdapterScript({
    targetUrl: 'https://example.com/app/',
    adapterPath: '/pwa/test/adaptive',
  });

  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /table/);
  assert.match(css, /pre, code/);
  assert.match(css, /input, select, textarea, button/);
  assert.match(css, /pwa-fit-mode/);
  assert.match(script, /data-pwa-adapted/);
  assert.match(script, /classList\.add\(['"]pwa-adapted['"]\)/);
  assert.match(script, /fitFixedLayout/);
  assert.match(script, /searchParams\.set\(['"]url['"]/);
  assert.match(script, /targetOrigin/);
});

test('accepts same-origin adapter targets and rejects cross-origin targets', () => {
  const accepted = adapter.resolveAdapterTarget('https://example.com/start', 'https://example.com/next?tab=2');
  assert.equal(accepted.valid, true);
  assert.equal(accepted.targetUrl, 'https://example.com/next?tab=2');

  const relative = adapter.resolveAdapterTarget('https://example.com/start', '/next');
  assert.equal(relative.valid, false);
  assert.equal(relative.code, 'INVALID_TARGET_URL');

  const rejected = adapter.resolveAdapterTarget('https://example.com/start', 'https://other.com/next');
  assert.equal(rejected.valid, false);
  assert.equal(rejected.code, 'TARGET_ORIGIN_MISMATCH');
});

test('bounds response body reads before returning text', async () => {
  const response = new Response('0123456789', {
    headers: { 'content-type': 'text/html' },
  });

  await assert.rejects(
    adapter.readResponseBodyWithLimit(response, 5),
    (error) => error?.code === 'BODY_TOO_LARGE' && error.limit === 5,
  );
});

test('aborts a timeout controller when its deadline expires', async () => {
  const timeout = adapter.createTimeoutController(10);
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(timeout.signal.aborted, true);
  timeout.clearTimeout();
});

'use strict';

// Run after npm run build. Uses an isolated store, never the user's .env/store.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const JSZip = require('jszip');
const generator = require('./pwa-generator.cjs');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-http-smoke-'));
let server;
let base;
let port;

async function start(storePath) {
  let output = '';
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', MONGODB_URI: '', PWA_STORE_PATH: storePath, PUBLIC_APP_URL: '', NEXT_PUBLIC_APP_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { output = (output + chunk).slice(-10000); });
  server.stderr.on('data', (chunk) => { output = (output + chunk).slice(-10000); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.ok) return;
    } catch { /* Wait for the server to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${output}`);
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  await exited;
}

async function get(url) {
  const response = await fetch(new URL(url, base), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `${new URL(url, base).pathname}: expected 200 without redirects, got ${response.status}`);
  return response;
}

async function generate(file, name) {
  const form = new FormData();
  form.set('url', 'http://example.com/products?view=mobile#details');
  form.set('name', name);
  if (file) form.set('icon', file);
  const response = await fetch(`${base}/api/generate`, { method: 'POST', body: form });
  return { response, result: await response.json() };
}

async function verify(app) {
  const page = await (await get(app.installUrl)).text();
  assert.match(page, new RegExp(app.appName));
  const install = new URL(app.installUrl);
  assert.ok(install.href.length < 2048, 'Icon bytes must never inflate the launch URL');
  const assetUrl = (name) => new URL(`${install.pathname}/${name}${install.search}`, install);
  const manifest = await (await get(assetUrl('manifest.webmanifest'))).json();
  assert.equal(new URL(manifest.start_url, base).href, install.href);
  assert.equal(manifest.scope, install.pathname);
  await (await get(manifest.start_url)).text();
  for (const [index, size] of [192, 512].entries()) {
    const image = Buffer.from(await (await get(manifest.icons[index].src)).arrayBuffer());
    assert.deepEqual(image, app.icons[`icon${size}`], `HTTP ${size}px icon must be the uploaded image`);
  }
  if (app.icons.iconGif) {
    const preview = assetUrl('icon.png');
    preview.searchParams.set('animated', '1');
    const response = await get(preview);
    assert.equal(response.headers.get('Content-Type'), 'image/gif');
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer()), { animated: true }).metadata()).pages, 2);
    assert.match(page, /animated=1/);
  }
  const workerResponse = await get(assetUrl('sw.js'));
  assert.equal(workerResponse.headers.get('Service-Worker-Allowed'), manifest.scope);
  const worker = await workerResponse.text();
  const context = vm.createContext({ self: { addEventListener() {} } });
  vm.runInContext(worker, context);
  for (const url of vm.runInContext('SHELL_ASSETS', context)) await (await get(url)).arrayBuffer();
  const zip = await JSZip.loadAsync(await (await get(app.downloadUrl)).arrayBuffer());
  assert.deepEqual(await zip.file('icon-192.png').async('nodebuffer'), app.icons.icon192);
  assert.deepEqual(await zip.file('icon-512.png').async('nodebuffer'), app.icons.icon512);
  console.log(`${app.appName}: page/start URL/icons/worker/precache/ZIP OK; launch URL ${install.href.length} characters`);
}

async function main() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const storePath = path.join(directory, 'pwas.json');
  await start(storePath);
  const png = await sharp(randomBytes(256 * 256 * 3), { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const gif = Buffer.from('R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQICgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQICgAAACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7', 'base64');
  const apps = [];
  for (const [buffer, type, name] of [[png, 'image/png', 'PNG Smoke'], [gif, 'image/gif', 'GIF Smoke']]) {
    const file = new File([buffer], `icon.${type.split('/')[1]}`, { type });
    const { response, result } = await generate(file, name);
    assert.equal(response.status, 200, JSON.stringify(result));
    apps.push({ ...result, icons: await generator.createIconSet(file) });
  }
  for (const app of apps) await verify(app);
  await stop();
  await start(storePath);
  for (const app of apps) await verify(app);
  console.log('Fresh-process restart: original artwork and launch URLs preserved');
  await stop();
  await start(path.join(directory, 'blocked', 'pwas.json'));
  // Simulate an unwritable store without touching local user files.
  fs.writeFileSync(path.join(directory, 'blocked'), 'not a directory');
  const failed = await generate(new File([png], 'icon.png', { type: 'image/png' }), 'Unsaved');
  assert.equal(failed.response.status, 503);
  assert.equal(failed.result.installUrl, undefined);
  const fallback = await generate(null, 'Fallback');
  assert.equal(fallback.response.status, 200);
  await (await get(fallback.result.installUrl)).text();
  const oldPage = await (await get(apps[0].installUrl)).text();
  assert.match(oldPage, /uploaded icon is unavailable/i);
  console.log('Unavailable storage: uploaded icon rejected clearly; metadata-only page still loads');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await stop();
  fs.rmSync(directory, { recursive: true, force: true });
});

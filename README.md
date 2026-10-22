# PWA Converter

PWA Converter is a Next.js app that turns a public deployed web-app URL into a hosted, installable PWA wrapper and a downloadable ZIP package.

## Product flow

1. Paste a public `http://` or `https://` URL.
2. Give the installable app a name.
3. Optionally upload a PNG, JPG, WebP, GIF, or SVG app icon. Animated GIFs animate on the install page (unless reduced motion is enabled); installed app icons use the first frame as 192px/512px PNGs.
4. Generate a live install route and a ZIP containing the PWA shell, manifest, service worker, and 192px/512px PNG icons.
5. Open the install route on the device where the app should live. Supported browsers can show the native install prompt; the route also includes an Open site fallback.

The hosted route keeps the target URL as the source of truth. Its optional adaptive preview injects a mobile viewport, overflow-safe styles, scrollable tables/code, and a fixed-layout fitting pass. Installed standalone launches navigate directly to the exact original URL instead of depending on an iframe/proxy. Cross-origin navigation may open in a normal browser context; it cannot force an unrelated site to stay inside the converter's standalone scope. The adapter does not copy the target app's assets or bypass its login, CSP, or embedding restrictions.

After installation the primary action stays enabled as **Open app**. The native install event is single-use, but a new event after dismissal/uninstallation is accepted. To reinstall the same app in Brave, uninstall it from the browser's app list, reopen the install link, and reload. To keep multiple independent copies, generate a new package (each conversion gets a new manifest ID).

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm test
npm run check
npm run dev
```

Open `http://localhost:3000`.

For a production-style local run:

```bash
npm run build
npm start
```

Run the isolated production HTTP regression check after building:

```bash
npm run smoke
```

This starts its own temporary server/store, uploads PNG and animated GIF fixtures, verifies actual icon bytes, manifest/start URL, service worker and ZIP, restarts the server, and checks storage failure handling. It never uses the real MongoDB connection or local PWA data. Unit tests also simulate install/dismissal/appinstalled events and offline worker launches; they do not automate Brave's native OS install dialog.

## Architecture

- `app/` — Next.js App Router pages, API routes, and hosted PWA routes.
- `components/ConverterForm.jsx` — client-side URL/name/icon flow and success actions.
- `lib/pwa-generator.cjs` — validation, icon processing, manifest, service worker, and ZIP generation.
- `lib/pwa-store.cjs` — shared MongoDB records when `MONGODB_URI` is configured, with a local JSON fallback at `.data/pwas.json` for local/single-host use.
- `lib/pwa-link.cjs` — canonical public install/download URLs plus a portable state fallback so a generated install link can still resolve when a deployment instance cannot read the store.

## Scope and safety

- Uploaded icons are capped at 5 MB and converted through `sharp`. Animated GIF previews are separately re-encoded, limited to 200 frames / 40 million total pixels, and never used as manifest icons.
- Generated ZIPs are wrapper packages, not full offline mirrors of the target application.
- Generated install/download responses use absolute URLs. Set `PUBLIC_APP_URL` when the app is behind a reverse proxy or its request host is not the public host, for example `https://converter.example`.
- Configure `MONGODB_URI` (and optionally `MONGODB_DB` / `MONGODB_COLLECTION`) for shared multi-instance/serverless storage. Without it, the app uses `.data/pwas.json` on a writable persistent single host. Uploads require a successful durable write: saving failure returns HTTP 503 rather than a success link with the wrong icon.
- For Vercel or another serverless host, add `MONGODB_URI`, `MONGODB_DB`, `MONGODB_COLLECTION`, and `PUBLIC_APP_URL` in that provider's project environment settings for the environment you are deploying (Production/Preview as applicable), then redeploy. The ignored local `.env` file is not uploaded by Git and `.data/pwas.json` is not a durable serverless database.
- Paste the MongoDB URI value itself into the provider field; do not include a second layer of shell quotes. The store accepts surrounding quotes defensively, but a malformed or truncated value will still fail before package generation.
- The project now requires Node `>=20.19.0`, matching the installed MongoDB Node driver. Set the Vercel project runtime to Node 20, 22, or 24 and redeploy; Vercel applies the selected major version to new deployments.
- Hosted links contain bounded metadata only, never image bytes. New uploaded-icon records retain an upload marker; if storage later becomes unavailable, the page explains the problem and installation/download return an explicit error rather than silently substituting artwork. Original-site access remains available.
- Local storage retains at most 100 records and refuses new persistent records at capacity rather than deleting existing installed apps. MongoDB records are no longer automatically evicted. Use deliberate data retention/cleanup in production.
- Manifest launch URL, manifest scope, and service-worker registration use the canonical `/pwa/<id>` path. Worker caches are isolated per app; preview failures cannot prevent worker installation. Navigation is network-first, with a self-contained launch fallback that does not need Next.js chunks if the converter is offline. The original site still needs its own network connection.
- Development installs still depend on that local origin until a worker is installed. For durable use, deploy the converter on an always-available HTTPS origin and keep its shared store configured. Existing installs with oversized legacy launch URLs need to be removed and regenerated; app code cannot repair URLs rejected before reaching the server.
- The server rejects credentials, localhost, loopback, private, and reserved target URLs. Production should also add DNS-resolution checks, rate limiting, and job limits.

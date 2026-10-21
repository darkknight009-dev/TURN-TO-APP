# PWA Converter

PWA Converter is a Next.js app that turns a public deployed web-app URL into a hosted, installable PWA wrapper and a downloadable ZIP package.

## Product flow

1. Paste a public `http://` or `https://` URL.
2. Give the installable app a name.
3. Optionally upload a PNG, JPG, WebP, or SVG app icon.
4. Generate a live install route and a ZIP containing the PWA shell, manifest, service worker, and 192px/512px PNG icons.
5. Open the install route on the device where the app should live. Supported browsers can show the native install prompt; the route also includes an Open site fallback.

The hosted route keeps the target URL as the source of truth and presents it through an adaptive preview route. That route injects a mobile viewport, overflow-safe styles, scrollable tables/code, and a small fixed-layout fitting pass before the page reaches the PWA frame. It is deliberately best-effort: complex applications that depend on origin-bound cookies, strict CSP, or cross-origin API calls can still require the direct Open site action. The adapter does not copy the target app's assets.

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

## Architecture

- `app/` — Next.js App Router pages, API routes, and hosted PWA routes.
- `components/ConverterForm.jsx` — client-side URL/name/icon flow and success actions.
- `lib/pwa-generator.cjs` — validation, icon processing, manifest, service worker, and ZIP generation.
- `lib/pwa-store.cjs` — local JSON-backed records and resized icon buffers for generated install routes. The path defaults to `.data/pwas.json` and can be overridden with `PWA_STORE_PATH`.

## Scope and safety

- The server rejects credentials, localhost, loopback, private, and reserved target URLs.
- Uploaded icons are capped and converted to PNG through `sharp`.
- Generated ZIPs are wrapper packages, not full offline mirrors of the target application.
- The current install-link store is intended for local and single-host use; it survives local server restarts but is not a substitute for shared storage in a serverless production deployment. Production should move records and icon bytes to a shared database/object store, then add DNS-resolution checks, rate limiting, and job limits.

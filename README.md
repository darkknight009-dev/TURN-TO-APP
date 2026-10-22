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
- `lib/pwa-store.cjs` — shared MongoDB records when `MONGODB_URI` is configured, with a local JSON fallback at `.data/pwas.json` for local/single-host use.
- `lib/pwa-link.cjs` — canonical public install/download URLs plus a portable state fallback so a generated install link can still resolve when a deployment instance cannot read the store.

## Scope and safety

- Uploaded icons are capped and converted to PNG through `sharp`.
- Generated ZIPs are wrapper packages, not full offline mirrors of the target application.
- Generated install/download responses use absolute URLs. Set `PUBLIC_APP_URL` when the app is behind a reverse proxy or its request host is not the public host, for example `https://converter.example`.
- Configure `MONGODB_URI` (and optionally `MONGODB_DB` / `MONGODB_COLLECTION`) for shared multi-instance/serverless storage. Without it, the app uses `.data/pwas.json` locally and embeds the essential app metadata in the generated link as a fallback; uploaded icons use the generated fallback icon if the shared store is unavailable.
- The server rejects credentials, localhost, loopback, private, and reserved target URLs. Production should also add DNS-resolution checks, rate limiting, and job limits.

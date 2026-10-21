# PWA Converter

PWA Converter is a Next.js app that turns a public deployed web-app URL into a hosted, installable PWA wrapper and a downloadable ZIP package.

## Product flow

1. Paste a public `http://` or `https://` URL.
2. Give the installable app a name.
3. Optionally upload a PNG, JPG, WebP, or SVG app icon.
4. Generate a live install route and a ZIP containing the PWA shell, manifest, service worker, and 192px/512px PNG icons.
5. Open the install route on the device where the app should live. Supported browsers can show the native install prompt; the route also includes an Open site fallback.

The wrapper keeps the target URL as the source of truth and presents it in a responsive iframe. It does not copy or rewrite the target app's assets. If a target site blocks embedding, the generated route exposes a direct Open site action.

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
- `lib/pwa-store.cjs` — short-lived process-local records for generated install routes.

## Scope and safety

- The server rejects credentials, localhost, loopback, private, and reserved target URLs.
- Uploaded icons are capped and converted to PNG through `sharp`.
- Generated ZIPs are wrapper packages, not full offline mirrors of the target application.
- The current install-link store is process-local and is intended for the first product slice. A production deployment should move records and icon bytes to durable storage, then add DNS-resolution checks, rate limiting, and job limits.

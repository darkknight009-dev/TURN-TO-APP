import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaLink from '../../../../lib/pwa-link.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const { buildHostedServiceWorker } = pwaGenerator;
const { getStateFromRequest, resolvePwaRecord } = pwaLink;
const { getPwa } = pwaStore;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const resolved = await resolvePwaRecord(id, getStateFromRequest(request), getPwa);
  if (!resolved) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  const scope = `/pwa/${encodeURIComponent(String(id))}`;
  return new Response(buildHostedServiceWorker(id, { state: resolved.state, targetUrl: resolved.record.targetUrl, appName: resolved.record.appName }), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': scope,
    },
  });
}

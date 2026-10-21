import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const { buildHostedServiceWorker } = pwaGenerator;
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

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id;
  if (!getPwa(id)) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  const scope = `/pwa/${encodeURIComponent(String(id))}/`;
  return new Response(buildHostedServiceWorker(id), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': scope,
    },
  });
}

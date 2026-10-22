import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaLink from '../../../../lib/pwa-link.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const { buildManifest } = pwaGenerator;
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
  const resolved = await resolvePwaRecord(resolvedParams?.id, getStateFromRequest(request), getPwa);
  if (!resolved) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  return new Response(`${JSON.stringify(buildManifest(resolved.record, { hosted: true, hostedState: resolved.state }), null, 2)}\n`, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  });
}

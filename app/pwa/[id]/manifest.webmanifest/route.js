import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const { buildManifest } = pwaGenerator;
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
  const record = getPwa(resolvedParams?.id);
  if (!record) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  return new Response(`${JSON.stringify(buildManifest(record, { hosted: true }), null, 2)}\n`, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  });
}

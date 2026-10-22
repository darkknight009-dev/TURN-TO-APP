import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaLink from '../../../../lib/pwa-link.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const { createFallbackIcon } = pwaGenerator;
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

  const requestUrl = new URL(request.url);
  const requestedSize = requestUrl.searchParams.get('size');
  const size = requestedSize === '512' || requestedSize === '512x512' ? 512 : 192;
  const icon = size === 512 ? resolved.record.icon512 : resolved.record.icon192;
  const responseIcon = icon || await createFallbackIcon(size);

  return new Response(responseIcon, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(responseIcon.byteLength),
      'Content-Type': 'image/png',
    },
  });
}

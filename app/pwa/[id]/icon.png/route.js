import pwaStore from '../../../../lib/pwa-store.cjs';

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
  const record = getPwa(resolvedParams?.id);
  if (!record) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  const requestUrl = new URL(request.url);
  const requestedSize = requestUrl.searchParams.get('size');
  const icon = requestedSize === '512' || requestedSize === '512x512' ? record.icon512 : record.icon192;
  if (!icon) return jsonResponse({ error: 'PWA icon is unavailable.', message: 'PWA icon is unavailable.' }, 404);

  return new Response(icon, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(icon.byteLength),
      'Content-Type': 'image/png',
    },
  });
}

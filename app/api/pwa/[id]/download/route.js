import pwaGenerator from '../../../../../lib/pwa-generator.cjs';
import pwaLink from '../../../../../lib/pwa-link.cjs';
import pwaStore from '../../../../../lib/pwa-store.cjs';

const { createIconSet, generatePwaZip, toSafeFilename } = pwaGenerator;
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

async function getRouteId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

export async function GET(request, { params }) {
  const id = await getRouteId(params);
  const resolved = await resolvePwaRecord(id, getStateFromRequest(request), getPwa);
  if (!resolved) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

  let record = resolved.record;

  if (!record.icon192 || !record.icon512) {
    try {
      const icons = await createIconSet(null);
      record = { ...record, icon192: icons.icon192, icon512: icons.icon512 };
    } catch (error) {
      return jsonResponse(
        { error: error?.message || 'Unable to create the fallback PWA icon.', message: error?.message || 'Unable to create the fallback PWA icon.' },
        500,
      );
    }
  }

  let archive;
  try {
    archive = await generatePwaZip(record);
  } catch (error) {
    return jsonResponse(
      { error: error?.message || 'Unable to generate the PWA download.', message: error?.message || 'Unable to generate the PWA download.' },
      error?.code === 'JSZIP_UNAVAILABLE' ? 500 : 400
    );
  }

  const filename = `${toSafeFilename(record.appName)}-pwa.zip`;
  return new Response(archive, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(archive.byteLength),
      'Content-Type': 'application/zip',
      'X-PWA-Name': toSafeFilename(record.appName).replace(/-/g, ' '),
    },
  });
}

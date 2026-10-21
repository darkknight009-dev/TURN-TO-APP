import pwaGenerator from '../../../../../lib/pwa-generator.cjs';
import pwaStore from '../../../../../lib/pwa-store.cjs';

const { generatePwaZip, toSafeFilename } = pwaGenerator;
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

export async function GET(_request, { params }) {
  const id = await getRouteId(params);
  const record = getPwa(id);
  if (!record) return jsonResponse({ error: 'PWA not found.', message: 'PWA not found.' }, 404);

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

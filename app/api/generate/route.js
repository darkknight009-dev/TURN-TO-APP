import pwaGenerator from '../../../lib/pwa-generator.cjs';
import pwaLink from '../../../lib/pwa-link.cjs';
import pwaStore from '../../../lib/pwa-store.cjs';

const {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_THEME_COLOR,
  createIconSet,
  deriveAppName,
  normalizeHexColor,
  sanitizeAppName,
  validateTargetUrl,
} = pwaGenerator;
const { buildPublicPwaUrl, encodePwaState } = pwaLink;
const { createPwa } = pwaStore;

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

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message, message }, status);
}

function isFileLike(value) {
  return Boolean(value && typeof value.arrayBuffer === 'function');
}

function isEmptyFileField(value) {
  return isFileLike(value) && Number(value.size) === 0 && !String(value.name || '').trim();
}

function getTextField(getValue, name) {
  const value = getValue(name);
  if (value == null || value === '') return '';
  return typeof value === 'string' ? value.trim() : null;
}

async function readRequestFields(request) {
  const contentType = request.headers?.get?.('content-type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    const body = await request.json();
    const values = body && typeof body === 'object' ? body : {};
    return {
      getValue(name) {
        if (name === 'name' && (values.name == null || values.name === '')) return values.appName;
        return values[name];
      },
      icon: null,
    };
  }

  const formData = await request.formData();
  return {
    getValue(name) {
      const value = formData.get(name);
      if (name === 'name' && (value == null || value === '')) return formData.get('appName');
      return value;
    },
    icon: formData.get('icon'),
  };
}

function getIconError(error) {
  switch (error?.code) {
    case 'ICON_TOO_LARGE':
      return { status: 413, message: error.message };
    case 'UNSUPPORTED_ICON_TYPE':
    case 'INVALID_ICON':
      return { status: 415, message: error.message };
    case 'SHARP_UNAVAILABLE':
      return { status: 500, message: error.message };
    default:
      return { status: 400, message: error?.message || 'Unable to process the icon.' };
  }
}

export async function POST(request) {
  let fields;
  try {
    fields = await readRequestFields(request);
  } catch {
    return errorResponse('Request body must be multipart FormData with a URL and name.', 400);
  }

  const urlValue = getTextField(fields.getValue, 'url');
  if (urlValue === null || !urlValue) {
    return errorResponse('Enter a target URL.');
  }

  const validation = validateTargetUrl(urlValue);
  if (!validation.valid) return errorResponse(validation.error, 400);

  const nameValue = getTextField(fields.getValue, 'name');
  if (nameValue === null) return errorResponse('The name field must be text.');
  if (!nameValue) return errorResponse('Enter an app name.');

  const appName = sanitizeAppName(nameValue) || deriveAppName(validation.url);
  const iconValue = fields.icon;
  let iconFile = null;

  if (iconValue != null && iconValue !== '' && !isEmptyFileField(iconValue)) {
    if (!isFileLike(iconValue)) return errorResponse('The icon field must be an image file.');
    iconFile = iconValue;
  }

  let icons;
  try {
    icons = await createIconSet(iconFile);
  } catch (error) {
    const result = getIconError(error);
    return errorResponse(result.message, result.status);
  }

  const hasUploadedIcon = icons.source === 'upload';
  let record;
  try {
    record = await createPwa(
      {
        targetUrl: validation.url,
        appName,
        shortName: getTextField(fields.getValue, 'shortName') || appName,
        themeColor: normalizeHexColor(getTextField(fields.getValue, 'themeColor'), DEFAULT_THEME_COLOR),
        backgroundColor: normalizeHexColor(
          getTextField(fields.getValue, 'backgroundColor'),
          DEFAULT_BACKGROUND_COLOR
        ),
        icon192: icons.icon192,
        icon512: icons.icon512,
      },
      { allowVolatile: true },
    );
  } catch (error) {
    const status = error?.code?.startsWith?.('PWA_STORE_') ? 503 : 500;
    return errorResponse(error?.message || 'Unable to persist the generated PWA.', status);
  }

  let state;
  try {
    state = encodePwaState(record, { includeIcons: hasUploadedIcon });
  } catch (error) {
    if (error?.code === 'PWA_STATE_TOO_LARGE') {
      if (record.volatile) {
        return errorResponse(
          'The uploaded icon is too large to carry in a stateless install link. Configure a shared PWA store and try again.',
          413,
        );
      }

      // A persisted record does not need to put large binary icon data in the
      // URL. Its hosted routes can read the PNGs back from the store.
      state = encodePwaState(record);
    } else {
      return errorResponse(error?.message || 'Unable to create the install link.', 500);
    }
  }

  return jsonResponse({
    id: record.id,
    appName: record.appName,
    installUrl: buildPublicPwaUrl(request, `/pwa/${encodeURIComponent(record.id)}`, state),
    downloadUrl: buildPublicPwaUrl(request, `/api/pwa/${encodeURIComponent(record.id)}/download`, state),
  });
}

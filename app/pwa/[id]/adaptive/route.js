import pwaAdapter from '../../../../lib/pwa-adapter.cjs';
import pwaGenerator from '../../../../lib/pwa-generator.cjs';
import pwaLink from '../../../../lib/pwa-link.cjs';
import pwaStore from '../../../../lib/pwa-store.cjs';

const {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_REDIRECTS,
  adaptHtml,
  createTimeoutController,
  isHtmlContentType,
  readResponseBodyWithLimit,
  resolveAdapterTarget,
} = pwaAdapter;
const { validateTargetUrl } = pwaGenerator;
const { getStateFromRequest, resolvePwaRecord } = pwaLink;
const { getPwa } = pwaStore;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

function fallbackDocument(title, message, detail = '') {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeDetail = detail ? `<p class="pwa-adapter-detail">${escapeHtml(detail)}</p>` : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { box-sizing: border-box; min-width: 0; max-width: 100%; margin: 0; padding: clamp(1.25rem, 5vw, 4rem); line-height: 1.5; }
      main { width: min(100%, 42rem); margin: 0 auto; }
      h1 { margin-top: 0; font-size: clamp(1.5rem, 6vw, 2.25rem); }
      p { overflow-wrap: anywhere; }
      .pwa-adapter-detail { opacity: .75; font-size: .9rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      ${safeDetail}
    </main>
  </body>
</html>`;
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-PWA-Adapter': 'responsive',
    },
  });
}

function routeError(code, message, status = 502, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function getHeader(response, name) {
  return response?.headers?.get?.(name) || '';
}

function isHttpError(response) {
  const status = Number(response?.status || 0);
  return status >= 400 || response?.ok === false;
}

async function fetchTargetHtml(
  startUrl,
  {
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = {},
) {
  const timeout = createTimeoutController(timeoutMs);
  let currentUrl = startUrl;
  let redirects = 0;

  try {
    while (true) {
      const currentValidation = validateTargetUrl(currentUrl);
      if (!currentValidation.valid) {
        throw routeError('INVALID_FINAL_TARGET_URL', currentValidation.error, 502);
      }

      let response;
      try {
        response = await fetch(currentValidation.url, {
          cache: 'no-store',
          redirect: 'manual',
          signal: timeout.signal,
          headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          },
        });
      } catch (error) {
        if (timeout.signal.aborted) {
          throw routeError('TARGET_TIMEOUT', 'The target site took too long to respond.', 504, error);
        }
        throw routeError('TARGET_FETCH_FAILED', 'The target site could not be fetched for this preview.', 502, error);
      }

      const status = Number(response?.status || 0);
      const location = getHeader(response, 'location');
      if (REDIRECT_STATUSES.has(status) && location) {
        try {
          await response?.body?.cancel?.();
        } catch {
          // Redirect bodies are not part of the preview; cancellation is best effort.
        }

        if (redirects >= maxRedirects) {
          throw routeError('TARGET_TOO_MANY_REDIRECTS', 'The target site redirected too many times.', 502);
        }

        let redirectedUrl;
        try {
          redirectedUrl = new URL(location, currentValidation.url).toString();
        } catch (error) {
          throw routeError('INVALID_REDIRECT_URL', 'The target site returned an invalid redirect URL.', 502, error);
        }

        const redirectedValidation = validateTargetUrl(redirectedUrl);
        if (!redirectedValidation.valid) {
          throw routeError(
            'INVALID_FINAL_TARGET_URL',
            'The target site redirected to a private or unsupported address.',
            502,
          );
        }

        currentUrl = redirectedValidation.url;
        redirects += 1;
        continue;
      }

      const finalUrl = response?.url || currentValidation.url;
      const finalValidation = validateTargetUrl(finalUrl);
      if (!finalValidation.valid) {
        throw routeError(
          'INVALID_FINAL_TARGET_URL',
          'The target site resolved to a private or unsupported address.',
          502,
        );
      }

      if (isHttpError(response)) {
        throw routeError(
          'TARGET_HTTP_ERROR',
          `The target site returned HTTP ${status || 'an error'}.`,
          502,
        );
      }

      const contentType = getHeader(response, 'content-type');
      if (!isHtmlContentType(contentType)) {
        throw routeError(
          'TARGET_NOT_HTML',
          'The target did not return an HTML document for this preview.',
          415,
          new Error(contentType ? `Content-Type: ${contentType}` : 'Content-Type was missing.'),
        );
      }

      let body;
      try {
        body = await readResponseBodyWithLimit(response, maxBodyBytes);
      } catch (error) {
        if (timeout.signal.aborted) {
          throw routeError('TARGET_TIMEOUT', 'The target site took too long to respond.', 504, error);
        }
        if (error?.code === 'BODY_TOO_LARGE') throw error;
        throw routeError('TARGET_FETCH_FAILED', 'The target HTML could not be read.', 502, error);
      }

      return { body, finalUrl: finalValidation.url };
    }
  } finally {
    timeout.clearTimeout();
  }
}

function fallbackForError(error) {
  switch (error?.code) {
    case 'BODY_TOO_LARGE':
      return {
        status: 413,
        title: 'Preview is too large',
        message: `The target HTML is larger than the ${Math.round(DEFAULT_MAX_BODY_BYTES / 1024 / 1024)} MB hosted preview limit.`,
      };
    case 'TARGET_TIMEOUT':
      return { status: 504, title: 'Preview timed out', message: error.message };
    case 'TARGET_NOT_HTML':
      return { status: 415, title: 'HTML preview unavailable', message: error.message };
    case 'TARGET_ORIGIN_MISMATCH':
      return { status: 400, title: 'Target navigation rejected', message: error.message };
    case 'INVALID_TARGET_URL':
    case 'PRIVATE_TARGET_URL':
      return { status: 400, title: 'Target URL rejected', message: error.message };
    case 'TARGET_HTTP_ERROR':
      return { status: 502, title: 'Target site returned an error', message: error.message };
    case 'INVALID_FINAL_TARGET_URL':
    case 'INVALID_REDIRECT_URL':
      return { status: 502, title: 'Target redirect rejected', message: error.message };
    case 'TARGET_TOO_MANY_REDIRECTS':
      return { status: 502, title: 'Target redirect unavailable', message: error.message };
    default:
      return {
        status: 502,
        title: 'Preview unavailable',
        message: error?.message || 'The target site could not be loaded for this preview.',
      };
  }
}

async function getRouteId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

export async function GET(request, { params }) {
  const id = await getRouteId(params);
  const resolved = await resolvePwaRecord(id, getStateFromRequest(request), getPwa);
  if (!resolved) {
    return htmlResponse(
      fallbackDocument('PWA preview not found', 'The generated PWA record is unavailable or has expired.'),
      404,
    );
  }
  if (!resolved.persisted) {
    return htmlResponse(
      fallbackDocument(
        'Adaptive preview unavailable',
        'The hosted page is available, but its responsive server preview needs the generated record store.',
      ),
      503,
    );
  }
  const record = resolved.record;

  const requestUrl = new URL(request.url);
  const requestedUrl = requestUrl.searchParams.get('url');
  const resolvedTarget = resolveAdapterTarget(record.targetUrl, requestedUrl);
  if (!resolvedTarget.valid) {
    return htmlResponse(
      fallbackDocument('Target navigation rejected', resolvedTarget.error),
      400,
    );
  }

  try {
    const fetched = await fetchTargetHtml(resolvedTarget.targetUrl);
    const adapterPath = `/pwa/${encodeURIComponent(String(record.id))}/adaptive`;
    const adapted = adaptHtml(fetched.body, {
      targetUrl: fetched.finalUrl,
      allowedOrigin: resolvedTarget.originalOrigin,
      adapterPath,
    });
    return htmlResponse(adapted, 200);
  } catch (error) {
    const fallback = fallbackForError(error);
    return htmlResponse(fallbackDocument(fallback.title, fallback.message), fallback.status);
  }
}

import { notFound } from 'next/navigation';

import pwaLink from '../../../lib/pwa-link.cjs';
import pwaStore from '../../../lib/pwa-store.cjs';
import PwaRuntime from './PwaRuntime.jsx';

const { getStateFromSearchParams, resolvePwaRecord, withPwaState } = pwaLink;
const { getPwa } = pwaStore;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

export async function generateMetadata({ params, searchParams }) {
  const id = await resolveId(params);
  const resolvedSearchParams = (await searchParams) || {};
  const resolved = await resolvePwaRecord(id, getStateFromSearchParams(resolvedSearchParams), getPwa);
  if (!resolved) return { title: 'PWA not found' };

  const basePath = `/pwa/${encodeURIComponent(String(id))}`;
  const state = resolved.state;
  return {
    title: resolved.record.appName,
    description: `Installable wrapper for ${resolved.record.targetUrl}`,
    manifest: withPwaState(`${basePath}/manifest.webmanifest`, state),
    icons: {
      icon: withPwaState(`${basePath}/icon.png`, state, { size: 192 }),
      apple: withPwaState(`${basePath}/icon.png`, state, { size: 192 }),
    },
  };
}

export async function generateViewport({ params, searchParams }) {
  const id = await resolveId(params);
  const resolvedSearchParams = (await searchParams) || {};
  const resolved = await resolvePwaRecord(id, getStateFromSearchParams(resolvedSearchParams), getPwa);
  return {
    themeColor: resolved?.record.themeColor || '#6757D9',
  };
}

export default async function PwaPage({ params, searchParams }) {
  const id = await resolveId(params);
  const resolvedSearchParams = (await searchParams) || {};
  const resolved = await resolvePwaRecord(id, getStateFromSearchParams(resolvedSearchParams), getPwa);
  if (!resolved) notFound();

  const basePath = `/pwa/${encodeURIComponent(String(id))}`;
  const state = resolved.state;
  return (
    <>
      <link rel="manifest" href={withPwaState(`${basePath}/manifest.webmanifest`, state)} />
      <link rel="icon" href={withPwaState(`${basePath}/icon.png`, state, { size: 192 })} type="image/png" />
      <PwaRuntime
        id={resolved.record.id}
        appName={resolved.record.appName}
        targetUrl={resolved.record.targetUrl}
        state={state}
        animatedIcon={Boolean(resolved.record.iconGif)}
        iconUnavailable={resolved.record.iconSource === 'upload' && (!resolved.record.icon192 || !resolved.record.icon512)}
        adaptiveUrl={resolved.persisted ? withPwaState(`${basePath}/adaptive`, state) : ''}
      />
    </>
  );
}

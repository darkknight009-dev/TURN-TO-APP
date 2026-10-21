import { notFound } from 'next/navigation';

import pwaStore from '../../../lib/pwa-store.cjs';
import PwaRuntime from './PwaRuntime.jsx';

const { getPwa } = pwaStore;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

export async function generateMetadata({ params }) {
  const id = await resolveId(params);
  const record = getPwa(id);
  if (!record) return { title: 'PWA not found' };

  const basePath = `/pwa/${encodeURIComponent(String(id))}`;
  return {
    title: record.appName,
    description: `Installable wrapper for ${record.targetUrl}`,
    manifest: `${basePath}/manifest.webmanifest`,
    icons: {
      icon: `${basePath}/icon.png?size=192`,
    },
  };
}

export async function generateViewport({ params }) {
  const id = await resolveId(params);
  const record = getPwa(id);
  return {
    themeColor: record?.themeColor || '#6757D9',
  };
}

export default async function PwaPage({ params }) {
  const id = await resolveId(params);
  const record = getPwa(id);
  if (!record) notFound();

  const basePath = `/pwa/${encodeURIComponent(String(id))}`;
  return (
    <>
      <link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
      <link rel="icon" href={`${basePath}/icon.png?size=192`} type="image/png" />
      <PwaRuntime
        id={record.id}
        appName={record.appName}
        targetUrl={record.targetUrl}
        adaptiveUrl={`${basePath}/adaptive`}
      />
    </>
  );
}

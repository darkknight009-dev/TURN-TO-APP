'use client';

import { useEffect, useMemo, useState } from 'react';

export default function PwaRuntime({ id, appName, targetUrl }) {
  const basePath = useMemo(() => `/pwa/${encodeURIComponent(String(id || ''))}`, [id]);
  const scopePath = `${basePath}/`;
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState('checking');
  const [runtimeMessage, setRuntimeMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: scopePath }).catch(() => {
        if (!cancelled) {
          setRuntimeMessage('The wrapper is still usable, but offline shell caching is unavailable in this browser.');
        }
      });
    } else {
      setRuntimeMessage('This browser does not support service workers, so install and offline features are unavailable.');
    }

    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) setInstallStatus('installed');

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setInstallStatus('available');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstallStatus('installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const timeout = window.setTimeout(() => {
      setInstallStatus((current) => (current === 'checking' ? 'unavailable' : current));
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [basePath, scopePath]);

  async function handleInstall() {
    if (!deferredPrompt) return;

    const promptEvent = deferredPrompt;
    setDeferredPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setInstallStatus(choice?.outcome === 'accepted' ? 'installed' : 'unavailable');
    } catch {
      setInstallStatus('unavailable');
    }
  }

  const installMessage =
    installStatus === 'checking'
      ? 'Checking whether this browser can install the app…'
      : installStatus === 'available'
        ? 'This page is ready to install as an app.'
        : installStatus === 'installed'
          ? 'This app is installed in the browser.'
          : 'Install is not available here yet. Use your browser menu when it offers “Install app”.';

  return (
    <>
      <main className="pwa-runtime">
        <header className="pwa-header">
          <div>
            <p className="pwa-eyebrow">Progressive Web App</p>
            <h1>{appName}</h1>
          </div>
          <div className="pwa-actions">
            <button
              className="pwa-install-button"
              type="button"
              onClick={handleInstall}
              disabled={installStatus !== 'available'}
            >
              {installStatus === 'installed' ? 'Installed' : 'Install app'}
            </button>
            <a className="pwa-open-link" href={targetUrl} target="_blank" rel="noopener noreferrer">
              Open site
            </a>
          </div>
        </header>

        <p className="pwa-status" role="status" aria-live="polite">
          {installMessage}
          {runtimeMessage ? ` ${runtimeMessage}` : ''}
        </p>

        <section className="pwa-frame-card" aria-label="Embedded site">
          <iframe
            className="pwa-frame"
            title={appName}
            src={targetUrl}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; clipboard-read; clipboard-write"
          />
        </section>

        <p className="pwa-fallback">
          If this site blocks embedding or does not load, use{' '}
          <a href={targetUrl} target="_blank" rel="noopener noreferrer">
            Open site
          </a>{' '}
          to continue in a browser tab.
        </p>
        <noscript className="pwa-fallback">Enable JavaScript to register the service worker and use the install button.</noscript>
      </main>

      <style>{`
        .pwa-runtime {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: min(100%, 1280px);
          min-height: 100vh;
          margin: 0 auto;
          padding: clamp(1rem, 3vw, 2rem);
          color: #e2e8f0;
          background: radial-gradient(circle at top, #172554 0, #020617 58%);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .pwa-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .pwa-eyebrow {
          margin: 0 0 .25rem;
          color: #7dd3fc;
          font-size: .75rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .pwa-runtime h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2.5rem); }

        .pwa-actions { display: flex; align-items: center; gap: .65rem; }

        .pwa-install-button,
        .pwa-open-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #38bdf8;
          border-radius: 999px;
          padding: .65rem 1rem;
          color: #e0f2fe;
          background: #0c4a6e;
          font: inherit;
          font-weight: 700;
          text-decoration: none;
        }

        .pwa-install-button { border-color: #99f6e4; background: #115e59; cursor: pointer; }
        .pwa-install-button:disabled { cursor: not-allowed; opacity: .62; }
        .pwa-open-link:hover, .pwa-open-link:focus-visible { background: #0369a1; }

        .pwa-status,
        .pwa-fallback {
          margin: 0;
          color: #94a3b8;
          font-size: .9rem;
          line-height: 1.5;
        }

        .pwa-fallback a { color: #7dd3fc; }

        .pwa-frame-card {
          flex: 1;
          min-height: min(72vh, 900px);
          overflow: hidden;
          border: 1px solid #334155;
          border-radius: 1rem;
          background: #f8fafc;
          box-shadow: 0 1.5rem 4rem rgb(2 6 23 / 35%);
        }

        .pwa-frame {
          display: block;
          width: 100%;
          height: 100%;
          min-height: min(72vh, 900px);
          border: 0;
          background: white;
        }

        @media (max-width: 640px) {
          .pwa-header { align-items: flex-start; flex-direction: column; }
          .pwa-actions { width: 100%; }
          .pwa-install-button, .pwa-open-link { flex: 1; text-align: center; }
        }
      `}</style>
    </>
  );
}

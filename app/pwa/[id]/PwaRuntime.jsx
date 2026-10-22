'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';

import styles from './PwaRuntime.module.css';

function withState(pathname, state, params = {}) {
  const url = new URL(pathname, 'https://pwa-runtime.invalid');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  if (state) url.searchParams.set('state', String(state));
  return `${url.pathname}${url.search}`;
}

function ArrowUpRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M5 13 13 5" />
      <path d="M7 5h6v6" />
    </svg>
  );
}

function InstallIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 2v9" />
      <path d="m5.5 7.5 3.5 3.5 3.5-3.5" />
      <path d="M3 13.5v1.25A1.25 1.25 0 0 0 4.25 16h9.5A1.25 1.25 0 0 0 15 14.75V13.5" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path d="m4 9.5 3.2 3.2L14 6" />
    </svg>
  );
}

function getHost(value) {
  if (!value) return 'live site';

  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return String(value).replace(/^https?:\/\//, '').split('/')[0] || 'live site';
  }
}

export default function PwaRuntime({ id, appName, targetUrl, state, adaptiveUrl }) {
  const displayName = String(appName || 'Hosted app');
  const liveUrl = targetUrl || 'about:blank';
  const adaptiveSource = adaptiveUrl || '';
  const hasAdaptivePreview = Boolean(adaptiveSource);
  const basePath = useMemo(() => `/pwa/${encodeURIComponent(String(id || ''))}`, [id]);
  const scopePath = `${basePath}/`;
  const iconUrl = withState(`${basePath}/icon.png`, state, { size: 192 });
  const liveHost = useMemo(() => getHost(targetUrl), [targetUrl]);
  const adaptiveHost = useMemo(() => getHost(adaptiveSource), [adaptiveSource]);
  const appInitial = displayName.trim().slice(0, 1).toUpperCase() || 'A';
  const runtimeId = String(id || 'runtime').slice(0, 22);
  const rootRef = useRef(null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState('checking');
  const [installHintVisible, setInstallHintVisible] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [previewMode, setPreviewMode] = useState(() => (hasAdaptivePreview ? 'adaptive' : 'original'));

  useEffect(() => {
    setPreviewMode((current) => (current === 'adaptive' && hasAdaptivePreview ? current : hasAdaptivePreview ? 'adaptive' : 'original'));
  }, [hasAdaptivePreview]);

  useEffect(() => {
    let cancelled = false;

    setDeferredPrompt(null);
    setInstallStatus('checking');
    setInstallHintVisible(false);
    setRuntimeMessage('');

    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

    if (isStandalone) setInstallStatus('installed');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(withState(`${basePath}/sw.js`, state), { scope: scopePath }).catch(() => {
        if (!cancelled) {
          setRuntimeMessage('Install metadata could not be registered here, but preview and live-site access are still available.');
        }
      });
    } else {
      setRuntimeMessage('This browser does not support service workers. Use the live-site action to continue browsing.');
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (!cancelled && !isStandalone) {
        setDeferredPrompt(event);
        setInstallStatus('available');
        setInstallHintVisible(false);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstallStatus('installed');
      setInstallHintVisible(false);
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
  }, [basePath, scopePath, state]);

  useLayoutEffect(() => {
    const scope = rootRef.current;
    if (!scope) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      scope.dataset.motion = 'reduced';
      return undefined;
    }

    const hoverCleanups = [];
    const context = gsap.context(() => {
      const enterItems = gsap.utils.toArray('[data-pwa-enter]', scope);
      gsap.fromTo(
        enterItems,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          clearProps: 'opacity,transform',
          duration: 0.78,
          ease: 'power3.out',
          stagger: 0.065,
        },
      );

      const stage = scope.querySelector('[data-pwa-stage]');
      if (stage) {
        gsap.fromTo(
          stage,
          { autoAlpha: 0, scale: 0.985, y: 20 },
          { autoAlpha: 1, scale: 1, y: 0, duration: 1, delay: 0.18, ease: 'power3.out', clearProps: 'opacity,transform' },
        );
      }
    }, scope);

    scope.querySelectorAll('[data-pwa-hover]').forEach((element) => {
      const xTo = gsap.quickTo(element, 'x', { duration: 0.36, ease: 'power3.out' });
      const yTo = gsap.quickTo(element, 'y', { duration: 0.36, ease: 'power3.out' });

      const onMove = (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        const bounds = element.getBoundingClientRect();
        xTo((event.clientX - (bounds.left + bounds.width / 2)) * 0.08);
        yTo((event.clientY - (bounds.top + bounds.height / 2)) * 0.12);
      };

      const onLeave = () => {
        xTo(0);
        yTo(0);
      };

      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerleave', onLeave);
      hoverCleanups.push(() => {
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerleave', onLeave);
      });
    });

    return () => {
      hoverCleanups.forEach((cleanup) => cleanup());
      context.revert();
    };
  }, []);

  async function handleInstall() {
    if (installStatus === 'installed') return;

    if (!deferredPrompt) {
      setInstallStatus('unavailable');
      setInstallHintVisible(true);
      return;
    }

    const promptEvent = deferredPrompt;
    setDeferredPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      const accepted = choice?.outcome === 'accepted';
      setInstallStatus(accepted ? 'installed' : 'unavailable');
      setInstallHintVisible(!accepted);
    } catch {
      setInstallStatus('unavailable');
      setInstallHintVisible(true);
    }
  }

  const activeMode = previewMode === 'adaptive' && hasAdaptivePreview ? 'adaptive' : 'original';
  const previewUrl = activeMode === 'adaptive' ? adaptiveSource : liveUrl;
  const installCopy =
    installStatus === 'checking'
      ? {
          title: 'Checking install availability',
          detail: 'We are checking whether this browser exposes a one-tap install prompt.',
          short: 'Checking browser support',
        }
      : installStatus === 'available'
        ? {
            title: 'Ready to install',
            detail: 'This browser can add the hosted experience to your app library or home screen.',
            short: 'Install prompt ready',
          }
        : installStatus === 'installed'
          ? {
              title: 'Already installed',
              detail: 'You are viewing the installed hosted experience in its app window.',
              short: 'Installed in this browser',
            }
          : {
              title: 'Use your browser menu to install',
              detail: 'This browser has not exposed a one-tap prompt. Look for “Install app” or “Add to Home Screen”.',
              short: 'Prompt unavailable here',
            };
  const installButtonLabel =
    installStatus === 'available'
      ? 'Install app'
      : installStatus === 'installed'
        ? 'Installed'
        : 'Install options';
  const installProgress =
    installStatus === 'checking' ? 42 : installStatus === 'available' ? 76 : installStatus === 'installed' ? 100 : 24;
  const statusOrbClass =
    installStatus === 'available'
      ? styles.installOrbReady
      : installStatus === 'installed'
        ? styles.installOrbInstalled
        : installStatus === 'checking'
          ? styles.installOrbChecking
          : styles.installOrbUnavailable;

  return (
    <main ref={rootRef} className={styles.runtime}>
      <div className={styles.shell}>
        <header className={styles.topbar} data-pwa-enter>
          <a className={styles.brand} href="/" aria-label="PWA Converter home">
            <span className={styles.brandMark}>
              pwa<span className={styles.brandDot}>.</span>
            </span>
            <span className={styles.brandLabel}>hosted experience</span>
          </a>
          <div className={styles.topbarMeta} aria-label="Hosted page status">
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              Live preview
            </span>
            <span className={styles.topbarId}>/{runtimeId}</span>
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="pwa-runtime-title">
          <div className={styles.heroGrid}>
            <div className={styles.identity} data-pwa-enter>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowIndex}>01</span>
                Progressive web app
              </p>

              <div className={styles.identityRow}>
                <div className={styles.appIcon} aria-hidden="true">
                  <span className={styles.appIconFallback}>{appInitial}</span>
                  <img src={iconUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                </div>
                <div className={styles.identityCopy}>
                  <p className={styles.identityLabel}>A considered way in</p>
                  <h1 id="pwa-runtime-title">{displayName}</h1>
                  <p className={styles.identityDescription}>
                    A polished install surface for <strong>{liveHost}</strong>. Preview the experience here, then open the live site whenever you are ready.
                  </p>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button
                  className={`${styles.primaryAction} ${styles.hoverTarget}`}
                  type="button"
                  onClick={handleInstall}
                  disabled={installStatus === 'installed'}
                  aria-describedby="install-status"
                  data-pwa-hover
                >
                  {installStatus === 'installed' ? <CheckIcon className={styles.actionIcon} /> : <InstallIcon className={styles.actionIcon} />}
                  <span>{installButtonLabel}</span>
                  {installStatus === 'available' && <span className={styles.actionArrow}>↗</span>}
                </button>
                <a
                  className={`${styles.secondaryAction} ${styles.hoverTarget}`}
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-pwa-hover
                >
                  <span>Open live site</span>
                  <ArrowUpRightIcon className={styles.actionIcon} />
                </a>
              </div>

              <div className={styles.identityMeta}>
                <span><span className={styles.metaMark} /> Live URL</span>
                <span>{liveHost}</span>
                <span className={styles.metaDivider} />
                <span>{hasAdaptivePreview ? 'Adaptive route ready' : 'Original route ready'}</span>
              </div>
            </div>

            <aside className={styles.installPanel} data-pwa-enter aria-labelledby="install-panel-title">
              <div className={styles.panelHeader}>
                <p className={styles.panelKicker}>
                  <span className={styles.panelDot} aria-hidden="true" />
                  Install readiness
                </p>
                <span className={styles.panelCode}>02 / 03</span>
              </div>

              <div className={styles.installPanelBody}>
                <div className={`${styles.installOrb} ${statusOrbClass}`} aria-hidden="true">
                  {installStatus === 'installed' ? <CheckIcon className={styles.orbIcon} /> : <InstallIcon className={styles.orbIcon} />}
                </div>
                <div>
                  <p className={styles.installLabel}>Browser signal</p>
                  <h2 id="install-panel-title" className={styles.installTitle}>{installCopy.title}</h2>
                  <p className={styles.installDetail}>{installCopy.detail}</p>
                </div>
              </div>

              <div className={styles.progressTrack} aria-hidden="true">
                <span style={{ width: `${installProgress}%` }} />
              </div>
              <div className={styles.panelFooter}>
                <span id="install-status" role="status" aria-live="polite">{installCopy.short}</span>
                <span>{installStatus === 'installed' ? '100%' : 'browser check'}</span>
              </div>

              {runtimeMessage && <p className={styles.runtimeMessage}>{runtimeMessage}</p>}
              {installHintVisible && installStatus !== 'installed' && (
                <p className={styles.installHint}>
                  Open the browser menu and choose its install or home-screen option when it is available.
                </p>
              )}
            </aside>
          </div>
        </section>

        <section className={styles.previewSection} aria-labelledby="preview-title">
          <div className={styles.previewHeading} data-pwa-enter>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowIndex}>02</span>
                Preview surface
              </p>
              <h2 id="preview-title">See it in context<span className={styles.headingAccent}>.</span></h2>
            </div>
            <p className={styles.previewDescription}>
              The adaptive route adds a real mobile viewport and fits fixed desktop layouts when needed. The original live site stays one click away.
            </p>
          </div>

          <div className={styles.previewWorkspace}>
            <aside className={styles.previewRail} data-pwa-enter aria-label="Preview controls">
              <div className={styles.railHeader}>
                <span className={styles.railKicker}>View source</span>
                <span className={styles.railIndex}>02.1</span>
              </div>

              <div className={styles.previewTabs} role="tablist" aria-label="Choose preview source">
                <button
                  className={styles.previewTab}
                  type="button"
                  role="tab"
                  aria-selected={activeMode === 'adaptive'}
                  aria-controls="pwa-preview-frame"
                  disabled={!hasAdaptivePreview}
                  onClick={() => setPreviewMode('adaptive')}
                >
                  <span className={styles.tabTopline}>
                    <span>Adaptive preview</span>
                    <span className={styles.tabIndicator} aria-hidden="true" />
                  </span>
                  <span className={styles.tabMeta}>{hasAdaptivePreview ? 'Recommended' : 'Not supplied'}</span>
                </button>
                <button
                  className={styles.previewTab}
                  type="button"
                  role="tab"
                  aria-selected={activeMode === 'original'}
                  aria-controls="pwa-preview-frame"
                  onClick={() => setPreviewMode('original')}
                >
                  <span className={styles.tabTopline}>
                    <span>Original site</span>
                    <span className={styles.tabIndicator} aria-hidden="true" />
                  </span>
                  <span className={styles.tabMeta}>Live URL</span>
                </button>
              </div>

              <div className={styles.railDivider} />
              <dl className={styles.previewFacts}>
                <div>
                  <dt>Current view</dt>
                  <dd>{activeMode === 'adaptive' ? 'Adaptive' : 'Original'}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{activeMode === 'adaptive' ? adaptiveHost : liveHost}</dd>
                </div>
              </dl>

              <a className={`${styles.railLink} ${styles.hoverTarget}`} href={liveUrl} target="_blank" rel="noopener noreferrer" data-pwa-hover>
                <span>Open in a new tab</span>
                <ArrowUpRightIcon className={styles.actionIcon} />
              </a>
            </aside>

            <div className={styles.deviceColumn} data-pwa-stage>
              <div className={styles.browserChrome} aria-hidden="true">
                <div className={styles.browserDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.addressBar}>
                  <span className={styles.addressLock}>↗</span>
                  <span>{activeMode === 'adaptive' ? 'adaptive preview' : liveHost}</span>
                </div>
                <span className={styles.browserMode}>LIVE / 02</span>
              </div>

              <div className={styles.deviceFrame}>
                <div className={styles.deviceNotch} aria-hidden="true" />
                <div className={styles.frameViewport}>
                  <iframe
                    id="pwa-preview-frame"
                    className={styles.previewFrame}
                    title={`${displayName} — ${activeMode === 'adaptive' ? 'adaptive preview' : 'original site'}`}
                    src={previewUrl}
                    loading="eager"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="fullscreen; clipboard-read; clipboard-write"
                  />
                </div>
                <div className={styles.deviceFooter} aria-hidden="true">
                  <span className={styles.deviceFooterLine} />
                  <span className={styles.deviceFooterMark}>{activeMode === 'adaptive' ? 'A' : 'O'}</span>
                  <span className={styles.deviceFooterLine} />
                </div>
              </div>

              <div className={styles.fallbackBar}>
                <span><span className={styles.fallbackDot} aria-hidden="true" /> Preview connected to {activeMode === 'adaptive' ? 'adaptive route' : 'live site'}.</span>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  Open site <ArrowUpRightIcon className={styles.actionIcon} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className={styles.footer} data-pwa-enter>
          <span>Hosted PWA / {runtimeId}</span>
          <span>Preview stays connected to the live site.</span>
        </footer>

        <noscript className={styles.noscript}>
          Enable JavaScript to use the install controls. You can still use the live-site action when JavaScript is available.
        </noscript>
      </div>
    </main>
  );
}

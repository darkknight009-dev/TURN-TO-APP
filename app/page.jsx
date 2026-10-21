import ConverterForm from "../components/ConverterForm";
import StudioMotion from "../components/StudioMotion";

const processSteps = [
  {
    number: "01",
    title: "Point to the live app",
    description: "Give us the public URL people already know.",
  },
  {
    number: "02",
    title: "Name the experience",
    description: "Add the identity that belongs on a home screen.",
  },
  {
    number: "03",
    title: "Ship the install",
    description: "Get a launch link and a deployable ZIP in one pass.",
  },
];

function ArrowUpRight({ className = "icon" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 15 15 5" />
      <path d="M7 5h8v8" />
    </svg>
  );
}

export default function Home() {
  return (
    <StudioMotion>
      <div className="site-shell">
        <a className="skip-link" href="#main-content">
          Skip to converter
        </a>

        <header className="topbar page-width" aria-label="Primary navigation">
          <a className="wordmark" href="/" aria-label="PWA Converter home">
            <span className="wordmark-mark">
              pwa<span className="wordmark-dot">·</span>
            </span>
            <span className="wordmark-name">converter</span>
          </a>

          <nav className="topbar-nav" aria-label="Utility navigation">
            <a className="topbar-link" href="#convert">
              Build your wrapper
              <ArrowUpRight />
            </a>
            <span className="topbar-status">
              <span className="status-pulse" aria-hidden="true" />
              <span>studio / online</span>
              <span className="topbar-index">00—26</span>
            </span>
          </nav>
        </header>

        <main id="main-content">
          <section className="hero page-width" aria-labelledby="hero-title">
            <div className="hero-rail" aria-hidden="true">
              <span>STUDIO / 001</span>
              <span className="hero-rail-line" />
              <span>MAKE IT INSTALLABLE</span>
            </div>

            <div className="hero-copy motion-reveal" data-reveal>
              <div className="hero-meta">
                <p className="eyebrow">
                  <span className="eyebrow-index">01</span>
                  URL <span aria-hidden="true">→</span> installable
                </p>
                <span className="hero-meta-note">PUBLIC WEB / ANYWHERE</span>
              </div>

              <h1 id="hero-title">
                <span className="hero-title-line">Make the web</span>
                <span className="hero-title-line hero-title-line-offset">
                  <em>installable.</em>
                </span>
              </h1>

              <p className="hero-lede">
                Turn a live web app into a considered home-screen experience.
                One public URL in. One launch-ready PWA out.
              </p>

              <div className="hero-actions">
                <a
                  className="button button-primary hero-cta"
                  data-magnetic
                  href="#convert"
                >
                  Start a conversion
                  <ArrowUpRight />
                </a>
                <a className="hero-inline-link" href="#how-it-works">
                  See the system <span aria-hidden="true">↓</span>
                </a>
              </div>

              <div className="hero-specs" aria-label="Product highlights">
                <div>
                  <span>01</span>
                  <strong>URL</strong>
                  <small>public + live</small>
                </div>
                <div>
                  <span>02</span>
                  <strong>IDENTITY</strong>
                  <small>name + icon</small>
                </div>
                <div>
                  <span>03</span>
                  <strong>OUTPUT</strong>
                  <small>install + ZIP</small>
                </div>
              </div>
            </div>

            <div
              className="hero-stage motion-reveal"
              data-reveal
              data-pointer-zone
              aria-label="A kinetic preview of a PWA package"
              role="img"
            >
              <div className="hero-stage-label">
                <span>CONVERSION / IN MOTION</span>
                <span>MOVE THROUGH THE FIELD</span>
              </div>

              <div className="stage-scene" aria-hidden="true">
                <div className="stage-grid" data-pointer data-pointer-strength="10" />
                <div className="stage-glow" data-pointer data-pointer-strength="16" />
                <div className="stage-orbit stage-orbit-one" />
                <div className="stage-orbit stage-orbit-two" />

                <div className="stage-orb" data-pointer data-pointer-strength="34">
                  <span>↗</span>
                </div>

                <div
                  className="stage-card stage-card-manifest"
                  data-pointer
                  data-pointer-strength="16"
                >
                  <div className="stage-card-chrome">
                    <span>01 / manifest</span>
                    <span className="stage-chip">JSON</span>
                  </div>
                  <div className="manifest-lines">
                    <span className="manifest-line manifest-line-short" />
                    <span className="manifest-line manifest-line-wide" />
                    <span className="manifest-line manifest-line-medium" />
                    <span className="manifest-line manifest-line-tiny" />
                  </div>
                  <div className="manifest-footer">
                    <span>name</span>
                    <strong>your-app.pwa</strong>
                  </div>
                </div>

                <div
                  className="stage-card stage-card-install"
                  data-pointer
                  data-pointer-strength="22"
                >
                  <div className="stage-card-chrome">
                    <span>release 01</span>
                    <span className="stage-live">● live</span>
                  </div>
                  <div className="install-badge">↗</div>
                  <p className="install-title">home screen / ready</p>
                  <p className="install-name">your-app.pwa</p>
                  <div className="install-footer">
                    <span>launch link generated</span>
                    <span aria-hidden="true">→</span>
                  </div>
                </div>

                <div className="stage-coordinate">
                  40° 43&apos; 51&quot; N<br />
                  73° 59&apos; 08&quot; W
                </div>
                <span className="stage-sticker stage-sticker-left">DROP / INSTALL</span>
                <span className="stage-sticker stage-sticker-right">OPEN WEB / 01</span>
              </div>

              <div className="hero-stage-footer">
                <span>pointer-reactive preview</span>
                <span>scroll to compose ↘</span>
              </div>
            </div>
          </section>

          <section
            className="conversion-section page-width"
            id="convert"
            aria-labelledby="convert-title"
          >
            <div className="section-marker motion-reveal" data-reveal aria-hidden="true">
              <span>02</span>
              <span className="section-marker-line" />
              <span>THE CONVERSION DESK</span>
              <span className="section-marker-tail">KEEP THE URL / CHANGE THE FEEL</span>
            </div>

            <div className="conversion-grid">
              <div
                className="conversion-intro motion-reveal"
                data-reveal
                id="how-it-works"
              >
                <p className="eyebrow">
                  <span className="eyebrow-index">02</span>
                  Build your wrapper
                </p>
                <h2 id="convert-title">
                  The shortest path from
                  <span> browser tab</span> to home screen.
                </h2>
                <p className="conversion-description">
                  Keep the product you already built. Give it a name, a mark,
                  and a launch moment that feels like it belongs.
                </p>

                <ol className="process-list">
                  {processSteps.map((step) => (
                    <li key={step.number}>
                      <span className="process-number">{step.number}</span>
                      <span className="process-copy">
                        <strong>{step.title}</strong>
                        <span>{step.description}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="intro-note">
                  <span className="intro-note-mark" aria-hidden="true">
                    ✦
                  </span>
                  <p>
                    <strong>Built for the open web.</strong> Your URL stays the
                    source of truth; the wrapper makes it feel native.
                  </p>
                </div>
              </div>

              <ConverterForm />
            </div>
          </section>

          <section
            className="signal-section page-width motion-reveal"
            data-reveal
            data-scrub-panel
            aria-labelledby="signal-title"
          >
            <div className="signal-panel">
              <div className="signal-panel-header">
                <p className="eyebrow">
                  <span className="eyebrow-index">03</span>
                  The output
                </p>
                <span>MANIFEST / READY</span>
              </div>
              <div className="signal-content">
                <h2 id="signal-title">
                  From a tab
                  <br />
                  <em>to a place.</em>
                </h2>
                <div className="signal-side">
                  <p>
                    A clean install route, a downloadable wrapper, and an
                    identity that can live on the device where the work happens.
                  </p>
                  <div className="signal-metrics">
                    <div>
                      <strong>01</strong>
                      <span>install route</span>
                    </div>
                    <div>
                      <strong>02</strong>
                      <span>manifest + icons</span>
                    </div>
                    <div>
                      <strong>03</strong>
                      <span>deployable ZIP</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="signal-marquee" aria-hidden="true">
                <span>INSTALLABLE</span>
                <span>RESPONSIVE</span>
                <span>RECOGNIZABLE</span>
                <span>READY TO SHIP</span>
              </div>
            </div>
          </section>

          <section
            className="closing-section page-width motion-reveal"
            data-reveal
            aria-label="Product promise"
          >
            <div className="closing-rule" />
            <div className="closing-grid">
              <p className="closing-kicker">
                A better front door for the things you already made.
              </p>
              <p className="closing-statement">
                Ship the link. Keep the momentum.
                <span aria-hidden="true"> ↗</span>
              </p>
            </div>
          </section>
        </main>

        <footer className="site-footer page-width">
          <span className="footer-brand">pwa / converter</span>
          <span>
            built for the open web <span aria-hidden="true">·</span>{" "}
            {new Date().getFullYear()}
          </span>
        </footer>
      </div>
    </StudioMotion>
  );
}

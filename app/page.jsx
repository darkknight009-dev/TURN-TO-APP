import ConverterForm from "../components/ConverterForm";

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
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to converter
      </a>

      <header className="topbar page-width" aria-label="Primary navigation">
        <a className="wordmark" href="/" aria-label="PWA Converter home">
          <span>pwa</span>
          <span className="wordmark-slash">/</span>
          <span>converter</span>
        </a>

        <div className="topbar-status">
          <span className="status-pulse" aria-hidden="true" />
          <span>conversion studio / online</span>
          <span className="topbar-index">00—26</span>
        </div>
      </header>

      <main id="main-content">
        <section className="hero page-width" aria-labelledby="hero-title">
          <div className="hero-rail" aria-hidden="true">
            <span>01</span>
            <span className="hero-rail-line" />
            <span>make it installable</span>
          </div>

          <div className="hero-copy reveal reveal-delay-one">
            <p className="eyebrow">
              <span className="eyebrow-mark" aria-hidden="true">
                ✳
              </span>
              URL to home screen
            </p>
            <h1 id="hero-title">
              Give the web
              <span className="hero-title-accent"> a place</span>
              <br />
              to live.
            </h1>
            <p className="hero-lede">
              Wrap any public web app in a considered, installable experience.
              One URL in, one ready-to-ship PWA out.
            </p>

            <div className="hero-actions">
              <a className="text-link text-link-bright" href="#convert">
                Start a conversion
                <ArrowUpRight />
              </a>
              <span className="hero-caption">
                No build setup / no design system to learn
              </span>
            </div>

            <div className="hero-signals" aria-label="Product highlights">
              <span>
                <strong>01</strong> public URL
              </span>
              <span>
                <strong>02</strong> app identity
              </span>
              <span>
                <strong>03</strong> install-ready ZIP
              </span>
            </div>
          </div>

          <div
            className="hero-art reveal reveal-delay-two"
            aria-label="A preview of a PWA package"
            role="img"
          >
            <div className="hero-art-grid" />
            <div className="hero-art-coordinate">
              40° 43&apos; 51&quot; N / 73° 59&apos; 08&quot; W
            </div>

            <div className="orbit orbit-large" />
            <div className="orbit orbit-small" />

            <div className="art-card art-card-back">
              <div className="art-card-topline">
                <span>manifest.webmanifest</span>
                <span>JSON</span>
              </div>
              <div className="code-lines" aria-hidden="true">
                <span className="code-line code-line-short" />
                <span className="code-line code-line-wide" />
                <span className="code-line code-line-medium" />
                <span className="code-line code-line-short" />
              </div>
            </div>

            <div className="art-card art-card-front">
              <div className="art-card-topline">
                <span>new release</span>
                <span className="art-card-live">● live</span>
              </div>
              <div className="art-app-row">
                <span className="art-app-icon">↗</span>
                <span className="art-app-name">
                  <strong>your-app.pwa</strong>
                  <small>ready for the home screen</small>
                </span>
              </div>
              <div className="art-card-footer">
                <span>install link generated</span>
                <span className="art-card-check" aria-hidden="true">
                  ✓
                </span>
              </div>
            </div>

            <span className="art-sticker art-sticker-top">PUBLIC / 01</span>
            <span className="art-sticker art-sticker-bottom">
              DROP → INSTALL
            </span>
          </div>
        </section>

        <section
          className="conversion-section page-width"
          id="convert"
          aria-labelledby="convert-title"
        >
          <div className="section-rule" aria-hidden="true">
            <span>02</span>
            <span className="section-rule-line" />
            <span>the conversion desk</span>
          </div>

          <div className="conversion-grid">
            <div className="conversion-intro reveal reveal-delay-one">
              <p className="eyebrow">Build your wrapper</p>
              <h2 id="convert-title">
                The shortest path from
                <span> browser tab</span> to home screen.
              </h2>
              <p className="conversion-description">
                Keep the product you already built. Add a name, an optional
                mark, and a little ceremony around the launch.
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
          className="closing-section page-width"
          aria-label="Product promise"
        >
          <div className="closing-rule" />
          <p className="closing-kicker">
            A better front door for the things you already made.
          </p>
          <p className="closing-statement">
            Ship the link. Keep the momentum.
            <span aria-hidden="true"> ↗</span>
          </p>
        </section>
      </main>

      <footer className="site-footer page-width">
        <span className="footer-brand">pwa/converter</span>
        <span>
          built for the open web <span aria-hidden="true">·</span>{" "}
          {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}

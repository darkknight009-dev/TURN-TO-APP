"use client";

import { useEffect, useRef, useState } from "react";

const MAX_NAME_LENGTH = 64;
const MAX_ICON_SIZE = 5 * 1024 * 1024;
const ACCEPTED_ICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function ArrowUpRight({ className = "icon" }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 15 15 5" />
      <path d="M7 5h8v8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7" y="6" width="9" height="10" rx="1.5" />
      <path d="M4 13V4.5A1.5 1.5 0 0 1 5.5 3H13" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v9" />
      <path d="m6.5 9.5 3.5 3.5 3.5-3.5" />
      <path d="M4 16.5h12" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="upload-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="success-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function normalizePublicUrl(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      value: "",
      error: "Add the public URL where your web app is live.",
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    return { value: "", error: "Use a complete URL, including https://." };
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    return {
      value: "",
      error: "The app URL must begin with http:// or https://.",
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      value: "",
      error: "URLs with embedded credentials are not supported.",
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const privateLooking =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");

  if (privateLooking) {
    return {
      value: "",
      error: "Use a public web address, not a local development URL.",
    };
  }

  return { value: parsedUrl.toString(), error: "" };
}

function getServerMessage(payload, fallback) {
  if (
    payload &&
    typeof payload.message === "string" &&
    payload.message.trim()
  ) {
    return payload.message;
  }
  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = value;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.style.position = "fixed";
  fallbackInput.style.opacity = "0";
  document.body.appendChild(fallbackInput);
  fallbackInput.select();
  const copied = document.execCommand("copy");
  fallbackInput.remove();

  if (!copied) {
    throw new Error("Copy is unavailable in this browser.");
  }
}

export default function ConverterForm() {
  const formRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [iconPreview, setIconPreview] = useState("");
  const [result, setResult] = useState(null);
  const [copyState, setCopyState] = useState("idle");

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
    };
  }, [iconPreview]);

  function clearFieldError(name) {
    if (!fieldErrors[name]) return;
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleIconChange(event) {
    const file = event.target.files?.[0];
    clearFieldError("icon");

    if (!file) {
      setIconPreview("");
      return;
    }

    if (!ACCEPTED_ICON_TYPES.has(file.type)) {
      event.target.value = "";
      setIconPreview("");
      setFieldErrors((current) => ({
        ...current,
        icon: "Choose a PNG, JPG, WebP, or SVG image.",
      }));
      return;
    }

    if (file.size > MAX_ICON_SIZE) {
      event.target.value = "";
      setIconPreview("");
      setFieldErrors((current) => ({
        ...current,
        icon: "Keep the app icon under 5 MB.",
      }));
      return;
    }

    setIconPreview(URL.createObjectURL(file));
  }

  function validate(formData) {
    const urlResult = normalizePublicUrl(String(formData.get("url") || ""));
    const appName = String(formData.get("appName") || "").trim();
    const icon = formData.get("icon");
    const errors = {};

    if (urlResult.error) errors.url = urlResult.error;
    if (!appName) errors.appName = "Give your PWA a name before generating it.";
    else if (appName.length > MAX_NAME_LENGTH) {
      errors.appName = `Keep the name under ${MAX_NAME_LENGTH} characters.`;
    }

    if (
      icon &&
      typeof File !== "undefined" &&
      icon instanceof File &&
      icon.size
    ) {
      if (!ACCEPTED_ICON_TYPES.has(icon.type))
        errors.icon = "Choose a PNG, JPG, WebP, or SVG image.";
      else if (icon.size > MAX_ICON_SIZE)
        errors.icon = "Keep the app icon under 5 MB.";
    }

    return { errors, normalizedUrl: urlResult.value, appName };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const { errors, normalizedUrl, appName } = validate(formData);

    setFieldErrors(errors);
    setSubmitError("");
    setCopyState("idle");

    if (Object.keys(errors).length) {
      const firstInvalidField = Object.keys(errors)[0];
      form.elements[firstInvalidField]?.focus();
      return;
    }

    formData.set("url", normalizedUrl);
    formData.set("appName", appName);
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getServerMessage(
            payload,
            "The package could not be generated. Try again.",
          ),
        );
      }

      if (
        !payload ||
        typeof payload.installUrl !== "string" ||
        typeof payload.downloadUrl !== "string" ||
        !payload.installUrl.trim() ||
        !payload.downloadUrl.trim()
      ) {
        throw new Error(
          "The generator returned an incomplete response. Please try again.",
        );
      }

      setResult({
        id: payload.id ? String(payload.id) : "ready",
        appName:
          typeof payload.appName === "string" && payload.appName.trim()
            ? payload.appName
            : appName,
        installUrl: payload.installUrl,
        downloadUrl: payload.downloadUrl,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong while generating the package.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!result?.installUrl) return;

    try {
      await copyText(result.installUrl);
      setCopyState("copied");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyState("idle"), 2600);
    }
  }

  function handleReset() {
    formRef.current?.reset();
    setFieldErrors({});
    setSubmitError("");
    setIsLoading(false);
    setIconPreview("");
    setResult(null);
    setCopyState("idle");
  }

  const iconInputError = Boolean(fieldErrors.icon);

  return (
    <div className="converter-card reveal reveal-delay-two">
      <div className="converter-card-header">
        <div>
          <p className="card-kicker">Conversion request</p>
          <h3>
            {result ? "Your release is in orbit." : "Make the first move."}
          </h3>
        </div>
        <span className="card-index">
          03 <span aria-hidden="true">/</span> 03
        </span>
      </div>

      {result ? (
        <section
          className="success-state"
          aria-labelledby="success-title"
          aria-live="polite"
        >
          <div className="success-visual" aria-hidden="true">
            <div className="success-ring success-ring-one" />
            <div className="success-ring success-ring-two" />
            <div className="success-core">
              <CheckIcon />
            </div>
          </div>

          <div className="success-copy">
            <div className="success-meta">
              <span className="success-meta-dot" />
              BUILD COMPLETE
              <span className="success-id">/{result.id}</span>
            </div>
            <h4 id="success-title">
              <span>{result.appName}</span> is ready for a new home.
            </h4>
            <p>
              Open the install experience now, or keep the launch link close and
              download the generated wrapper when you are ready to ship.
            </p>
          </div>

          <div className="success-actions">
            <a
              className="button button-primary"
              href={result.installUrl}
              target="_blank"
              rel="noreferrer"
            >
              Install / open
              <ArrowUpRight />
            </a>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleCopyLink}
            >
              <CopyIcon />
              {copyState === "copied"
                ? "Link copied"
                : copyState === "error"
                  ? "Copy unavailable"
                  : "Copy link"}
            </button>
            <a
              className="button button-quiet"
              href={result.downloadUrl}
              download
            >
              <DownloadIcon />
              Download ZIP
            </a>
          </div>

          <button className="reset-link" type="button" onClick={handleReset}>
            Convert another URL <span aria-hidden="true">↗</span>
          </button>
        </section>
      ) : (
        <form
          ref={formRef}
          className="converter-form"
          method="post"
          encType="multipart/form-data"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="field-block">
            <label className="field-label" htmlFor="app-url">
              Public web-app URL{" "}
              <span className="field-required">required</span>
            </label>
            <div
              className={`input-frame ${fieldErrors.url ? "has-error" : ""}`}
            >
              <span className="input-prefix" aria-hidden="true">
                https://
              </span>
              <input
                id="app-url"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="your-product.com"
                required
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.url)}
                aria-describedby="app-url-hint app-url-error"
                onChange={() => clearFieldError("url")}
              />
            </div>
            <p className="field-hint" id="app-url-hint">
              Use the public address people should open when they launch your
              app.
            </p>
            {fieldErrors.url ? (
              <p className="field-error" id="app-url-error" role="alert">
                {fieldErrors.url}
              </p>
            ) : null}
          </div>

          <div className="form-divider" aria-hidden="true">
            <span />
            <span>identity</span>
            <span />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="app-name">
              PWA name <span className="field-required">required</span>
            </label>
            <input
              className={`text-input ${fieldErrors.appName ? "has-error" : ""}`}
              id="app-name"
              name="appName"
              type="text"
              maxLength={MAX_NAME_LENGTH}
              autoComplete="organization"
              placeholder="A name worth installing"
              required
              disabled={isLoading}
              aria-invalid={Boolean(fieldErrors.appName)}
              aria-describedby="app-name-hint app-name-error"
              onChange={() => clearFieldError("appName")}
            />
            <div className="field-hint-row">
              <p className="field-hint" id="app-name-hint">
                The name shown in the install prompt and home screen.
              </p>
              <span className="character-limit">max {MAX_NAME_LENGTH}</span>
            </div>
            {fieldErrors.appName ? (
              <p className="field-error" id="app-name-error" role="alert">
                {fieldErrors.appName}
              </p>
            ) : null}
          </div>

          <div className="field-block icon-field-block">
            <div className="field-label-row">
              <label className="field-label" htmlFor="app-icon">
                App icon <span className="field-optional">optional</span>
              </label>
              {iconPreview ? (
                <span className="icon-ready">preview loaded</span>
              ) : null}
            </div>
            <div
              className={`upload-frame ${iconInputError ? "has-error" : ""} ${iconPreview ? "has-preview" : ""}`}
            >
              <input
                id="app-icon"
                name="icon"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={isLoading}
                aria-invalid={iconInputError}
                aria-describedby="app-icon-hint app-icon-error"
                onChange={handleIconChange}
              />
              <label className="upload-label" htmlFor="app-icon">
                {iconPreview ? (
                  <>
                    <img
                      className="icon-preview"
                      src={iconPreview}
                      alt="Selected app icon preview"
                    />
                    <span>
                      <strong>Replace the icon</strong>
                      <small>PNG, JPG, WebP, or SVG / 5 MB max</small>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="upload-mark">
                      <UploadIcon />
                    </span>
                    <span>
                      <strong>Drop an icon or browse</strong>
                      <small>PNG, JPG, WebP, or SVG / 5 MB max</small>
                    </span>
                  </>
                )}
                <span className="upload-arrow" aria-hidden="true">
                  ↗
                </span>
              </label>
            </div>
            <p className="field-hint" id="app-icon-hint">
              Optional — bring your own mark, or let the generator create a
              clean default.
            </p>
            {fieldErrors.icon ? (
              <p className="field-error" id="app-icon-error" role="alert">
                {fieldErrors.icon}
              </p>
            ) : null}
          </div>

          <div className="form-footer">
            <button
              className="button button-primary submit-button"
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  Building your PWA
                </>
              ) : (
                <>
                  Generate package
                  <ArrowUpRight />
                </>
              )}
            </button>
            <p className="form-footnote">
              <span aria-hidden="true">⌁</span> Your URL is only used to create
              this package.
            </p>
          </div>

          {isLoading ? (
            <div
              className="status-panel status-loading"
              role="status"
              aria-live="polite"
            >
              <span className="loading-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <strong>Composing the wrapper.</strong>
                <small>
                  Reading the destination, preparing the install route,
                  packaging the release.
                </small>
              </span>
            </div>
          ) : null}

          {submitError ? (
            <div
              className="status-panel status-error"
              role="alert"
              aria-live="assertive"
            >
              <span className="status-error-mark" aria-hidden="true">
                !
              </span>
              <span>
                <strong>That one needs another pass.</strong>
                <small>{submitError}</small>
              </span>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}

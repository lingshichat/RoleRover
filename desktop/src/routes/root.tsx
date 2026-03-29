import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n";
import { getBootstrapContext, isBrowserFallbackRuntime } from "../lib/desktop-api";

function LanguagePicker() {
  const { t } = useTranslation();
  const activeLanguage = i18n.language;

  return (
    <div className="language-picker" aria-label={t("languageLabel")}>
      <button
        type="button"
        data-active={activeLanguage === "zh"}
        onClick={() => void i18n.changeLanguage("zh")}
      >
        {t("languageZh")}
      </button>
      <button
        type="button"
        data-active={activeLanguage === "en"}
        onClick={() => void i18n.changeLanguage("en")}
      >
        {t("languageEn")}
      </button>
    </div>
  );
}

function RootLayout() {
  const { t } = useTranslation();
  const context = rootRoute.useLoaderData();
  const isFallback = isBrowserFallbackRuntime(context);
  const runtimeModeLabel = isFallback
    ? t("runtimeModeFallback")
    : t("runtimeModeNative");
  const commandsLabel = context.supportsNativeCommands
    ? t("runtimeNativeCommandsReady")
    : t("runtimeNativeCommandsUnavailable");
  const runtimeSummary = isFallback
    ? t("runtimeFallbackSummary")
    : t("runtimeNativeSummary");
  const runtimeAction = isFallback
    ? t("runtimeFallbackAction")
    : t("runtimeNativeAction");
  const navItems = [
    { to: "/", label: t("navOverview") },
    { to: "/library", label: t("navLibrary") },
    { to: "/imports", label: t("navImports") },
    { to: "/settings", label: t("navSettings") },
  ] as const;

  return (
    <div className="app-frame">
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{t("appName")}</p>
          <h1>{t("subtitle")}</h1>
        </div>
        <div className="hero__actions">
          <LanguagePicker />
          <Link className="hero__link" to="/library">
            {t("navLibrary")}
          </Link>
        </div>
      </header>
      <section
        className={`runtime-banner ${isFallback ? "runtime-banner--fallback" : "runtime-banner--native"}`}
      >
        <div className="runtime-banner__header">
          <div>
            <p className="panel__label">{t("runtimeBoundaryLabel")}</p>
            <h2>{t("runtimeBoundaryTitle")}</h2>
          </div>
          <div className="runtime-banner__pills">
            <span className={`pill ${isFallback ? "pill--warn" : "pill--success"}`}>
              {runtimeModeLabel}
            </span>
            <span
              className={`pill ${context.supportsNativeCommands ? "pill--success" : "pill--warn"}`}
            >
              {commandsLabel}
            </span>
          </div>
        </div>
        <p className="runtime-banner__body">{runtimeSummary}</p>
        <dl className="runtime-banner__facts">
          <div className="runtime-banner__fact">
            <dt>{t("runtime")}</dt>
            <dd>{context.runtime}</dd>
          </div>
          <div className="runtime-banner__fact">
            <dt>{t("platform")}</dt>
            <dd>{context.platform}</dd>
          </div>
          <div className="runtime-banner__fact">
            <dt>{t("mode")}</dt>
            <dd>{context.buildChannel}</dd>
          </div>
        </dl>
        {context.limitations.length > 0 ? (
          <div className="runtime-banner__limitations">
            <p className="runtime-banner__subhead">{t("runtimeLimitationsTitle")}</p>
            <ul className="runtime-banner__list">
              {context.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="runtime-banner__action">{runtimeAction}</p>
      </section>
      <nav className="shell-nav" aria-label={t("shellNavigationLabel")}>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="shell-nav__link"
            activeProps={{ className: "shell-nav__link shell-nav__link--active" }}
            activeOptions={{ exact: item.to === "/" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="content-grid">
        <Outlet />
      </main>
    </div>
  );
}

export const rootRoute = createRootRoute({
  loader: async () => getBootstrapContext(),
  component: RootLayout,
});

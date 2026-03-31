import { Link, createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isBrowserFallbackRuntime } from "../lib/desktop-api";
import { loadSettingsRouteData } from "../lib/desktop-loaders";
import {
  buildProviderRuntimeReadModel,
  toSettingsSurfaceReadModel,
} from "../lib/desktop-read-models";
import { rootRoute } from "./root";

type SettingsTab = "providers" | "experience" | "workspace";

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5 5L15 15M15 5L5 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsRoute() {
  const { t } = useTranslation();
  const context = rootRoute.useLoaderData();
  const { workspace, settings, vault, domainContract } = settingsRoute.useLoaderData();
  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");
  const surface = toSettingsSurfaceReadModel({
    workspace,
    settings,
    vault,
    domainContract,
  });
  const providerEntries = buildProviderRuntimeReadModel(settings, domainContract);
  const vaultStatusLabel =
    vault.status === "ready"
      ? t("vaultStatusReady")
      : vault.status === "degraded"
        ? t("vaultStatusDegraded")
        : t("vaultStatusNeedsConfiguration");
  const settingsBodyKey = runtimeIsFallback ? "settingsBodyFallback" : "settingsBody";

  return (
    <div className="settings-modal-backdrop">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-modal__header">
          <div className="settings-modal__copy">
            <p className="page-header__eyebrow">{t("settingsLabel")}</p>
            <h1 id="settings-title" className="settings-modal__title">
              {t("settingsTitle")}
            </h1>
            <p className="settings-modal__body">{t(settingsBodyKey)}</p>
          </div>

          <Link className="settings-close" to="/library" aria-label={t("settingsClose")}>
            <CloseIcon />
          </Link>
        </header>

        <div className="settings-modal__summary">
          <span className={`status-badge status-badge--${runtimeIsFallback ? "warn" : "success"}`}>
            {t(runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge")}
          </span>
          <span className="status-badge status-badge--muted">{context.platform}</span>
          <span
            className={`status-badge status-badge--${vault.status === "ready" ? "success" : vault.status === "degraded" ? "danger" : "warn"}`}
          >
            {vaultStatusLabel}
          </span>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={t("settingsTitle")}>
          <button
            type="button"
            className={`settings-tab ${activeTab === "providers" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("providers")}
          >
            {t("settingsTabProviders")}
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "experience" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("experience")}
          >
            {t("settingsTabExperience")}
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "workspace" ? "settings-tab--active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            {t("settingsTabWorkspace")}
          </button>
        </div>

        <p className="settings-modal__hint">{t("settingsReadOnlyHint")}</p>

        <div className="settings-modal__content">
          {activeTab === "providers" ? (
            <div className="surface-grid surface-grid--two">
              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("settingsProvidersTitle")}</p>
                    <h3>{t("settingsProvidersHeader")}</h3>
                  </div>
                  <span className="status-badge status-badge--muted">{settings.ai.defaultProvider}</span>
                </div>
                <p>{t("settingsProvidersBody")}</p>
                <div className="subsurface-grid">
                  {providerEntries.map((provider) => (
                    <article key={provider.provider} className="subsurface">
                      <div className="subsurface__header">
                        <div>
                          <p className="collection-card__badge">{provider.provider}</p>
                          <h3>{provider.model}</h3>
                        </div>
                        {provider.isDefault ? (
                          <span className="status-badge status-badge--success">
                            {t("defaultProvider")}
                          </span>
                        ) : null}
                      </div>
                      <p>{provider.baseUrl || t("notAvailable")}</p>
                      {provider.secretKey ? (
                        <p>
                          {t("providerSecretKeyLabel")}: {provider.secretKey}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>

              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("settingsCurrentState")}</p>
                    <h3>{t("settingsLocaleHeader")}</h3>
                  </div>
                  <span className="status-badge status-badge--muted">{context.buildChannel}</span>
                </div>
                <dl className="setting-list">
                  <div className="setting-row">
                    <dt>{t("defaultProvider")}</dt>
                    <dd>{settings.ai.defaultProvider}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("providerConfigs")}</dt>
                    <dd>{surface.configuredProviderCount}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("providerRegistryTitle")}</dt>
                    <dd>{surface.contractProviderCount}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("vaultSecretsCount")}</dt>
                    <dd>{vault.registeredSecretCount}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("baseUrlLabel")}</dt>
                    <dd>{settings.ai.exaPoolBaseUrl || t("notAvailable")}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {activeTab === "experience" ? (
            <div className="surface-grid surface-grid--two">
              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("settingsLocaleTitle")}</p>
                    <h3>{t("settingsLocaleHeader")}</h3>
                  </div>
                </div>
                <dl className="setting-list">
                  <div className="setting-row">
                    <dt>{t("localeLabel")}</dt>
                    <dd>{settings.locale}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("themeLabel")}</dt>
                    <dd>{settings.theme}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("autoSaveLabel")}</dt>
                    <dd>{settings.editor.autoSave ? t("yes") : t("no")}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("autoSaveIntervalLabel")}</dt>
                    <dd>{settings.editor.autoSaveIntervalMs}ms</dd>
                  </div>
                </dl>
              </section>

              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("workspace")}</p>
                    <h3>{t("settingsStorageHeader")}</h3>
                  </div>
                </div>
                <dl className="setting-list">
                  <div className="setting-row">
                    <dt>{t("rememberWindowState")}</dt>
                    <dd>{settings.window.rememberWindowState ? t("yes") : t("no")}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("restoreLastWorkspace")}</dt>
                    <dd>{settings.window.restoreLastWorkspace ? t("yes") : t("no")}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("runtime")}</dt>
                    <dd>{context.runtime}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("mode")}</dt>
                    <dd>{context.buildChannel}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {activeTab === "workspace" ? (
            <div className="surface-grid surface-grid--two">
              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("settingsStorageTitle")}</p>
                    <h3>{t("settingsStorageHeader")}</h3>
                  </div>
                  <span className="status-badge status-badge--muted">
                    {t("schemaVersion")}: {workspace.schemaVersion}
                  </span>
                </div>
                <p>{t("settingsStorageBody")}</p>
                <dl className="path-list">
                  <div className="path-row">
                    <dt>{t("storageRoot")}</dt>
                    <dd>{workspace.rootDir}</dd>
                  </div>
                  <div className="path-row">
                    <dt>{t("databasePath")}</dt>
                    <dd>{workspace.databasePath}</dd>
                  </div>
                  <div className="path-row">
                    <dt>{t("secureSettingsPath")}</dt>
                    <dd>{workspace.secureSettingsPath}</dd>
                  </div>
                  <div className="path-row">
                    <dt>{t("manifestPath")}</dt>
                    <dd>{workspace.manifestPath}</dd>
                  </div>
                </dl>
              </section>

              <section className="subsurface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">{t("vaultLabel")}</p>
                    <h3>{t("vaultTitle")}</h3>
                  </div>
                  <span
                    className={`status-badge status-badge--${vault.status === "ready" ? "success" : vault.status === "degraded" ? "danger" : "warn"}`}
                  >
                    {vaultStatusLabel}
                  </span>
                </div>
                <p>{t("vaultBody")}</p>
                <dl className="setting-list">
                  <div className="setting-row">
                    <dt>{t("vaultBackend")}</dt>
                    <dd>{vault.backend}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("vaultEncryptedAtRest")}</dt>
                    <dd>{vault.encryptedAtRest ? t("yes") : t("no")}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("vaultSecretsCount")}</dt>
                    <dd>{vault.registeredSecretCount}</dd>
                  </div>
                  <div className="setting-row">
                    <dt>{t("providerRegistryTitle")}</dt>
                    <dd>{surface.supportsEncryptedVault ? t("yes") : t("no")}</dd>
                  </div>
                </dl>
                <dl className="path-list">
                  <div className="path-row">
                    <dt>{t("vaultManifestPath")}</dt>
                    <dd>{vault.manifestPath}</dd>
                  </div>
                  <div className="path-row">
                    <dt>{t("vaultFallbackPath")}</dt>
                    <dd>{vault.fallbackPath}</dd>
                  </div>
                </dl>
                {vault.warnings.length > 0 ? (
                  <div className="subsurface-grid">
                    {vault.warnings.map((warning) => (
                      <article key={warning} className="subsurface subsurface--warn">
                        <p className="collection-card__badge">{t("vaultWarning")}</p>
                        <h3>{t("vaultNeedsAttention")}</h3>
                        <p>{warning}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact">
                    <h3>{t("noWarnings")}</h3>
                    <p>{t("vaultNoWarnings")}</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  loader: loadSettingsRouteData,
  component: SettingsRoute,
});

import { createRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  getBootstrapContext,
  getSecretVaultStatus,
  getWorkspaceSettingsSnapshot,
  getWorkspaceSnapshot,
  isBrowserFallbackRuntime,
} from "../lib/desktop-api";
import { rootRoute } from "./root";

function SettingsRoute() {
  const { t } = useTranslation();
  const { context, workspace, settings, vault } = settingsRoute.useLoaderData();
  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const settingsBodyKey = runtimeIsFallback ? "settingsBodyFallback" : "settingsBody";
  const runtimeNoteTitle = runtimeIsFallback ? "settingsRuntimeFallbackTitle" : "settingsRuntimeNativeTitle";
  const runtimeNoteBody = runtimeIsFallback ? "settingsRuntimeFallbackBody" : "settingsRuntimeNativeBody";
  const runtimeBadge = runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge";
  const vaultStatusLabel =
    vault.status === "ready"
      ? t("vaultStatusReady")
      : vault.status === "degraded"
        ? t("vaultStatusDegraded")
        : t("vaultStatusNeedsConfiguration");

  return (
    <>
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("settingsLabel")}</p>
            <h2>{t("settingsTitle")}</h2>
          </div>
          <span className="pill pill--soft">{context.platform}</span>
        </div>
        <p className="panel__body">{t(settingsBodyKey)}</p>
        <div className="stub-grid">
          <article className="stub-card">
            <p className="workstream-card__badge">{t("settingsProvidersTitle")}</p>
            <h3>{t("settingsProvidersHeader")}</h3>
            <p>{t("settingsProvidersBody")}</p>
            <span className="mini-kv">{settings.ai.defaultProvider}</span>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("settingsStorageTitle")}</p>
            <h3>{t("settingsStorageHeader")}</h3>
            <p>{t("settingsStorageBody")}</p>
            <span className="mini-kv">{workspace.databasePath}</span>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("settingsLocaleTitle")}</p>
            <h3>{t("settingsLocaleHeader")}</h3>
            <p>{t("settingsLocaleBody")}</p>
            <span className="mini-kv">{settings.locale} / {settings.theme}</span>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("vaultLabel")}</p>
            <h3>{t("vaultTitle")}</h3>
            <p>{t("vaultBody")}</p>
            <span className="mini-kv">{vaultStatusLabel}</span>
          </article>
        </div>
      </section>

      <article className={runtimeIsFallback ? "issue-card" : "issue-card issue-card--neutral"}>
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("runtimeStatusLabel")}</p>
            <h3>{t(runtimeNoteTitle)}</h3>
          </div>
          <span className={`pill pill--${runtimeIsFallback ? "warn" : "success"}`}>
            {t(runtimeBadge)}
          </span>
        </div>
        <p className="panel__body">{t(runtimeNoteBody)}</p>
        <p className="panel__body">
          <strong>{context.runtime}</strong>
        </p>
      </article>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("vaultLabel")}</p>
            <h2>{t("vaultTitle")}</h2>
          </div>
          <span className={`pill pill--${vault.status === "ready" ? "success" : vault.status === "degraded" ? "danger" : "warn"}`}>
            {vaultStatusLabel}
          </span>
        </div>
        <p className="panel__body">{t("vaultBody")}</p>
        <dl className="stats-grid">
          <div className="stat-card stat-card--light">
            <dt>{t("vaultBackend")}</dt>
            <dd>{vault.backend}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("vaultEncryptedAtRest")}</dt>
            <dd>{vault.encryptedAtRest ? t("yes") : t("no")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("vaultSecretsCount")}</dt>
            <dd>{vault.registeredSecretCount}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("autoSaveLabel")}</dt>
            <dd>{settings.editor.autoSave ? t("yes") : t("no")}</dd>
          </div>
        </dl>
        <dl className="path-list path-list--compact">
          <div className="path-row">
            <dt>{t("secureSettingsPath")}</dt>
            <dd>{workspace.secureSettingsPath}</dd>
          </div>
          <div className="path-row">
            <dt>{t("vaultManifestPath")}</dt>
            <dd>{vault.manifestPath}</dd>
          </div>
          <div className="path-row">
            <dt>{t("vaultFallbackPath")}</dt>
            <dd>{vault.fallbackPath}</dd>
          </div>
        </dl>
        <div className="issue-list">
          {vault.warnings.length === 0 ? (
            <article className="issue-card issue-card--neutral">
              <h3>{t("noWarnings")}</h3>
              <p>{t("vaultNoWarnings")}</p>
            </article>
          ) : (
            vault.warnings.map((warning) => (
              <article key={warning} className="issue-card">
                <p className="workstream-card__badge">{t("vaultWarning")}</p>
                <h3>{t("vaultNeedsAttention")}</h3>
                <p>{warning}</p>
              </article>
            ))
          )}
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <p className="workstream-card__badge">{t("settingsCurrentState")}</p>
            <ul className="stack-list">
              <li>{t("defaultProvider")}: {settings.ai.defaultProvider}</li>
              <li>{t("localeLabel")}: {settings.locale}</li>
              <li>{t("themeLabel")}: {settings.theme}</li>
              <li>{t("autoSaveIntervalLabel")}: {settings.editor.autoSaveIntervalMs}ms</li>
              <li>{t("rememberWindowState")}: {settings.window.rememberWindowState ? t("yes") : t("no")}</li>
              <li>{t("restoreLastWorkspace")}: {settings.window.restoreLastWorkspace ? t("yes") : t("no")}</li>
            </ul>
          </article>
          <article className="detail-card">
            <p className="workstream-card__badge">{t("providerConfigs")}</p>
            <ul className="stack-list">
              {Object.entries(settings.ai.providerConfigs).map(([provider, config]) => (
                <li key={provider}>
                  <strong>{provider}</strong>: {config.model} @ {config.baseUrl}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  );
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  loader: async () => {
    const [context, workspace, settings, vault] = await Promise.all([
      getBootstrapContext(),
      getWorkspaceSnapshot(),
      getWorkspaceSettingsSnapshot(),
      getSecretVaultStatus(),
    ]);
    return { context, workspace, settings, vault };
  },
  component: SettingsRoute,
});

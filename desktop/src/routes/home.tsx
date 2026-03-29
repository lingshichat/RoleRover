import { Link, createRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  getBootstrapContext,
  getWorkspaceSnapshot,
  isBrowserFallbackRuntime,
  type BootstrapContext,
  type WorkspaceSnapshot,
} from "../lib/desktop-api";
import { rootRoute } from "./root";

const workstreams = [
  "desktop runtime boundary",
  "desktop-native schema importer",
  "canonical template contract",
];

function formatStatus(
  workspace: WorkspaceSnapshot,
  context: BootstrapContext,
  t: (key: string) => string,
): { bootstrap: string; migration: string } {
  if (isBrowserFallbackRuntime(context)) {
    return {
      bootstrap: t("workspaceStateFallback"),
      migration: t("migrationStateNeedsDesktop"),
    };
  }

  return {
    bootstrap:
      workspace.bootstrapStatus === "created"
        ? t("bootstrapCreated")
        : t("bootstrapReused"),
    migration:
      workspace.migrationStatus === "legacySourcesDetected"
        ? t("migrationPending")
        : t("migrationClean"),
  };
}

function HomeRoute() {
  const { t } = useTranslation();
  const { context, workspace } = homeRoute.useLoaderData();
  const status = formatStatus(workspace, context, t);
  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const runtimeBannerTitle = runtimeIsFallback
    ? "runtimeFallbackBannerTitle"
    : "runtimeNativeBannerTitle";
  const runtimeBannerBody = runtimeIsFallback
    ? "runtimeFallbackBannerBody"
    : "runtimeNativeBannerBody";
  const runtimeBadge = runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge";

  return (
    <>
      <section className="panel panel--summary">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("migrationTitle")}</p>
            <h2>{t("appName")}</h2>
          </div>
          <span className="pill">{context.buildChannel}</span>
        </div>
        <p className="panel__body">{t("migrationBody")}</p>
        <dl className="stats-grid">
          <div className="stat-card">
            <dt>{t("branch")}</dt>
            <dd>{context.branch}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("runtime")}</dt>
            <dd>{context.runtime}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("frontend")}</dt>
            <dd>{context.frontendShell}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("platform")}</dt>
            <dd>{context.platform}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("mode")}</dt>
            <dd>{context.appVersion}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("workspaceState")}</dt>
            <dd>{status.bootstrap}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("migrationState")}</dt>
            <dd>{status.migration}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("runtimeStatusLabel")}</p>
            <h2>{t(runtimeBannerTitle)}</h2>
          </div>
          <span className={`pill pill--${runtimeIsFallback ? "warn" : "success"}`}>
            {t(runtimeBadge)}
          </span>
        </div>
        <p className="panel__body">{t(runtimeBannerBody)}</p>
        <p className="panel__body">
          <strong>{context.runtime}</strong>
        </p>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("workspace")}</p>
            <h2>{t("workspaceState")}</h2>
          </div>
          <span className="pill pill--soft">v{workspace.schemaVersion}</span>
        </div>
        <p className="panel__body">{t("workspaceHint")}</p>
        <dl className="path-list">
          <div className="path-row">
            <dt>{t("storageRoot")}</dt>
            <dd>{workspace.rootDir}</dd>
          </div>
          <div className="path-row">
            <dt>{t("manifestPath")}</dt>
            <dd>{workspace.manifestPath}</dd>
          </div>
          <div className="path-row">
            <dt>{t("databasePath")}</dt>
            <dd>{workspace.databasePath}</dd>
          </div>
          <div className="path-row">
            <dt>{t("secureSettingsPath")}</dt>
            <dd>{workspace.secureSettingsPath}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("workstreams")}</p>
            <h2>{t("nextStepsTitle")}</h2>
          </div>
        </div>
        <p className="panel__body">{t("workstreamsHint")}</p>
        <ul className="timeline-list">
          <li>{t("nextStepOne")}</li>
          <li>{t("nextStepTwo")}</li>
          <li>{t("nextStepThree")}</li>
        </ul>
        <div className="workstream-grid">
          {workstreams.map((item) => (
            <article key={item} className="workstream-card">
              <p className="workstream-card__badge">PR1</p>
              <h3>{item}</h3>
            </article>
          ))}
        </div>
        <div className="quick-links">
          <Link className="quick-link" to="/library">
            {t("navLibrary")}
          </Link>
          <Link className="quick-link" to="/imports">
            {t("navImports")}
          </Link>
          <Link className="quick-link" to="/settings">
            {t("navSettings")}
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("readiness")}</p>
            <h2>{t("architecture")}</h2>
          </div>
        </div>
        <p className="panel__body">{t("readinessBody")}</p>
        <p className="panel__body">{t("architectureBody")}</p>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("legacyInventory")}</p>
            <h2>{t("migrationState")}</h2>
          </div>
        </div>
        <p className="panel__body">{t("legacyHint")}</p>
        <div className="legacy-grid">
          {workspace.legacySources.map((source) => (
            <article key={source.id} className="legacy-card">
              <div className="legacy-card__header">
                <div>
                  <p className="workstream-card__badge">{source.kind}</p>
                  <h3>{source.label}</h3>
                </div>
                <span className="status-pill" data-found={source.exists}>
                  {source.exists ? t("found") : t("missing")}
                </span>
              </div>
              <p className="legacy-card__path">{source.path}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [context, workspace] = await Promise.all([
      getBootstrapContext(),
      getWorkspaceSnapshot(),
    ]);

    return { context, workspace };
  },
  component: HomeRoute,
});

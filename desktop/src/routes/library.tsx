import { Link, createRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  getBootstrapContext,
  getStorageSnapshot,
  getWorkspaceSnapshot,
  isBrowserFallbackRuntime,
} from "../lib/desktop-api";
import { rootRoute } from "./root";

function tableCount(
  tableCounts: Array<{ table: string; rowCount: number }>,
  table: string,
): number {
  return tableCounts.find((entry) => entry.table === table)?.rowCount ?? 0;
}

function LibraryRoute() {
  const { t } = useTranslation();
  const { context, workspace, storage } = libraryRoute.useLoaderData();
  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const libraryBodyKey = runtimeIsFallback ? "libraryBodyFallback" : "libraryBody";
  const runtimeNoteTitle = runtimeIsFallback ? "libraryRuntimeFallbackTitle" : "libraryRuntimeNativeTitle";
  const runtimeNoteBody = runtimeIsFallback ? "libraryRuntimeFallbackBody" : "libraryRuntimeNativeBody";
  const runtimeBadge = runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge";
  const workspaceStateLabel = runtimeIsFallback
    ? t("workspaceStateFallback")
    : workspace.bootstrapStatus;
  const migrationStateLabel = runtimeIsFallback
    ? t("migrationStateNeedsDesktop")
    : workspace.migrationStatus;
  const storageHealthLabel = runtimeIsFallback
    ? t("storageHealthFallback")
    : storage.initialized
      ? t("storageReady")
      : t("storageNeedsAttention");

  return (
    <>
      <section className="panel panel--summary">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("libraryLabel")}</p>
            <h2>{t("libraryTitle")}</h2>
          </div>
          <span className="pill">{context.buildChannel}</span>
        </div>
        <p className="panel__body">{t(libraryBodyKey)}</p>
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
            <dt>{t("workspaceState")}</dt>
            <dd>{workspaceStateLabel}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("migrationState")}</dt>
            <dd>{migrationStateLabel}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("sqliteVersion")}</dt>
            <dd>{storage.sqliteVersion}</dd>
          </div>
          <div className="stat-card">
            <dt>{t("storageHealth")}</dt>
            <dd>{storageHealthLabel}</dd>
          </div>
        </dl>
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
            <p className="panel__label">{t("libraryFocus")}</p>
            <h2>{t("libraryFocusTitle")}</h2>
          </div>
        </div>
        <div className="stub-grid">
          <article className="stub-card">
            <p className="workstream-card__badge">{t("libraryQueueTitle")}</p>
            <h3>{t("libraryQueueHeader")}</h3>
            <p>{t("libraryQueueBody")}</p>
            <Link className="inline-link" to="/imports">
              {t("navImports")}
            </Link>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("libraryTemplatesTitle")}</p>
            <h3>{t("libraryTemplatesHeader")}</h3>
            <p>{t("libraryTemplatesBody")}</p>
            <Link className="inline-link" to="/settings">
              {t("navSettings")}
            </Link>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("libraryExportsTitle")}</p>
            <h3>{t("libraryExportsHeader")}</h3>
            <p>{t("libraryExportsBody")}</p>
            <span className="mini-kv">{workspace.exportsDir}</span>
          </article>
          <article className="stub-card">
            <p className="workstream-card__badge">{t("libraryStorageTitle")}</p>
            <h3>{t("libraryStorageHeader")}</h3>
            <p>{t("libraryStorageBody")}</p>
            <span className="mini-kv">{storage.databasePath}</span>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__label">{t("storageLabel")}</p>
            <h2>{t("storageTitle")}</h2>
          </div>
          <span className="pill pill--soft">v{storage.schemaVersion}</span>
        </div>
        <p className="panel__body">{t("storageBody")}</p>
        <dl className="stats-grid">
          <div className="stat-card stat-card--light">
            <dt>{t("documentsCount")}</dt>
            <dd>{tableCount(storage.tableCounts, "documents")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("sessionsCount")}</dt>
            <dd>{tableCount(storage.tableCounts, "ai_chat_sessions")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("messagesCount")}</dt>
            <dd>{tableCount(storage.tableCounts, "ai_chat_messages")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("analysesCount")}</dt>
            <dd>{tableCount(storage.tableCounts, "ai_analysis_records")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("auditsCount")}</dt>
            <dd>{tableCount(storage.tableCounts, "migration_audit")}</dd>
          </div>
          <div className="stat-card stat-card--light">
            <dt>{t("workspaceId")}</dt>
            <dd>{storage.workspaceId}</dd>
          </div>
        </dl>
        <dl className="path-list path-list--compact">
          <div className="path-row">
            <dt>{t("storageRoot")}</dt>
            <dd>{storage.workspaceRoot}</dd>
          </div>
          <div className="path-row">
            <dt>{t("databasePath")}</dt>
            <dd>{storage.databasePath}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  loader: async () => {
    const [context, workspace, storage] = await Promise.all([
      getBootstrapContext(),
      getWorkspaceSnapshot(),
      getStorageSnapshot(),
    ]);
    return { context, workspace, storage };
  },
  component: LibraryRoute,
});

import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  executeImporterMigration,
  executeImporterStaging,
  isBrowserFallbackRuntime,
  type AuditWriteStatus,
  type ImporterDryRunSnapshot,
  type MigrationExecutionResult,
  type StagingExecutionResult,
} from "../lib/desktop-api";
import { getDetectedLegacySources, loadImportsRouteData } from "../lib/desktop-loaders";
import { formatDesktopToken } from "../lib/desktop-format";
import { toImportsSurfaceReadModel } from "../lib/desktop-read-models";
import { rootRoute } from "./root";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown importer execution error.";
}

function importerStatusMeta(
  importer: ImporterDryRunSnapshot,
  t: (key: string) => string,
): { label: string; tone: "success" | "warn" | "danger" } {
  if (importer.result.state === "ready_for_execution") {
    return { label: t("importerStateReady"), tone: "success" };
  }

  if (importer.result.blockingIssues.length > 0) {
    return { label: t("importerStateFailed"), tone: "danger" };
  }

  return { label: t("importerStatePlanned"), tone: "warn" };
}

function executionStatusMeta(
  execution: StagingExecutionResult,
  t: (key: string) => string,
): { label: string; tone: "success" | "warn" | "danger" } {
  switch (execution.state) {
    case "success":
      return { label: t("importerExecutionStateSuccess"), tone: "success" };
    case "partial":
      return { label: t("importerExecutionStatePartial"), tone: "warn" };
    default:
      return { label: t("importerExecutionStateFailed"), tone: "danger" };
  }
}

function migrationStatusMeta(
  migration: MigrationExecutionResult,
  t: (key: string) => string,
): { label: string; tone: "success" | "danger" } {
  if (migration.state === "success") {
    return { label: t("importerMigrationStateSuccess"), tone: "success" };
  }

  return { label: t("importerMigrationStateFailed"), tone: "danger" };
}

function auditWriteStatusLabel(status: AuditWriteStatus, t: (key: string) => string): string {
  switch (status) {
    case "written":
      return t("importerAuditWriteWritten");
    case "skipped":
      return t("importerAuditWriteSkipped");
    default:
      return t("importerAuditWriteFailed");
  }
}

function ImportsRoute() {
  const { t } = useTranslation();
  const context = rootRoute.useLoaderData();
  const { workspace, importer, importContract } = importsRoute.useLoaderData();
  const [snapshot, setSnapshot] = useState(importer);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAction, setActiveAction] = useState<"staging" | "migration" | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const runtimeNoteBody = runtimeIsFallback
    ? "importsRuntimeFallbackBody"
    : "importsRuntimeNativeBody";
  const surface = toImportsSurfaceReadModel({
    workspace,
    importer: snapshot,
    importContract,
  });
  const status = importerStatusMeta(snapshot, t);
  const execution = snapshot.stagingExecution ?? null;
  const executionStatus = execution ? executionStatusMeta(execution, t) : null;
  const migration = snapshot.migrationExecution ?? null;
  const migrationStatus = migration ? migrationStatusMeta(migration, t) : null;
  const legacySources = getDetectedLegacySources(workspace);
  const canRunStaging = snapshot.result.state === "ready_for_execution" && !isRunning;
  const canRunMigration =
    snapshot.result.state === "ready_for_execution" && surface.hasSqliteCandidate && !isRunning;

  async function handleRunStaging(): Promise<void> {
    if (!canRunStaging) {
      return;
    }

    setIsRunning(true);
    setActiveAction("staging");
    setRunError(null);

    try {
      const nextSnapshot = await executeImporterStaging();
      setSnapshot(nextSnapshot);
    } catch (error) {
      setRunError(toErrorMessage(error));
    } finally {
      setIsRunning(false);
      setActiveAction(null);
    }
  }

  async function handleRunMigration(): Promise<void> {
    if (!canRunMigration) {
      return;
    }

    setIsRunning(true);
    setActiveAction("migration");
    setRunError(null);

    try {
      const nextSnapshot = await executeImporterMigration();
      setSnapshot(nextSnapshot);
    } catch (error) {
      setRunError(toErrorMessage(error));
    } finally {
      setIsRunning(false);
      setActiveAction(null);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__copy">
          <p className="page-header__eyebrow">{t("importsLabel")}</p>
          <h1 className="page-header__title">{t("importsTitle")}</h1>
          <p className="page-header__body">{t("importsBody")}</p>
        </div>
        <div className="page-actions">
          <span className={`status-badge status-badge--${runtimeIsFallback ? "warn" : "success"}`}>
            {t(runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge")}
          </span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!canRunStaging}
            onClick={() => {
              void handleRunStaging();
            }}
          >
            {isRunning && activeAction === "staging"
              ? t("importerRunningStaging")
              : t("importerRunStaging")}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!canRunMigration}
            onClick={() => {
              void handleRunMigration();
            }}
          >
            {isRunning && activeAction === "migration"
              ? t("importerRunningMigration")
              : t("importerRunMigration")}
          </button>
        </div>
      </header>

      <section className="surface surface--hero">
        <div className="surface__header">
          <div className="surface__copy">
            <p className="surface__eyebrow">{t("importerLabel")}</p>
            <h2 className="surface__title">{t("importerTitle")}</h2>
          </div>
          <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
        </div>
        <p className="surface__body">{t(runtimeNoteBody)}</p>
        <div className="metric-grid">
          <article className="metric-card">
            <span className="metric-card__label">{t("importsDetectedSources")}</span>
            <strong>{surface.detectedLegacySourceCount}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("importerBlockingIssues")}</span>
            <strong>{surface.blockingIssueCount}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("importerWarnings")}</span>
            <strong>{surface.warningIssueCount}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("importerStagedFileCount")}</span>
            <strong>{snapshot.plan.staging.stagedFiles.length}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("sourcePriorityLabel")}</span>
            <strong>{snapshot.plan.validation.totals.discoveredSources}</strong>
          </article>
        </div>
      </section>

      <div className="surface-grid surface-grid--two">
        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("legacyInventory")}</p>
              <h2 className="surface__title">{t("importsDiscoveryTitle")}</h2>
            </div>
            <span className={`status-badge status-badge--${surface.readyForExecution ? "success" : "warn"}`}>
              {surface.readyForExecution ? t("importerStateReady") : t("importerStatePlanned")}
            </span>
          </div>
          <p className="surface__body">{t("importsDiscoveryBody")}</p>
          {legacySources.length === 0 ? (
            <div className="empty-state">
              <h3>{t("importsNoDiscoveredSourcesTitle")}</h3>
              <p>{t("importsNoDiscoveredSourcesBody")}</p>
            </div>
          ) : (
            <div className="subsurface-grid">
              {legacySources.map((source) => (
                <article key={source.id} className="subsurface">
                  <div className="subsurface__header">
                    <div>
                      <p className="collection-card__badge">{source.kind}</p>
                      <h3>{source.label}</h3>
                    </div>
                    <span className="status-badge status-badge--success">{t("found")}</span>
                  </div>
                  <p>{source.path}</p>
                </article>
              ))}
            </div>
          )}
          <dl className="path-list">
            <div className="path-row">
              <dt>{t("importsQueuePath")}</dt>
              <dd>{workspace.importsDir}</dd>
            </div>
            <div className="path-row">
              <dt>{t("cachePath")}</dt>
              <dd>{workspace.cacheDir}</dd>
            </div>
            <div className="path-row">
              <dt>{t("manifestPath")}</dt>
              <dd>{workspace.manifestPath}</dd>
            </div>
          </dl>
        </section>

        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("importerLabel")}</p>
              <h2 className="surface__title">{t("importerBody")}</h2>
            </div>
            <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
          </div>
          <p className="surface__body">
            {snapshot.result.state === "ready_for_execution"
              ? t("importerReadyHint")
              : t("importerBlockedHint")}
          </p>
          {!surface.hasSqliteCandidate ? (
            <article className="subsurface subsurface--warn">
              <p className="collection-card__badge">{t("importerExecutionWarning")}</p>
              <h3>{t("importerMigrationRequiresSqliteTitle")}</h3>
              <p>{t("importerMigrationRequiresSqliteBody")}</p>
            </article>
          ) : null}
          <div className="subsurface-grid">
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerSummary")}</p>
              <h3>{snapshot.result.summary}</h3>
              <p>{snapshot.plan.config.stagingRoot}</p>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerValidation")}</p>
              <h3>
                {snapshot.plan.validation.totals.blockingIssues} {t("importerBlockingIssues")}
              </h3>
              <p>
                {snapshot.plan.validation.totals.warningIssues} {t("importerWarnings")}
              </p>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerCommitBoundary")}</p>
              <h3>{snapshot.plan.commitBoundary.transactionScope}</h3>
              <p>{snapshot.plan.commitBoundary.rollbackStrategy}</p>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importsTransformStepsTitle")}</p>
              <h3>{snapshot.plan.transform.steps.length}</h3>
              <p>{snapshot.plan.staging.stagingDir}</p>
            </article>
          </div>
          <div className="subsurface-grid">
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerCheckpointWrites")}</p>
              <ul className="stack-list">
                {snapshot.plan.commitBoundary.checkpointWrites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importsTransformStepsTitle")}</p>
              <ul className="stack-list">
                {snapshot.plan.transform.steps.map((step) => (
                  <li key={step.id}>
                    <strong>{step.sourceEntity}</strong>
                    {" -> "}
                    {step.targetEntity} ({formatDesktopToken(step.mode)})
                  </li>
                ))}
              </ul>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerDroppedSurfaces")}</p>
              <ul className="stack-list">
                {snapshot.plan.transform.droppedSurfaces.map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </div>

      <div className="surface-grid surface-grid--two">
        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("importerValidation")}</p>
              <h2 className="surface__title">{t("importerNoIssues")}</h2>
            </div>
          </div>
          {runError ? (
            <article className="subsurface subsurface--warn">
              <p className="collection-card__badge">{t("importerExecutionError")}</p>
              <h3>{t("importerExecutionFailedTitle")}</h3>
              <p>{runError}</p>
            </article>
          ) : null}
          {snapshot.plan.validation.issues.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <h3>{t("importerNoIssues")}</h3>
              <p>{t("importerNoIssuesBody")}</p>
            </div>
          ) : (
            <div className="subsurface-grid">
              {snapshot.plan.validation.issues.map((issue) => (
                <article key={`${issue.code}-${issue.sourceId ?? "global"}`} className="subsurface">
                  <p className="collection-card__badge">{issue.severity}</p>
                  <h3>{issue.code}</h3>
                  <p>{issue.message}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("importerStagingDir")}</p>
              <h2 className="surface__title">{t("importerStagedFileCount")}</h2>
            </div>
            <span className="status-badge status-badge--muted">
              {snapshot.plan.staging.stagedFiles.length}
            </span>
          </div>
          {snapshot.plan.staging.stagedFiles.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <h3>{t("importsNoStagedFilesTitle")}</h3>
              <p>{t("importsNoStagedFilesBody")}</p>
            </div>
          ) : (
            <dl className="path-list">
              {snapshot.plan.staging.stagedFiles.map((file) => (
                <div key={file.stagedPath} className="path-row">
                  <dt>{formatDesktopToken(file.fileKind)}</dt>
                  <dd>{file.stagedPath}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      {execution ? (
        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("importerExecutionTitle")}</p>
              <h2 className="surface__title">{t("importerExecutionStateLabel")}</h2>
            </div>
            <span className={`status-badge status-badge--${executionStatus?.tone ?? "muted"}`}>
              {executionStatus?.label}
            </span>
          </div>
          <div className="subsurface-grid">
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerExecutionTitle")}</p>
              <h3>{execution.stagedFileCount}</h3>
              <p>{execution.copiedBytes.toLocaleString()} B</p>
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerAuditArtifact")}</p>
              <h3>{auditWriteStatusLabel(execution.auditWriteStatus, t)}</h3>
              <p>{t("runId")}: {execution.runId}</p>
            </article>
          </div>
          <dl className="path-list">
            <div className="path-row">
              <dt>{t("importerManifestPath")}</dt>
              <dd>{execution.manifestPath}</dd>
            </div>
            <div className="path-row">
              <dt>{t("importerAuditArtifactPath")}</dt>
              <dd>{execution.auditArtifactPath}</dd>
            </div>
          </dl>
          {execution.warnings.length > 0 ? (
            <div className="subsurface-grid">
              {execution.warnings.map((warning) => (
                <article key={warning} className="subsurface subsurface--warn">
                  <p className="collection-card__badge">{t("importerExecutionWarning")}</p>
                  <h3>{t("importerExecutionWarnings")}</h3>
                  <p>{warning}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {migration ? (
        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("importerMigrationTitle")}</p>
              <h2 className="surface__title">{migration.summary}</h2>
            </div>
            <span className={`status-badge status-badge--${migrationStatus?.tone ?? "muted"}`}>
              {migrationStatus?.label}
            </span>
          </div>
          <div className="subsurface-grid">
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerMigrationImported")}</p>
              {migration.importedCounts.length === 0 ? (
                <p>{t("importerMigrationNoImports")}</p>
              ) : (
                <ul className="stack-list">
                  {migration.importedCounts.map((item) => (
                    <li key={item.entity}>
                      {item.entity}: {item.count}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="subsurface">
              <p className="collection-card__badge">{t("importerMigrationDropped")}</p>
              {migration.droppedCounts.length === 0 ? (
                <p>{t("importerMigrationNoDropped")}</p>
              ) : (
                <ul className="stack-list">
                  {migration.droppedCounts.map((item) => (
                    <li key={item.entity}>
                      {item.entity}: {item.count} ({item.reason})
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
          <dl className="path-list">
            {migration.sourceDatabasePath ? (
              <div className="path-row">
                <dt>{t("importerMigrationSourcePath")}</dt>
                <dd>{migration.sourceDatabasePath}</dd>
              </div>
            ) : null}
            {migration.backupPath ? (
              <div className="path-row">
                <dt>{t("importerBackupPath")}</dt>
                <dd>{migration.backupPath}</dd>
              </div>
            ) : null}
          </dl>
          {migration.warnings.length > 0 ? (
            <div className="subsurface-grid">
              {migration.warnings.map((warning) => (
                <article key={warning} className="subsurface subsurface--warn">
                  <p className="collection-card__badge">{t("importerExecutionWarning")}</p>
                  <h3>{t("importerMigrationWarnings")}</h3>
                  <p>{warning}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export const importsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/imports",
  loader: loadImportsRouteData,
  component: ImportsRoute,
});

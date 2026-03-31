import { Link, createRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isBrowserFallbackRuntime,
  writeTemplateValidationExport,
  type TemplateValidationSource,
} from "../lib/desktop-api";
import {
  countTableRows,
  getDetectedLegacySources,
  loadLibraryRouteData,
} from "../lib/desktop-loaders";
import { formatDesktopToken } from "../lib/desktop-format";
import {
  buildTemplateValidationDocumentHtml,
  countVisibleValidationSections,
  formatBytes,
} from "../lib/template-validation";
import { rootRoute } from "./root";

type ViewMode = "grid" | "list";
type SortOption = "countDesc" | "countAsc" | "name";

interface LibraryCollectionItem {
  id: string;
  badge: string;
  title: string;
  body: string;
  value: string;
  count: number;
  meta: string;
  to: "/library" | "/imports" | "/settings";
  cta: string;
}

interface TemplateExportState {
  documentId: string | null;
  status: "idle" | "saving" | "success" | "error";
  outputPath: string | null;
  message: string | null;
}

const INITIAL_TEMPLATE_EXPORT_STATE: TemplateExportState = {
  documentId: null,
  status: "idle",
  outputPath: null,
  message: null,
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.2 13.2L17 17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1.2" fill="currentColor" />
      <rect x="12" y="3" width="5" height="5" rx="1.2" fill="currentColor" />
      <rect x="3" y="12" width="5" height="5" rx="1.2" fill="currentColor" />
      <rect x="12" y="12" width="5" height="5" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4" width="14" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="3" y="9" width="14" height="2.2" rx="1.1" fill="currentColor" />
      <rect x="3" y="14" width="14" height="2.2" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="5" cy="10" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

function mapBootstrapStatus(
  status: "created" | "reused",
  runtimeIsFallback: boolean,
  t: (key: string) => string,
): string {
  if (runtimeIsFallback) {
    return t("workspaceStateFallback");
  }

  return status === "created" ? t("bootstrapCreated") : t("bootstrapReused");
}

function mapMigrationStatus(
  status: "legacySourcesDetected" | "cleanWorkspace",
  runtimeIsFallback: boolean,
  t: (key: string) => string,
): string {
  if (runtimeIsFallback) {
    return t("migrationStateNeedsDesktop");
  }

  return status === "legacySourcesDetected" ? t("migrationPending") : t("migrationClean");
}

function CollectionPreview({ item }: { item: LibraryCollectionItem }) {
  return (
    <div className="collection-card__paper">
      <div className="collection-card__paper-sheet">
        <div className="collection-card__paper-line collection-card__paper-line--title" />
        <div className="collection-card__paper-line" />
        <div className="collection-card__paper-line collection-card__paper-line--short" />
        <div className="collection-card__paper-line" />
        <div className="collection-card__paper-line collection-card__paper-line--short" />
      </div>
      <span className="collection-card__paper-badge">{item.badge}</span>
      <strong className="collection-card__paper-value">{item.value}</strong>
    </div>
  );
}

function mapTemplateValidationSource(
  source: TemplateValidationSource,
  t: (key: string) => string,
): string {
  if (source === "workspace_documents") {
    return t("templateValidationSourceWorkspace");
  }

  if (source === "workspace_plus_native_sample_documents") {
    return t("templateValidationSourceMixed");
  }

  if (source === "native_sample_documents") {
    return t("templateValidationSourceNativeSample");
  }

  return t("templateValidationSourceFallback");
}

function buildSuggestedExportName(title: string, template: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "desktop-template"}-${template}`;
}

function LibraryRoute() {
  const { t } = useTranslation();
  const context = rootRoute.useLoaderData();
  const {
    workspace,
    storage,
    domainContract,
    importContract,
    templateValidation,
  } = libraryRoute.useLoaderData();
  const runtimeIsFallback = isBrowserFallbackRuntime(context);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("countDesc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedTemplateDocumentId, setSelectedTemplateDocumentId] = useState<
    string | null
  >(
    () => templateValidation.documents[0]?.metadata.id ?? null,
  );
  const [templateExportState, setTemplateExportState] = useState<TemplateExportState>(
    INITIAL_TEMPLATE_EXPORT_STATE,
  );

  const documentCount = countTableRows(storage, "documents");
  const sectionCount = countTableRows(storage, "document_sections");
  const sessionCount = countTableRows(storage, "ai_chat_sessions");
  const messageCount = countTableRows(storage, "ai_chat_messages");
  const analysisCount = countTableRows(storage, "ai_analysis_records");
  const auditCount = countTableRows(storage, "migration_audit");
  const detectedSources = getDetectedLegacySources(workspace);
  const storageHealthLabel = runtimeIsFallback
    ? t("storageHealthFallback")
    : storage.initialized
      ? t("storageReady")
      : t("storageNeedsAttention");
  const workspaceStateLabel = mapBootstrapStatus(
    workspace.bootstrapStatus,
    runtimeIsFallback,
    t,
  );
  const migrationStateLabel = mapMigrationStatus(
    workspace.migrationStatus,
    runtimeIsFallback,
    t,
  );
  const mappingsPreview = importContract.tableMappings.slice(0, 4);
  const templateValidationSourceLabel = mapTemplateValidationSource(
    templateValidation.source,
    t,
  );
  const resolvedSelectedTemplateDocumentId = templateValidation.documents.some(
    (document) => document.metadata.id === selectedTemplateDocumentId,
  )
    ? selectedTemplateDocumentId
    : templateValidation.documents[0]?.metadata.id ?? null;
  const selectedTemplateDocument = useMemo(
    () =>
      templateValidation.documents.find(
        (document) => document.metadata.id === resolvedSelectedTemplateDocumentId,
      ) ?? templateValidation.documents[0] ?? null,
    [resolvedSelectedTemplateDocumentId, templateValidation.documents],
  );
  const selectedTemplatePreviewHtml = useMemo(
    () =>
      selectedTemplateDocument
        ? buildTemplateValidationDocumentHtml(selectedTemplateDocument)
        : "",
    [selectedTemplateDocument],
  );
  const selectedTemplatePreviewSize = useMemo(
    () => formatBytes(new Blob([selectedTemplatePreviewHtml]).size),
    [selectedTemplatePreviewHtml],
  );
  const visibleTemplateSectionCount = selectedTemplateDocument
    ? countVisibleValidationSections(selectedTemplateDocument)
    : 0;
  const visibleTemplateExportState =
    templateExportState.documentId === selectedTemplateDocument?.metadata.id
      ? templateExportState
      : INITIAL_TEMPLATE_EXPORT_STATE;

  const collectionItems = useMemo<LibraryCollectionItem[]>(
    () => [
      {
        id: "documents",
        badge: t("storageLabel"),
        title: t("documentsCount"),
        body: t("storageBody"),
        value: `${documentCount}`,
        count: documentCount,
        meta: `${sectionCount} ${t("sectionsCount")}`,
        to: "/library",
        cta: t("storageTitle"),
      },
      {
        id: "sessions",
        badge: t("libraryLabel"),
        title: t("sessionsCount"),
        body: t(runtimeIsFallback ? "libraryBodyFallback" : "libraryBody"),
        value: `${sessionCount}`,
        count: sessionCount,
        meta: `${messageCount} ${t("messagesCount")}`,
        to: "/library",
        cta: t("libraryTitle"),
      },
      {
        id: "analyses",
        badge: t("readiness"),
        title: t("analysesCount"),
        body: t("readinessBody"),
        value: `${analysisCount}`,
        count: analysisCount,
        meta: `${auditCount} ${t("auditsCount")}`,
        to: "/library",
        cta: t("architecture"),
      },
      {
        id: "imports",
        badge: t("importsLabel"),
        title: t("importsTitle"),
        body: t("importsBody"),
        value: `${detectedSources.length}`,
        count: detectedSources.length,
        meta: `${importContract.tableMappings.length} ${t("migrationMappingsCount")}`,
        to: "/imports",
        cta: t("navImports"),
      },
      {
        id: "templates",
        badge: t("libraryTemplatesTitle"),
        title: t("libraryTemplatesHeader"),
        body: t("libraryTemplatesBody"),
        value: `${domainContract.supportedSectionTypes.length}`,
        count: domainContract.supportedSectionTypes.length,
        meta: `v${domainContract.contractVersion}`,
        to: "/settings",
        cta: t("navSettings"),
      },
    ],
    [
      analysisCount,
      auditCount,
      detectedSources.length,
      documentCount,
      domainContract.contractVersion,
      domainContract.supportedSectionTypes.length,
      importContract.tableMappings.length,
      messageCount,
      runtimeIsFallback,
      sectionCount,
      sessionCount,
      t,
    ],
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = query
      ? collectionItems.filter((item) =>
          `${item.badge} ${item.title} ${item.body} ${item.meta}`
            .toLowerCase()
            .includes(query),
        )
      : collectionItems;

    return [...matches].sort((left, right) => {
      if (sortOption === "name") {
        return left.title.localeCompare(right.title);
      }

      if (sortOption === "countAsc") {
        return left.count - right.count;
      }

      return right.count - left.count;
    });
  }, [collectionItems, searchQuery, sortOption]);

  async function handleTemplateExport(): Promise<void> {
    if (!selectedTemplateDocument || !selectedTemplatePreviewHtml) {
      return;
    }

    setTemplateExportState({
      documentId: selectedTemplateDocument.metadata.id,
      status: "saving",
      outputPath: null,
      message: null,
    });

    try {
      const receipt = await writeTemplateValidationExport({
        fileName: buildSuggestedExportName(
          selectedTemplateDocument.metadata.title,
          selectedTemplateDocument.metadata.template,
        ),
        html: selectedTemplatePreviewHtml,
      });

      setTemplateExportState({
        documentId: selectedTemplateDocument.metadata.id,
        status: "success",
        outputPath: receipt.outputPath,
        message: null,
      });
    } catch (error) {
      setTemplateExportState({
        documentId: selectedTemplateDocument.metadata.id,
        status: "error",
        outputPath: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__copy">
          <p className="page-header__eyebrow">{t("libraryLabel")}</p>
          <h1 className="page-header__title">{t("libraryTitle")}</h1>
          <p className="page-header__body">
            {t(runtimeIsFallback ? "libraryBodyFallback" : "libraryBody")}
          </p>
        </div>
        <div className="page-actions">
          <span className={`status-badge status-badge--${runtimeIsFallback ? "warn" : "success"}`}>
            {t(runtimeIsFallback ? "runtimeFallbackBadge" : "runtimeNativeBadge")}
          </span>
          <Link className="button button--secondary" to="/imports">
            {t("navImports")}
          </Link>
          <Link className="button button--primary" to="/settings">
            {t("navSettings")}
          </Link>
        </div>
      </header>

      <section className="surface surface--hero">
        <div className="surface__header">
          <div className="surface__copy">
            <p className="surface__eyebrow">{t("libraryFocus")}</p>
            <h2 className="surface__title">{t("libraryFocusTitle")}</h2>
          </div>
          <span className="status-badge status-badge--muted">{storageHealthLabel}</span>
        </div>
        <p className="surface__body">
          {t(
            runtimeIsFallback ? "libraryRuntimeFallbackBody" : "libraryRuntimeNativeBody",
          )}
        </p>
        <div className="metric-grid">
          <article className="metric-card">
            <span className="metric-card__label">{t("documentsCount")}</span>
            <strong>{documentCount}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("sessionsCount")}</span>
            <strong>{sessionCount}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("importsDetectedSources")}</span>
            <strong>{detectedSources.length}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("workspaceState")}</span>
            <strong>{workspaceStateLabel}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-card__label">{t("migrationState")}</span>
            <strong>{migrationStateLabel}</strong>
          </article>
        </div>
      </section>

      <section className="surface">
        <div className="surface__header">
          <div className="surface__copy">
            <p className="surface__eyebrow">{t("templateContractLabel")}</p>
            <h2 className="surface__title">{t("templateValidationTitle")}</h2>
          </div>
          <span className="status-badge status-badge--muted">
            {templateValidationSourceLabel}
          </span>
        </div>
        <p className="surface__body">
          {t(
            runtimeIsFallback
              ? "templateValidationFallbackBody"
              : "templateValidationNativeBody",
          )}
        </p>

        {!selectedTemplateDocument ? (
          <div className="empty-state empty-state--compact">
            <h3>{t("templateValidationNoDocumentsTitle")}</h3>
            <p>{t("templateValidationNoDocumentsBody")}</p>
          </div>
        ) : (
          <>
            <div className="template-validation-toolbar">
              <div
                className="template-validation-switcher"
                role="tablist"
                aria-label={t("templateValidationTitle")}
              >
                {templateValidation.documents.map((document) => {
                  const isActive =
                    document.metadata.id === selectedTemplateDocument.metadata.id;

                  return (
                    <button
                      key={document.metadata.id}
                      type="button"
                      className={`template-chip ${isActive ? "template-chip--active" : ""}`}
                      onClick={() => {
                        setSelectedTemplateDocumentId(document.metadata.id);
                        setTemplateExportState(INITIAL_TEMPLATE_EXPORT_STATE);
                      }}
                      aria-pressed={isActive}
                    >
                      <span className="template-chip__title">
                        {formatDesktopToken(document.metadata.template)}
                      </span>
                      <span className="template-chip__meta">
                        {document.metadata.title}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="tag-list">
                {templateValidation.representativeTemplates.map((templateId) => (
                  <span key={templateId} className="tag">
                    {formatDesktopToken(templateId)}
                  </span>
                ))}
              </div>
            </div>

            <div className="template-validation-grid">
              <article className="subsurface template-preview-surface">
                <div className="subsurface__header">
                  <div>
                    <p className="collection-card__badge">
                      {t("templateValidationPreviewTitle")}
                    </p>
                    <h3>{selectedTemplateDocument.metadata.title}</h3>
                  </div>
                  <span className="status-badge status-badge--muted">
                    {selectedTemplateDocument.metadata.language.toUpperCase()}
                  </span>
                </div>
                <div className="template-preview-frame">
                  <iframe
                    title={selectedTemplateDocument.metadata.title}
                    className="template-preview-iframe"
                    srcDoc={selectedTemplatePreviewHtml}
                  />
                </div>
              </article>

              <div className="template-validation-sidebar">
                <article className="subsurface">
                  <p className="collection-card__badge">{t("templateValidationContractTitle")}</p>
                  <h3>{t("templateValidationDocumentTitle")}</h3>
                  <dl className="template-stat-list">
                    <div className="template-stat-row">
                      <dt>{t("templateValidationTemplateLabel")}</dt>
                      <dd>{formatDesktopToken(selectedTemplateDocument.metadata.template)}</dd>
                    </div>
                    <div className="template-stat-row">
                      <dt>{t("templateValidationSourceLabel")}</dt>
                      <dd>{templateValidationSourceLabel}</dd>
                    </div>
                    <div className="template-stat-row">
                      <dt>{t("templateValidationVisibleSections")}</dt>
                      <dd>{visibleTemplateSectionCount}</dd>
                    </div>
                    <div className="template-stat-row">
                      <dt>{t("templateValidationHtmlSize")}</dt>
                      <dd>{selectedTemplatePreviewSize}</dd>
                    </div>
                  </dl>
                </article>

                <article className="subsurface">
                  <div className="subsurface__header">
                    <div>
                      <p className="collection-card__badge">
                        {t("templateValidationExportTitle")}
                      </p>
                      <h3>{t("libraryExportsHeader")}</h3>
                    </div>
                    <button
                      type="button"
                      className="button button--primary template-export-button"
                      onClick={() => void handleTemplateExport()}
                      disabled={
                        runtimeIsFallback ||
                        visibleTemplateExportState.status === "saving" ||
                        !selectedTemplatePreviewHtml
                      }
                    >
                      {visibleTemplateExportState.status === "saving"
                        ? t("templateValidationExporting")
                        : t("templateValidationExportButton")}
                    </button>
                  </div>
                  <p className="surface__body surface__body--compact">
                    {runtimeIsFallback
                      ? t("templateValidationExportDisabledFallback")
                      : t("templateValidationExportBody")}
                  </p>
                  {visibleTemplateExportState.status === "success" &&
                  visibleTemplateExportState.outputPath ? (
                    <div className="template-export-status template-export-status--success">
                      <strong>{t("templateValidationExportSuccess")}</strong>
                      <span>{visibleTemplateExportState.outputPath}</span>
                    </div>
                  ) : null}
                  {visibleTemplateExportState.status === "error" &&
                  visibleTemplateExportState.message ? (
                    <div className="template-export-status template-export-status--error">
                      <strong>{t("templateValidationExportError")}</strong>
                      <span>{visibleTemplateExportState.message}</span>
                    </div>
                  ) : null}
                </article>

                <article className="subsurface">
                  <p className="collection-card__badge">{t("templateValidationSectionsTitle")}</p>
                  <h3>{t("templateValidationRepresentativeTemplates")}</h3>
                  <div className="tag-list">
                    {selectedTemplateDocument.sections
                      .filter((section) => section.visible)
                      .map((section) => (
                        <span
                          key={section.id}
                          className="tag"
                        >
                          {formatDesktopToken(section.sectionType)}
                        </span>
                      ))}
                  </div>
                </article>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="surface">
        <div className="surface__header">
          <div className="surface__copy">
            <p className="surface__eyebrow">{t("workstreams")}</p>
            <h2 className="surface__title">{t("libraryFocusTitle")}</h2>
          </div>
        </div>
        <div className="collection-toolbar">
          <label className="search-field">
            <span className="search-field__icon">
              <SearchIcon />
            </span>
            <span className="search-field__label">{t("libraryToolbarSearchPlaceholder")}</span>
            <input
              type="search"
              className="search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("libraryToolbarSearchPlaceholder")}
            />
          </label>

          <label className="select-field">
            <span className="select-field__label">{t("librarySortLabel")}</span>
            <select
              className="select-input"
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
            >
              <option value="countDesc">{t("sortByHighestCount")}</option>
              <option value="countAsc">{t("sortByLowestCount")}</option>
              <option value="name">{t("sortByName")}</option>
            </select>
          </label>

          <div className="view-toggle" role="tablist" aria-label={t("librarySortLabel")}>
            <button
              type="button"
              className={`view-toggle__button ${viewMode === "grid" ? "view-toggle__button--active" : ""}`}
              onClick={() => setViewMode("grid")}
              title={t("viewGrid")}
            >
              <GridIcon />
              <span className="sr-only">{t("viewGrid")}</span>
            </button>
            <button
              type="button"
              className={`view-toggle__button ${viewMode === "list" ? "view-toggle__button--active" : ""}`}
              onClick={() => setViewMode("list")}
              title={t("viewList")}
            >
              <ListIcon />
              <span className="sr-only">{t("viewList")}</span>
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <h3>{t("libraryNoResultsTitle")}</h3>
            <p>{t("libraryNoResultsBody")}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="collection-grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="collection-card">
                <div className="collection-card__preview">
                  <CollectionPreview item={item} />
                  <Link className="collection-card__menu" to={item.to} aria-label={item.cta}>
                    <MoreIcon />
                  </Link>
                </div>
                <div className="collection-card__body">
                  <div className="collection-card__header">
                    <div className="collection-card__title-group">
                      <p className="collection-card__badge">{item.badge}</p>
                      <h3>{item.title}</h3>
                    </div>
                  </div>
                  <p>{item.body}</p>
                  <div className="collection-card__meta">
                    <span className="collection-card__meta-chip">{item.meta}</span>
                  </div>
                  <Link className="text-link" to={item.to}>
                    {item.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="collection-list">
            {filteredItems.map((item) => (
              <article key={item.id} className="collection-list-item">
                <div className="collection-list-item__preview">
                  <CollectionPreview item={item} />
                </div>
                <div className="collection-list-item__main">
                  <p className="collection-card__badge">{item.badge}</p>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <div className="collection-list-item__aside">
                  <span className="collection-card__meta-chip">{item.meta}</span>
                  <Link className="text-link" to={item.to}>
                    {item.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="surface-grid surface-grid--two">
        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("storageLabel")}</p>
              <h2 className="surface__title">{t("storageTitle")}</h2>
            </div>
            <span className="status-badge status-badge--muted">v{storage.schemaVersion}</span>
          </div>
          <p className="surface__body">{t("storageBody")}</p>
          <dl className="path-list">
            <div className="path-row">
              <dt>{t("storageRoot")}</dt>
              <dd>{storage.workspaceRoot}</dd>
            </div>
            <div className="path-row">
              <dt>{t("databasePath")}</dt>
              <dd>{storage.databasePath}</dd>
            </div>
            <div className="path-row">
              <dt>{t("manifestPath")}</dt>
              <dd>{workspace.manifestPath}</dd>
            </div>
            <div className="path-row">
              <dt>{t("workspaceId")}</dt>
              <dd>{storage.workspaceId}</dd>
            </div>
          </dl>
        </section>

        <section className="surface">
          <div className="surface__header">
            <div className="surface__copy">
              <p className="surface__eyebrow">{t("migrationContractLabel")}</p>
              <h2 className="surface__title">{t("migrationContractTitle")}</h2>
            </div>
            <span className="status-badge status-badge--muted">
              {importContract.tableMappings.length}
            </span>
          </div>
          <p className="surface__body">{t("migrationContractBody")}</p>
          <div className="tag-list">
            {domainContract.supportedSectionTypes.slice(0, 8).map((sectionType) => (
              <span key={sectionType} className="tag">
                {formatDesktopToken(sectionType)}
              </span>
            ))}
          </div>
          <div className="subsurface-grid">
            {mappingsPreview.map((mapping) => (
              <article key={`${mapping.source}-${mapping.target}`} className="subsurface">
                <p className="collection-card__badge">{formatDesktopToken(mapping.action)}</p>
                <h3>
                  {mapping.source} -&gt; {mapping.target}
                </h3>
                <p>{mapping.notes}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="surface">
        <div className="surface__header">
          <div className="surface__copy">
            <p className="surface__eyebrow">{t("legacyInventory")}</p>
            <h2 className="surface__title">{t("importsDetectedSources")}</h2>
          </div>
        </div>
        <div className="subsurface-grid">
          {workspace.legacySources.map((source) => (
            <article key={source.id} className="subsurface">
              <div className="subsurface__header">
                <div>
                  <p className="collection-card__badge">{source.kind}</p>
                  <h3>{source.label}</h3>
                </div>
                <span
                  className={`status-badge status-badge--${source.exists ? "success" : "muted"}`}
                >
                  {source.exists ? t("found") : t("missing")}
                </span>
              </div>
              <p>{source.path}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  loader: loadLibraryRouteData,
  component: LibraryRoute,
});

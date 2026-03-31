import { invoke } from "@tauri-apps/api/core";

export type DesktopRuntimeMode = "tauri" | "browser_fallback";

export interface BootstrapContext {
  appName: string;
  appVersion: string;
  frontendShell: string;
  runtime: string;
  platform: string;
  buildChannel: string;
  branch: string;
  runtimeMode: DesktopRuntimeMode;
  supportsNativeCommands: boolean;
  limitations: string[];
}

export interface LegacySourceSnapshot {
  id: string;
  label: string;
  kind: string;
  path: string;
  exists: boolean;
}

export interface WorkspaceSnapshot {
  schemaVersion: number;
  workspaceId: string;
  bootstrapStatus: "created" | "reused";
  migrationStatus: "legacySourcesDetected" | "cleanWorkspace";
  createdAtEpochMs: number;
  lastOpenedAtEpochMs: number;
  rootDir: string;
  manifestPath: string;
  databasePath: string;
  secureSettingsPath: string;
  documentsDir: string;
  exportsDir: string;
  importsDir: string;
  cacheDir: string;
  manifestsDir: string;
  legacySources: LegacySourceSnapshot[];
}

export interface TableCountSnapshot {
  table: string;
  rowCount: number;
}

export interface StorageSnapshot {
  schemaVersion: number;
  bootstrapStatus: "created" | "reused";
  workspaceRoot: string;
  databasePath: string;
  workspaceId: string;
  initialized: boolean;
  sqliteVersion: string;
  tableCounts: TableCountSnapshot[];
}

export type WorkspaceModel = "single_workspace";

export type ResumeSectionType =
  | "personal_info"
  | "qr_codes"
  | "summary"
  | "work_experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "languages"
  | "custom"
  | "github";

export type AvatarStyle = "circle" | "one_inch";

export interface ResumePageMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResumeThemeConfig {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: string;
  lineSpacing: number;
  margin: ResumePageMargin;
  sectionSpacing: number;
  avatarStyle: AvatarStyle;
}

export type AiProvider = "openai" | "anthropic" | "gemini";

export interface ProviderRuntimeContract {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKeySecretKey: string;
}

export interface ExaPoolSettingsContract {
  baseUrl: string;
  apiKeySecretKey: string;
}

export interface WorkspaceContractSettings {
  ai: {
    defaultProvider: AiProvider;
    providers: ProviderRuntimeContract[];
    exaPool: ExaPoolSettingsContract;
  };
  editor: {
    autoSave: boolean;
    autoSaveIntervalMs: number;
  };
}

export type DomainLegacySourceKind = "sqlite" | "secure_settings" | "window_state";

export interface LegacySourceDescriptor {
  kind: DomainLegacySourceKind;
  path: string;
  storageProfile: string;
}

export type MigrationCheckpointStatus = "pending" | "passed" | "failed" | "skipped";

export interface MigrationCheckpoint {
  name: string;
  required: boolean;
  status: MigrationCheckpointStatus;
  notes: string | null;
}

export type MigrationStatus =
  | "pending"
  | "legacy_sources_detected"
  | "validation_failed"
  | "imported";

export interface MigrationEnvelope {
  source: LegacySourceDescriptor;
  targetSchemaVersion: number;
  status: MigrationStatus;
  checkpoints: MigrationCheckpoint[];
}

export interface DomainContractSummary {
  contractVersion: number;
  workspaceModel: WorkspaceModel;
  supportedSectionTypes: ResumeSectionType[];
  defaultTheme: ResumeThemeConfig;
  defaultSettings: WorkspaceContractSettings;
  migrationEnvelopeTemplate: MigrationEnvelope;
}

export interface ProviderRuntimeSettings {
  baseUrl: string;
  model: string;
}

export interface WorkspaceSettingsDocument {
  schemaVersion: number;
  locale: string;
  theme: string;
  ai: {
    defaultProvider: string;
    providerConfigs: Record<string, ProviderRuntimeSettings>;
    exaPoolBaseUrl: string;
  };
  editor: {
    autoSave: boolean;
    autoSaveIntervalMs: number;
  };
  window: {
    rememberWindowState: boolean;
    restoreLastWorkspace: boolean;
  };
  updatedAtEpochMs: number;
}

export type LegacyImportSourceKind =
  | "sqliteDatabase"
  | "secureSettings"
  | "windowState"
  | "localStorageFallback";

export type LegacyTableAction =
  | "importAsIs"
  | "importWithTransform"
  | "mergeIntoWorkspace"
  | "dropWithAudit";

export interface LegacyTableMapping {
  source: string;
  target: string;
  action: LegacyTableAction;
  notes: string;
}

export interface LegacyImportContract {
  sourcePriority: LegacyImportSourceKind[];
  tableMappings: LegacyTableMapping[];
  droppedSurfaces: string[];
}

export type SecretVaultBackend =
  | "unconfigured"
  | "os_keyring"
  | "stronghold"
  | "file_fallback";

export type SecretVaultReadiness =
  | "ready"
  | "needs_configuration"
  | "degraded";

export interface SecretVaultStatus {
  backend: SecretVaultBackend;
  encryptedAtRest: boolean;
  status: SecretVaultReadiness;
  warnings: string[];
  manifestPath: string;
  fallbackPath: string;
  registeredSecretCount: number;
}

export type ImporterSourceKind =
  | "sqlite_database"
  | "secure_settings"
  | "window_state"
  | "local_storage_fallback";

export type StagingAction = "copy" | "skip_missing" | "ignore_unsupported";

export type ValidationSeverity = "blocking" | "warning" | "info";

export type TransformMode =
  | "import_as_is"
  | "import_with_transform"
  | "merge_into_workspace"
  | "drop_with_audit";

export type RollbackStrategy =
  | "staging_cleanup_only"
  | "transaction_rollback_and_backup_restore";

export type ImporterState =
  | "planned"
  | "dry_run_failed"
  | "ready_for_execution";

export type StagingExecutionState = "success" | "partial" | "failed";

export type AuditWriteStatus = "written" | "skipped" | "failed";

export type MigrationExecutionState = "success" | "failed";

export interface DiscoveredSource {
  id: string;
  sourceKind: ImporterSourceKind;
  path: string;
  exists: boolean;
  priority: number;
}

export interface StagedFile {
  sourceId: string;
  sourcePath: string;
  stagedPath: string;
  fileKind: ImporterSourceKind;
}

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  sourceId?: string | null;
}

export interface TransformStep {
  id: string;
  sourceEntity: string;
  targetEntity: string;
  mode: TransformMode;
  notes: string;
}

export interface DroppedSurface {
  name: string;
  reason: string;
}

export interface ImporterDryRunSnapshot {
  plan: {
    version: number;
    config: {
      runId: string;
      workspaceRoot: string;
      workspaceDatabasePath: string;
      stagingRoot: string;
      strictMode: boolean;
    };
    discovery: {
      sources: DiscoveredSource[];
      hasViableInput: boolean;
      warnings: string[];
    };
    staging: {
      stagingDir: string;
      stagedFiles: StagedFile[];
      actions: StagingAction[];
    };
    validation: {
      totals: {
        discoveredSources: number;
        stagedFiles: number;
        blockingIssues: number;
        warningIssues: number;
      };
      issues: ValidationIssue[];
      isReadyForTransform: boolean;
    };
    transform: {
      targetSchemaVersion: number;
      steps: TransformStep[];
      droppedSurfaces: DroppedSurface[];
    };
    commitBoundary: {
      transactionScope: string;
      rollbackStrategy: RollbackStrategy;
      checkpointWrites: string[];
    };
  };
  result: {
    runId: string;
    state: ImporterState;
    summary: string;
    blockingIssues: ValidationIssue[];
  };
  stagingExecution?: StagingExecutionResult | null;
  migrationExecution?: MigrationExecutionResult | null;
}

export interface StagingExecutionResult {
  runId: string;
  state: StagingExecutionState;
  stagedFileCount: number;
  copiedBytes: number;
  manifestPath: string;
  auditArtifactPath: string;
  auditWriteStatus: AuditWriteStatus;
  warnings: string[];
}

export interface MigrationEntityCount {
  entity: string;
  count: number;
}

export interface DroppedEntityCount {
  entity: string;
  count: number;
  reason: string;
}

export interface MigrationExecutionResult {
  runId: string;
  state: MigrationExecutionState;
  summary: string;
  sourceDatabasePath?: string | null;
  backupPath?: string | null;
  importedCounts: MigrationEntityCount[];
  droppedCounts: DroppedEntityCount[];
  warningCount: number;
  warnings: string[];
  auditRowsWritten: number;
}

const FALLBACK_CONTEXT: BootstrapContext = {
  appName: "RoleRover Desktop",
  appVersion: "0.1.0",
  frontendShell: "React + Vite + TanStack Router + react-i18next",
  runtime: "Tauri bootstrap shell (browser fallback)",
  platform: "browser",
  buildChannel: "development",
  branch: "tauri-rust-desktop-rewrite",
  runtimeMode: "browser_fallback",
  supportsNativeCommands: false,
  limitations: [
    "Native Tauri commands are unavailable in browser fallback mode.",
    "Workspace, storage, settings, and importer snapshots are placeholders for shell development only.",
    "Use the desktop shell to validate real filesystem, secrets, and migration behavior.",
  ],
};

const FALLBACK_WORKSPACE: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspaceId: "browser-fallback",
  bootstrapStatus: "created",
  migrationStatus: "cleanWorkspace",
  createdAtEpochMs: 0,
  lastOpenedAtEpochMs: 0,
  rootDir: "desktop/workspace",
  manifestPath: "desktop/workspace/manifests/workspace.json",
  databasePath: "desktop/workspace/rolerover.db",
  secureSettingsPath: "desktop/workspace/secrets/vault-fallback.json",
  documentsDir: "desktop/workspace/documents",
  exportsDir: "desktop/workspace/exports",
  importsDir: "desktop/workspace/imports",
  cacheDir: "desktop/workspace/cache",
  manifestsDir: "desktop/workspace/manifests",
  legacySources: [],
};

const FALLBACK_STORAGE: StorageSnapshot = {
  schemaVersion: 1,
  bootstrapStatus: "created",
  workspaceRoot: "desktop/workspace",
  databasePath: "desktop/workspace/rolerover.db",
  workspaceId: "browser-workspace",
  initialized: false,
  sqliteVersion: "browser-fallback",
  tableCounts: [],
};

const FALLBACK_DOMAIN_CONTRACT: DomainContractSummary = {
  contractVersion: 1,
  workspaceModel: "single_workspace",
  supportedSectionTypes: [
    "personal_info",
    "qr_codes",
    "summary",
    "work_experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "languages",
    "custom",
    "github",
  ],
  defaultTheme: {
    primaryColor: "#111827",
    accentColor: "#2563eb",
    fontFamily: "Inter",
    fontSize: "14px",
    lineSpacing: 1.6,
    margin: {
      top: 24,
      right: 24,
      bottom: 24,
      left: 24,
    },
    sectionSpacing: 16,
    avatarStyle: "circle",
  },
  defaultSettings: {
    ai: {
      defaultProvider: "openai",
      providers: [
        {
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          apiKeySecretKey: "provider.openai.api_key",
        },
        {
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-20250514",
          apiKeySecretKey: "provider.anthropic.api_key",
        },
        {
          provider: "gemini",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: "gemini-2.0-flash",
          apiKeySecretKey: "provider.gemini.api_key",
        },
      ],
      exaPool: {
        baseUrl: "",
        apiKeySecretKey: "provider.exa_pool.api_key",
      },
    },
    editor: {
      autoSave: true,
      autoSaveIntervalMs: 500,
    },
  },
  migrationEnvelopeTemplate: {
    source: {
      kind: "sqlite",
      path: "workspace/imports/legacy/jade.db",
      storageProfile: "electron-next-local",
    },
    targetSchemaVersion: 1,
    status: "pending",
    checkpoints: [
      {
        name: "source-discovery",
        required: true,
        status: "pending",
        notes: null,
      },
      {
        name: "schema-validation",
        required: true,
        status: "pending",
        notes: null,
      },
      {
        name: "content-import",
        required: true,
        status: "pending",
        notes: null,
      },
      {
        name: "secure-settings-import",
        required: false,
        status: "pending",
        notes: "Skipped when no secure settings store is detected.",
      },
    ],
  },
};

const FALLBACK_SETTINGS: WorkspaceSettingsDocument = {
  schemaVersion: 1,
  locale: "zh",
  theme: "system",
  ai: {
    defaultProvider: "openai",
    providerConfigs: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
      },
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514",
      },
      gemini: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.0-flash",
      },
    },
    exaPoolBaseUrl: "",
  },
  editor: {
    autoSave: true,
    autoSaveIntervalMs: 500,
  },
  window: {
    rememberWindowState: true,
    restoreLastWorkspace: true,
  },
  updatedAtEpochMs: 0,
};

const FALLBACK_LEGACY_IMPORT_CONTRACT: LegacyImportContract = {
  sourcePriority: [
    "secureSettings",
    "sqliteDatabase",
    "localStorageFallback",
    "windowState",
  ],
  tableMappings: [
    {
      source: "users",
      target: "workspace metadata",
      action: "mergeIntoWorkspace",
      notes:
        "Single-workspace migration; user identity is not retained at runtime.",
    },
    {
      source: "auth_accounts",
      target: "migration audit",
      action: "dropWithAudit",
      notes: "Desktop runtime does not preserve OAuth account sessions.",
    },
    {
      source: "resumes",
      target: "documents",
      action: "importWithTransform",
      notes: "Drop share fields and normalize optional target fields.",
    },
    {
      source: "resume_sections",
      target: "document_sections",
      action: "importWithTransform",
      notes: "Repair malformed content JSON to empty object and emit warning.",
    },
    {
      source: "chat_sessions",
      target: "ai_chat_sessions",
      action: "importAsIs",
      notes: "Relink sessions to migrated document IDs.",
    },
    {
      source: "chat_messages",
      target: "ai_chat_messages",
      action: "importAsIs",
      notes: "Preserve role/content/metadata payloads.",
    },
    {
      source: "resume_shares",
      target: "none",
      action: "dropWithAudit",
      notes: "Public share surface is removed in desktop-first scope.",
    },
    {
      source: "jd_analyses",
      target: "ai_analysis_records(type=jd)",
      action: "importWithTransform",
      notes: "Preserve result payload and score fields.",
    },
    {
      source: "grammar_checks",
      target: "ai_analysis_records(type=grammar)",
      action: "importWithTransform",
      notes: "Preserve result payload and score fields.",
    },
  ],
  droppedSurfaces: [
    "online share tokens",
    "public share views",
    "request fingerprint runtime identity",
    "oauth session runtime records",
  ],
};

const FALLBACK_VAULT_STATUS: SecretVaultStatus = {
  backend: "unconfigured",
  encryptedAtRest: false,
  status: "needs_configuration",
  warnings: ["Vault backend is not configured in browser fallback mode."],
  manifestPath: "desktop/workspace/secrets/secrets-manifest.json",
  fallbackPath: "desktop/workspace/secrets/vault-fallback.json",
  registeredSecretCount: 0,
};

const FALLBACK_IMPORTER_DRY_RUN: ImporterDryRunSnapshot = {
  plan: {
    version: 1,
    config: {
      runId: "browser-fallback",
      workspaceRoot: "desktop/workspace",
      workspaceDatabasePath: "desktop/workspace/rolerover.db",
      stagingRoot: "desktop/workspace/imports/staging/browser-fallback",
      strictMode: false,
    },
    discovery: {
      sources: [],
      hasViableInput: false,
      warnings: ["Importer dry-run is unavailable in browser fallback mode."],
    },
    staging: {
      stagingDir: "desktop/workspace/imports/staging/browser-fallback",
      stagedFiles: [],
      actions: [],
    },
    validation: {
      totals: {
        discoveredSources: 0,
        stagedFiles: 0,
        blockingIssues: 1,
        warningIssues: 0,
      },
      issues: [
        {
          code: "browser_fallback",
          severity: "blocking",
          message:
            "Tauri importer dry-run is unavailable in browser fallback mode.",
          sourceId: null,
        },
      ],
      isReadyForTransform: false,
    },
    transform: {
      targetSchemaVersion: 1,
      steps: [],
      droppedSurfaces: [],
    },
    commitBoundary: {
      transactionScope: "workspace-db + migration-audit + secrets-adapter",
      rollbackStrategy: "transaction_rollback_and_backup_restore",
      checkpointWrites: [],
    },
  },
  result: {
    runId: "browser-fallback",
    state: "dry_run_failed",
    summary: "Importer dry-run is unavailable in browser fallback mode.",
    blockingIssues: [
      {
        code: "browser_fallback",
        severity: "blocking",
        message:
          "Tauri importer dry-run is unavailable in browser fallback mode.",
        sourceId: null,
      },
    ],
  },
  stagingExecution: null,
  migrationExecution: null,
};

function reportDesktopFallback(command: string, error: unknown): void {
  console.warn(`[desktop-api] Falling back for ${command}.`, error);
}

async function invokeWithFallback<T>(command: string, fallback: T): Promise<T> {
  try {
    return await invoke<T>(command);
  } catch (error) {
    reportDesktopFallback(command, error);
    return fallback;
  }
}

export function isBrowserFallbackRuntime(context: BootstrapContext): boolean {
  return context.runtimeMode === "browser_fallback";
}

export async function getBootstrapContext(): Promise<BootstrapContext> {
  return invokeWithFallback("get_bootstrap_context", FALLBACK_CONTEXT);
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invokeWithFallback("get_workspace_snapshot", FALLBACK_WORKSPACE);
}

export async function getDomainContractSummary(): Promise<DomainContractSummary> {
  return invokeWithFallback(
    "get_domain_contract_summary",
    FALLBACK_DOMAIN_CONTRACT,
  );
}

export async function getLegacyImportContract(): Promise<LegacyImportContract> {
  return invokeWithFallback(
    "get_legacy_import_contract",
    FALLBACK_LEGACY_IMPORT_CONTRACT,
  );
}

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  return invokeWithFallback("get_storage_snapshot", FALLBACK_STORAGE);
}

export async function getWorkspaceSettingsSnapshot(): Promise<WorkspaceSettingsDocument> {
  return invokeWithFallback("get_workspace_settings_snapshot", FALLBACK_SETTINGS);
}

export async function getSecretVaultStatus(): Promise<SecretVaultStatus> {
  return invokeWithFallback("get_secret_vault_status", FALLBACK_VAULT_STATUS);
}

export async function getImporterDryRun(): Promise<ImporterDryRunSnapshot> {
  return invokeWithFallback("get_importer_dry_run", FALLBACK_IMPORTER_DRY_RUN);
}

export async function executeImporterStaging(): Promise<ImporterDryRunSnapshot> {
  return invoke<ImporterDryRunSnapshot>("execute_importer_staging");
}

export async function executeImporterMigration(): Promise<ImporterDryRunSnapshot> {
  return invoke<ImporterDryRunSnapshot>("execute_importer_migration");
}

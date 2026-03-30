#![allow(dead_code)]

use crate::settings;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const IMPORTER_PLAN_VERSION: u32 = 1;
pub const IMPORTER_STAGING_MANIFEST_VERSION: u32 = 1;
pub const IMPORTER_STAGING_AUDIT_VERSION: u32 = 1;

const STAGING_MANIFEST_FILE: &str = "importer-staging-manifest.json";
const STAGING_AUDIT_FILE: &str = "importer-staging-audit.json";
const WORKSPACE_DB_BACKUP_FILE: &str = "workspace-db-backup.sqlite";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterConfig {
    pub run_id: String,
    pub workspace_root: String,
    pub workspace_database_path: String,
    pub staging_root: String,
    pub strict_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDiscoveryInput {
    pub app_data_root: String,
    pub allow_local_storage_fallback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSource {
    pub id: String,
    pub source_kind: LegacySourceKind,
    pub path: String,
    pub exists: bool,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LegacySourceKind {
    SqliteDatabase,
    SecureSettings,
    WindowState,
    LocalStorageFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiscoveryResult {
    pub sources: Vec<DiscoveredSource>,
    pub has_viable_input: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagingPlan {
    pub staging_dir: String,
    pub staged_files: Vec<StagedFile>,
    pub actions: Vec<StagingAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedFile {
    pub source_id: String,
    pub source_path: String,
    pub staged_path: String,
    pub file_kind: LegacySourceKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StagingAction {
    Copy,
    SkipMissing,
    IgnoreUnsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSummary {
    pub totals: ValidationTotals,
    pub issues: Vec<ValidationIssue>,
    pub is_ready_for_transform: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationTotals {
    pub discovered_sources: u32,
    pub staged_files: u32,
    pub blocking_issues: u32,
    pub warning_issues: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub severity: ValidationSeverity,
    pub message: String,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSeverity {
    Blocking,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformPlan {
    pub target_schema_version: u32,
    pub steps: Vec<TransformStep>,
    pub dropped_surfaces: Vec<DroppedSurface>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformStep {
    pub id: String,
    pub source_entity: String,
    pub target_entity: String,
    pub mode: TransformMode,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransformMode {
    ImportAsIs,
    ImportWithTransform,
    MergeIntoWorkspace,
    DropWithAudit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedSurface {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitBoundary {
    pub transaction_scope: String,
    pub rollback_strategy: RollbackStrategy,
    pub checkpoint_writes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RollbackStrategy {
    StagingCleanupOnly,
    TransactionRollbackAndBackupRestore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterExecutionPlan {
    pub version: u32,
    pub config: ImporterConfig,
    pub discovery: SourceDiscoveryResult,
    pub staging: StagingPlan,
    pub validation: ValidationSummary,
    pub transform: TransformPlan,
    pub commit_boundary: CommitBoundary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterRunResult {
    pub run_id: String,
    pub state: ImporterState,
    pub summary: String,
    pub blocking_issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImporterState {
    Planned,
    DryRunFailed,
    ReadyForExecution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagingExecutionResult {
    pub run_id: String,
    pub state: StagingExecutionState,
    pub staged_file_count: u32,
    pub copied_bytes: u64,
    pub manifest_path: String,
    pub audit_artifact_path: String,
    pub audit_write_status: AuditWriteStatus,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StagingExecutionState {
    Success,
    Partial,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditWriteStatus {
    Written,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationExecutionResult {
    pub run_id: String,
    pub state: MigrationExecutionState,
    pub summary: String,
    pub source_database_path: Option<String>,
    pub backup_path: Option<String>,
    pub imported_counts: Vec<MigrationEntityCount>,
    pub dropped_counts: Vec<DroppedEntityCount>,
    pub warning_count: u32,
    pub warnings: Vec<String>,
    pub audit_rows_written: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrationExecutionState {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationEntityCount {
    pub entity: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedEntityCount {
    pub entity: String,
    pub count: u32,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagingManifest {
    pub version: u32,
    pub run_id: String,
    pub generated_at_epoch_ms: u64,
    pub staging_dir: String,
    pub files: Vec<StagingManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagingManifestEntry {
    pub source_id: String,
    pub source_kind: LegacySourceKind,
    pub source_path: String,
    pub staged_path: String,
    pub status: StagingFileStatus,
    pub bytes: u64,
    pub sha256: Option<String>,
    pub preexisting_target: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StagingFileStatus {
    Copied,
    Missing,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterStagingAuditArtifact {
    pub version: u32,
    pub run_id: String,
    pub created_at_epoch_ms: u64,
    pub staging_state: StagingExecutionState,
    pub validation_blocking_issues: u32,
    pub validation_warning_issues: u32,
    pub staged_file_count: u32,
    pub copied_bytes: u64,
    pub warnings: Vec<String>,
    pub files: Vec<StagingManifestEntry>,
}

#[derive(Debug)]
struct SelectedLegacySource {
    source_id: String,
    source_path: String,
    staged_path: String,
    priority: u8,
    source_kind: LegacySourceKind,
}

#[derive(Debug)]
struct RawLegacyDocument {
    id: String,
    title: String,
    template: String,
    theme_config: Option<String>,
    language: String,
    target_job_title: Option<String>,
    target_company: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug)]
struct RawLegacySection {
    id: String,
    resume_id: String,
    section_type: String,
    title: String,
    sort_order: i64,
    visible: i64,
    content: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug)]
struct RawLegacyChatSession {
    id: String,
    resume_id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug)]
struct RawLegacyChatMessage {
    id: String,
    session_id: String,
    role: String,
    content: String,
    metadata: Option<String>,
    created_at: i64,
}

#[derive(Debug)]
struct RawLegacyJdAnalysis {
    id: String,
    resume_id: String,
    job_description: String,
    target_job_title: Option<String>,
    target_company: Option<String>,
    result: Option<String>,
    overall_score: i64,
    ats_score: i64,
    created_at: i64,
}

#[derive(Debug)]
struct RawLegacyGrammarCheck {
    id: String,
    resume_id: String,
    result: Option<String>,
    score: i64,
    issue_count: i64,
    created_at: i64,
}

#[derive(Debug)]
struct PreparedDocument {
    id: String,
    title: String,
    template: String,
    language: String,
    theme_json: String,
    target_job_title: Option<String>,
    target_company: Option<String>,
    created_at_epoch_ms: i64,
    updated_at_epoch_ms: i64,
}

#[derive(Debug)]
struct PreparedSection {
    id: String,
    document_id: String,
    section_type: String,
    title: String,
    sort_order: i64,
    visible: i64,
    content_json: String,
    created_at_epoch_ms: i64,
    updated_at_epoch_ms: i64,
}

#[derive(Debug)]
struct PreparedChatSession {
    id: String,
    document_id: String,
    title: String,
    created_at_epoch_ms: i64,
    updated_at_epoch_ms: i64,
}

#[derive(Debug)]
struct PreparedChatMessage {
    id: String,
    session_id: String,
    role: String,
    content: String,
    metadata_json: String,
    created_at_epoch_ms: i64,
}

#[derive(Debug)]
struct PreparedAnalysisRecord {
    id: String,
    document_id: String,
    analysis_type: String,
    payload_json: String,
    score: Option<i64>,
    issue_count: Option<i64>,
    target_job_title: Option<String>,
    target_company: Option<String>,
    created_at_epoch_ms: i64,
}

#[derive(Debug)]
struct PreparedMigrationSlice {
    documents: Vec<PreparedDocument>,
    sections: Vec<PreparedSection>,
    chat_sessions: Vec<PreparedChatSession>,
    chat_messages: Vec<PreparedChatMessage>,
    analysis_records: Vec<PreparedAnalysisRecord>,
    window_state_json: Option<String>,
    window_state_staged_path: Option<String>,
    secure_settings_staged_path: Option<String>,
    dropped_counts: Vec<DroppedEntityCount>,
}

#[derive(Debug)]
struct FileRollbackSnapshot {
    target_path: PathBuf,
    backup_path: PathBuf,
    existed_before: bool,
}

#[derive(Debug, Default)]
struct MigrationCommitStats {
    audit_rows_written: u32,
    window_state_imported: bool,
    secure_settings_imported_count: u32,
    secure_settings_opaque_count: u32,
}

pub struct LegacyImporter;

impl LegacyImporter {
    pub fn build_plan(
        workspace_root: &str,
        workspace_database_path: &str,
        discovery_input: LegacyDiscoveryInput,
        strict_mode: bool,
    ) -> ImporterExecutionPlan {
        let run_id = Uuid::new_v4().to_string();
        let staging_dir = normalize_path(
            PathBuf::from(workspace_root)
                .join("imports")
                .join("staging")
                .join(&run_id),
        );

        let discovery = Self::discover_sources(discovery_input);
        let staging = Self::plan_staging(&staging_dir, &discovery);
        let validation = Self::validate(&discovery, &staging, strict_mode, workspace_database_path);
        let transform = Self::build_transform_plan();

        ImporterExecutionPlan {
            version: IMPORTER_PLAN_VERSION,
            config: ImporterConfig {
                run_id,
                workspace_root: workspace_root.to_string(),
                workspace_database_path: workspace_database_path.to_string(),
                staging_root: staging_dir,
                strict_mode,
            },
            discovery,
            staging,
            validation,
            transform,
            commit_boundary: CommitBoundary {
                transaction_scope: "workspace-db + migration-audit + secrets-adapter".into(),
                rollback_strategy: RollbackStrategy::TransactionRollbackAndBackupRestore,
                checkpoint_writes: vec![
                    "migration_audit.run_started".into(),
                    "migration_audit.validation_completed".into(),
                    "migration_audit.commit_completed".into(),
                ],
            },
        }
    }

    pub fn evaluate_plan(plan: &ImporterExecutionPlan) -> ImporterRunResult {
        let blocking_issues: Vec<ValidationIssue> = plan
            .validation
            .issues
            .iter()
            .filter(|issue| matches!(issue.severity, ValidationSeverity::Blocking))
            .cloned()
            .collect();

        let state = if plan.validation.is_ready_for_transform {
            ImporterState::ReadyForExecution
        } else {
            ImporterState::DryRunFailed
        };

        let summary = if blocking_issues.is_empty() {
            if plan.validation.totals.warning_issues > 0 {
                "Importer dry-run is ready for staged SQLite execution, but review the warning set before commit.".into()
            } else {
                "Importer dry-run is ready for staged SQLite execution.".into()
            }
        } else {
            "Importer dry-run found blocking issues. Resolve before commit execution.".into()
        };

        ImporterRunResult {
            run_id: plan.config.run_id.clone(),
            state,
            summary,
            blocking_issues,
        }
    }

    pub fn execute_staging_and_audit(
        plan: &ImporterExecutionPlan,
        write_db_audit: bool,
    ) -> Result<StagingExecutionResult, String> {
        let staging_dir = PathBuf::from(&plan.staging.staging_dir);
        fs::create_dir_all(&staging_dir).map_err(|error| {
            format!(
                "failed to create staging directory {}: {error}",
                staging_dir.display()
            )
        })?;

        let mut file_entries = plan.staging.staged_files.clone();
        file_entries.sort_by(|a, b| a.source_id.cmp(&b.source_id));

        let mut manifest_entries = Vec::with_capacity(file_entries.len());
        let mut warnings = Vec::new();
        let mut copied_bytes = 0_u64;

        for file in file_entries {
            let source_path = PathBuf::from(&file.source_path);
            let staged_path = PathBuf::from(&file.staged_path);
            ensure_parent_directory(&staged_path)?;
            let preexisting_target = staged_path.exists();

            if preexisting_target {
                warnings.push(format!(
                    "staging target already existed before copy: {}",
                    normalize_path(staged_path.clone())
                ));
            }

            let entry = if !source_path.exists() {
                warnings.push(format!(
                    "source missing during staging: {}",
                    normalize_path(source_path.clone())
                ));
                StagingManifestEntry {
                    source_id: file.source_id,
                    source_kind: file.file_kind,
                    source_path: normalize_path(source_path),
                    staged_path: normalize_path(staged_path),
                    status: StagingFileStatus::Missing,
                    bytes: 0,
                    sha256: None,
                    preexisting_target,
                    error: None,
                }
            } else {
                match fs::copy(&source_path, &staged_path) {
                    Ok(bytes) => match compute_sha256(&staged_path) {
                        Ok(sha256) => {
                            copied_bytes += bytes;
                            StagingManifestEntry {
                                source_id: file.source_id,
                                source_kind: file.file_kind,
                                source_path: normalize_path(source_path),
                                staged_path: normalize_path(staged_path),
                                status: StagingFileStatus::Copied,
                                bytes,
                                sha256: Some(sha256),
                                preexisting_target,
                                error: None,
                            }
                        }
                        Err(error) => {
                            warnings.push(format!(
                                "failed to hash staged file {}: {error}",
                                normalize_path(staged_path.clone())
                            ));
                            StagingManifestEntry {
                                source_id: file.source_id,
                                source_kind: file.file_kind,
                                source_path: normalize_path(source_path),
                                staged_path: normalize_path(staged_path),
                                status: StagingFileStatus::Error,
                                bytes,
                                sha256: None,
                                preexisting_target,
                                error: Some(error),
                            }
                        }
                    },
                    Err(error) => {
                        warnings.push(format!(
                            "failed to copy {} to {}: {error}",
                            normalize_path(source_path.clone()),
                            normalize_path(staged_path.clone())
                        ));
                        StagingManifestEntry {
                            source_id: file.source_id,
                            source_kind: file.file_kind,
                            source_path: normalize_path(source_path),
                            staged_path: normalize_path(staged_path),
                            status: StagingFileStatus::Error,
                            bytes: 0,
                            sha256: None,
                            preexisting_target,
                            error: Some(error.to_string()),
                        }
                    }
                }
            };

            manifest_entries.push(entry);
        }

        let staging_state = derive_staging_state(&manifest_entries);

        let manifest = StagingManifest {
            version: IMPORTER_STAGING_MANIFEST_VERSION,
            run_id: plan.config.run_id.clone(),
            generated_at_epoch_ms: now_epoch_ms()?,
            staging_dir: normalize_path(staging_dir.clone()),
            files: manifest_entries.clone(),
        };
        let manifest_path = staging_dir.join(STAGING_MANIFEST_FILE);
        write_json_file(&manifest_path, &manifest)?;

        let audit_artifact = ImporterStagingAuditArtifact {
            version: IMPORTER_STAGING_AUDIT_VERSION,
            run_id: plan.config.run_id.clone(),
            created_at_epoch_ms: now_epoch_ms()?,
            staging_state: staging_state.clone(),
            validation_blocking_issues: plan.validation.totals.blocking_issues,
            validation_warning_issues: plan.validation.totals.warning_issues,
            staged_file_count: manifest_entries.len() as u32,
            copied_bytes,
            warnings: warnings.clone(),
            files: manifest_entries.clone(),
        };
        let audit_artifact_path = staging_dir.join(STAGING_AUDIT_FILE);
        write_json_file(&audit_artifact_path, &audit_artifact)?;

        let audit_write_status = if write_db_audit {
            match Self::write_migration_audit_rows(plan, &manifest_entries) {
                Ok(()) => AuditWriteStatus::Written,
                Err(error) => {
                    warnings.push(format!("migration_audit write skipped/failed: {error}"));
                    AuditWriteStatus::Failed
                }
            }
        } else {
            AuditWriteStatus::Skipped
        };

        Ok(StagingExecutionResult {
            run_id: plan.config.run_id.clone(),
            state: staging_state,
            staged_file_count: manifest_entries.len() as u32,
            copied_bytes,
            manifest_path: normalize_path(manifest_path),
            audit_artifact_path: normalize_path(audit_artifact_path),
            audit_write_status,
            warnings,
        })
    }

    pub fn execute_document_migration(
        plan: &ImporterExecutionPlan,
    ) -> Result<(StagingExecutionResult, MigrationExecutionResult), String> {
        let staging_execution = Self::execute_staging_and_audit(plan, false)?;
        let migration_execution = Self::execute_document_migration_from_staging(plan);
        Ok((staging_execution, migration_execution))
    }

    fn discover_sources(input: LegacyDiscoveryInput) -> SourceDiscoveryResult {
        let app_data = PathBuf::from(&input.app_data_root);
        let parent = app_data.parent().map(|path| path.to_path_buf());
        let legacy_role_rover = parent.map(|path| path.join("RoleRover"));

        let mut sources = vec![
            DiscoveredSource {
                id: "sqlite-primary".into(),
                source_kind: LegacySourceKind::SqliteDatabase,
                path: normalize_path(app_data.join("data").join("jade.db")),
                exists: app_data.join("data").join("jade.db").exists(),
                priority: 2,
            },
            DiscoveredSource {
                id: "secure-settings-primary".into(),
                source_kind: LegacySourceKind::SecureSettings,
                path: normalize_path(app_data.join("secure-settings.json")),
                exists: app_data.join("secure-settings.json").exists(),
                priority: 1,
            },
            DiscoveredSource {
                id: "window-state-primary".into(),
                source_kind: LegacySourceKind::WindowState,
                path: normalize_path(app_data.join("window-state.json")),
                exists: app_data.join("window-state.json").exists(),
                priority: 4,
            },
        ];

        if let Some(legacy_root) = legacy_role_rover {
            sources.push(DiscoveredSource {
                id: "sqlite-legacy-rootscan".into(),
                source_kind: LegacySourceKind::SqliteDatabase,
                path: normalize_path(legacy_root.join("data").join("jade.db")),
                exists: legacy_root.join("data").join("jade.db").exists(),
                priority: 3,
            });
        }

        if input.allow_local_storage_fallback {
            sources.push(DiscoveredSource {
                id: "localstorage-fallback".into(),
                source_kind: LegacySourceKind::LocalStorageFallback,
                path: "browser-local-storage".into(),
                exists: true,
                priority: 5,
            });
        }

        let has_viable_input = sources.iter().any(|source| {
            source.exists
                && matches!(
                    source.source_kind,
                    LegacySourceKind::SqliteDatabase | LegacySourceKind::SecureSettings
                )
        });

        let warnings = if has_viable_input {
            Vec::new()
        } else {
            vec![
                "No viable SQLite or secure settings source discovered. Importer remains dry-run only."
                    .into(),
            ]
        };

        SourceDiscoveryResult {
            sources,
            has_viable_input,
            warnings,
        }
    }

    fn plan_staging(staging_dir: &str, discovery: &SourceDiscoveryResult) -> StagingPlan {
        let staged_files: Vec<StagedFile> = discovery
            .sources
            .iter()
            .filter(|source| source.exists && source.path != "browser-local-storage")
            .map(|source| StagedFile {
                source_id: source.id.clone(),
                source_path: source.path.clone(),
                staged_path: format!("{}/{}", staging_dir, source.id),
                file_kind: source.source_kind.clone(),
            })
            .collect();

        let actions = discovery
            .sources
            .iter()
            .map(|source| {
                if source.exists {
                    if source.path == "browser-local-storage" {
                        StagingAction::IgnoreUnsupported
                    } else {
                        StagingAction::Copy
                    }
                } else {
                    StagingAction::SkipMissing
                }
            })
            .collect();

        StagingPlan {
            staging_dir: staging_dir.to_string(),
            staged_files,
            actions,
        }
    }

    fn validate(
        discovery: &SourceDiscoveryResult,
        staging: &StagingPlan,
        strict_mode: bool,
        workspace_database_path: &str,
    ) -> ValidationSummary {
        let mut issues = Vec::new();
        let has_sqlite_candidate = discovery.sources.iter().any(|source| {
            source.exists && matches!(source.source_kind, LegacySourceKind::SqliteDatabase)
        });
        if !discovery.has_viable_input {
            issues.push(ValidationIssue {
                code: "missing_viable_source".into(),
                severity: ValidationSeverity::Blocking,
                message: "No viable legacy source found for migration.".into(),
                source_id: None,
            });
        }

        if !has_sqlite_candidate {
            issues.push(ValidationIssue {
                code: "missing_sqlite_source".into(),
                severity: ValidationSeverity::Blocking,
                message: "No legacy SQLite database was discovered. The current execution slice only commits staged SQLite content into the desktop workspace.".into(),
                source_id: None,
            });
        }

        if staging.staged_files.is_empty() {
            issues.push(ValidationIssue {
                code: "empty_staging_set".into(),
                severity: if strict_mode {
                    ValidationSeverity::Blocking
                } else {
                    ValidationSeverity::Warning
                },
                message: "No file-based source was staged for migration.".into(),
                source_id: None,
            });
        }

        match inspect_target_workspace_state(workspace_database_path) {
            Ok(state) => {
                if !state.non_empty_tables.is_empty() {
                    let table_summary = state
                        .non_empty_tables
                        .iter()
                        .map(|snapshot| format!("{}={}", snapshot.table, snapshot.row_count))
                        .collect::<Vec<_>>()
                        .join(", ");
                    issues.push(ValidationIssue {
                        code: "target_workspace_not_empty".into(),
                        severity: ValidationSeverity::Blocking,
                        message: format!(
                            "Target workspace already contains imported runtime data ({table_summary}). Start from a clean workspace database before running this migration slice."
                        ),
                        source_id: None,
                    });
                }

                if state.migration_audit_rows > 0 {
                    issues.push(ValidationIssue {
                        code: "existing_migration_audit_history".into(),
                        severity: ValidationSeverity::Warning,
                        message: format!(
                            "Target workspace already contains {} migration_audit row(s). Review prior runs before importing again.",
                            state.migration_audit_rows
                        ),
                        source_id: None,
                    });
                }
            }
            Err(error) => {
                issues.push(ValidationIssue {
                    code: "target_workspace_inspection_failed".into(),
                    severity: ValidationSeverity::Blocking,
                    message: format!(
                        "Unable to inspect the target workspace database before migration: {error}"
                    ),
                    source_id: None,
                });
            }
        }

        let blocking_issues = issues
            .iter()
            .filter(|issue| matches!(issue.severity, ValidationSeverity::Blocking))
            .count() as u32;
        let warning_issues = issues
            .iter()
            .filter(|issue| matches!(issue.severity, ValidationSeverity::Warning))
            .count() as u32;

        ValidationSummary {
            totals: ValidationTotals {
                discovered_sources: discovery.sources.len() as u32,
                staged_files: staging.staged_files.len() as u32,
                blocking_issues,
                warning_issues,
            },
            is_ready_for_transform: blocking_issues == 0,
            issues,
        }
    }

    fn build_transform_plan() -> TransformPlan {
        TransformPlan {
            target_schema_version: 1,
            steps: vec![
                TransformStep {
                    id: "users_to_workspace".into(),
                    source_entity: "users".into(),
                    target_entity: "workspace_metadata".into(),
                    mode: TransformMode::MergeIntoWorkspace,
                    notes:
                        "Choose a single owner snapshot and collapse identity into workspace scope."
                            .into(),
                },
                TransformStep {
                    id: "resumes_to_documents".into(),
                    source_entity: "resumes".into(),
                    target_entity: "documents".into(),
                    mode: TransformMode::ImportWithTransform,
                    notes: "Drop share fields and normalize optional targets.".into(),
                },
                TransformStep {
                    id: "sections_to_document_sections".into(),
                    source_entity: "resume_sections".into(),
                    target_entity: "document_sections".into(),
                    mode: TransformMode::ImportWithTransform,
                    notes: "Repair malformed section JSON content and emit audit warnings.".into(),
                },
                TransformStep {
                    id: "chat_to_ai_history".into(),
                    source_entity: "chat_sessions + chat_messages".into(),
                    target_entity: "ai_chat_sessions + ai_chat_messages".into(),
                    mode: TransformMode::ImportAsIs,
                    notes: "Preserve role/content/metadata and relink to migrated document ids."
                        .into(),
                },
                TransformStep {
                    id: "analysis_to_ai_analysis_records".into(),
                    source_entity: "jd_analyses + grammar_checks".into(),
                    target_entity: "ai_analysis_records".into(),
                    mode: TransformMode::ImportWithTransform,
                    notes: "Map analysis type and preserve score/result payloads.".into(),
                },
                TransformStep {
                    id: "secure_settings_to_workspace_secrets".into(),
                    source_entity: "secure-settings.json".into(),
                    target_entity: "workspace secrets manifest + vault fallback".into(),
                    mode: TransformMode::ImportWithTransform,
                    notes: "Recover plaintext legacy secrets when possible and preserve encrypted safeStorage blobs for follow-up migration.".into(),
                },
                TransformStep {
                    id: "window_state_to_workspace_settings".into(),
                    source_entity: "window-state.json".into(),
                    target_entity: "workspace_settings.window_state_json".into(),
                    mode: TransformMode::ImportWithTransform,
                    notes: "Normalize legacy bounds into a safe desktop window-state payload.".into(),
                },
            ],
            dropped_surfaces: vec![
                DroppedSurface {
                    name: "resume_shares".into(),
                    reason: "Public share surface is removed from desktop-first scope.".into(),
                },
                DroppedSurface {
                    name: "auth_accounts runtime usage".into(),
                    reason: "Desktop runtime does not keep OAuth session model.".into(),
                },
            ],
        }
    }

    fn execute_document_migration_from_staging(
        plan: &ImporterExecutionPlan,
    ) -> MigrationExecutionResult {
        let mut warnings = Vec::new();

        let selected_source = match Self::select_staged_sqlite_source(plan, &mut warnings) {
            Ok(source) => source,
            Err(error) => {
                return Self::failed_migration_result(plan, error, None, None, warnings, 0);
            }
        };

        let staged_secure_settings_source = match Self::select_optional_staged_source(
            plan,
            LegacySourceKind::SecureSettings,
            &mut warnings,
        ) {
            Ok(source) => source,
            Err(error) => {
                return Self::failed_migration_result(
                    plan,
                    error,
                    Some(selected_source.staged_path.clone()),
                    None,
                    warnings,
                    0,
                );
            }
        };

        let staged_window_state_source = match Self::select_optional_staged_source(
            plan,
            LegacySourceKind::WindowState,
            &mut warnings,
        ) {
            Ok(source) => source,
            Err(error) => {
                return Self::failed_migration_result(
                    plan,
                    error,
                    Some(selected_source.staged_path.clone()),
                    None,
                    warnings,
                    0,
                );
            }
        };

        let prepared = match Self::prepare_document_migration(
            &selected_source,
            staged_secure_settings_source.as_ref(),
            staged_window_state_source.as_ref(),
            &mut warnings,
        ) {
            Ok(prepared) => prepared,
            Err(error) => {
                return Self::failed_migration_result(
                    plan,
                    error,
                    Some(selected_source.staged_path.clone()),
                    None,
                    warnings,
                    0,
                );
            }
        };

        let database_path = PathBuf::from(&plan.config.workspace_database_path);
        let backup_path = PathBuf::from(&plan.staging.staging_dir).join(WORKSPACE_DB_BACKUP_FILE);
        let workspace_root = PathBuf::from(&plan.config.workspace_root);

        if let Err(error) = ensure_parent_directory(&backup_path) {
            return Self::failed_migration_result(
                plan,
                error,
                Some(selected_source.staged_path.clone()),
                None,
                warnings,
                0,
            );
        }

        if let Err(error) = fs::copy(&database_path, &backup_path) {
            return Self::failed_migration_result(
                plan,
                format!(
                    "failed to back up workspace database {} to {}: {error}",
                    database_path.display(),
                    backup_path.display()
                ),
                Some(selected_source.staged_path.clone()),
                None,
                warnings,
                0,
            );
        }

        let file_rollbacks = match Self::prepare_file_rollbacks(
            &workspace_root,
            &plan.staging.staging_dir,
            prepared.secure_settings_staged_path.is_some(),
        ) {
            Ok(rollbacks) => rollbacks,
            Err(error) => {
                return Self::failed_migration_result(
                    plan,
                    error,
                    Some(selected_source.staged_path.clone()),
                    Some(normalize_path(backup_path)),
                    warnings,
                    0,
                );
            }
        };

        let commit_result =
            Self::commit_document_migration(plan, &selected_source, &prepared, &mut warnings);

        match commit_result {
            Ok(stats) => {
                let mut backup_output = None;
                if let Err(error) = fs::remove_file(&backup_path) {
                    warnings.push(format!(
                        "migration succeeded but temporary workspace backup could not be removed: {error}"
                    ));
                    backup_output = Some(normalize_path(backup_path));
                }
                Self::cleanup_file_rollbacks(&file_rollbacks, &mut warnings);

                let mut imported_counts = vec![
                    MigrationEntityCount {
                        entity: "documents".into(),
                        count: prepared.documents.len() as u32,
                    },
                    MigrationEntityCount {
                        entity: "document_sections".into(),
                        count: prepared.sections.len() as u32,
                    },
                    MigrationEntityCount {
                        entity: "ai_chat_sessions".into(),
                        count: prepared.chat_sessions.len() as u32,
                    },
                    MigrationEntityCount {
                        entity: "ai_chat_messages".into(),
                        count: prepared.chat_messages.len() as u32,
                    },
                    MigrationEntityCount {
                        entity: "ai_analysis_records".into(),
                        count: prepared.analysis_records.len() as u32,
                    },
                ];

                if stats.window_state_imported {
                    imported_counts.push(MigrationEntityCount {
                        entity: "workspace_settings.window_state_json".into(),
                        count: 1,
                    });
                }

                let secure_settings_total =
                    stats.secure_settings_imported_count + stats.secure_settings_opaque_count;
                if secure_settings_total > 0 {
                    imported_counts.push(MigrationEntityCount {
                        entity: "workspace_secrets".into(),
                        count: secure_settings_total,
                    });
                }

                MigrationExecutionResult {
                    run_id: plan.config.run_id.clone(),
                    state: MigrationExecutionState::Success,
                    summary: format!(
                        "Imported {} documents, {} sections, {} chat sessions, {} chat messages, {} analysis records, {} window-state payload(s), and {} workspace secret payload(s) into the desktop workspace.",
                        prepared.documents.len(),
                        prepared.sections.len(),
                        prepared.chat_sessions.len(),
                        prepared.chat_messages.len(),
                        prepared.analysis_records.len(),
                        if stats.window_state_imported { 1 } else { 0 },
                        secure_settings_total
                    ),
                    source_database_path: Some(selected_source.staged_path),
                    backup_path: backup_output,
                    imported_counts,
                    dropped_counts: prepared.dropped_counts,
                    warning_count: warnings.len() as u32,
                    warnings,
                    audit_rows_written: stats.audit_rows_written,
                }
            }
            Err(error) => {
                let mut failure_summary = format!("Document migration failed: {error}");
                let mut backup_output = Some(normalize_path(backup_path.clone()));

                match fs::copy(&backup_path, &database_path) {
                    Ok(_) => {
                        warnings
                            .push("workspace database restored from the pre-import backup.".into());
                        failure_summary
                            .push_str(" Workspace database was restored from the backup copy.");
                    }
                    Err(restore_error) => {
                        warnings.push(format!(
                            "workspace database restore failed after migration error: {restore_error}"
                        ));
                        failure_summary.push_str(
                            " Workspace database restore from the backup copy also failed.",
                        );
                    }
                }
                Self::restore_file_rollbacks(&file_rollbacks, &mut warnings);

                let staging_root = PathBuf::from(&plan.staging.staging_dir);
                match fs::remove_dir_all(&staging_root) {
                    Ok(_) => {
                        warnings.push(
                            "staging directory was cleaned after the failed migration attempt."
                                .into(),
                        );
                        backup_output = None;
                        failure_summary.push_str(" Staging artifacts were cleaned.");
                    }
                    Err(cleanup_error) => {
                        warnings.push(format!(
                            "staging cleanup failed after migration error: {cleanup_error}"
                        ));
                        failure_summary.push_str(" Staging cleanup failed.");
                    }
                }

                Self::failed_migration_result(
                    plan,
                    failure_summary,
                    Some(selected_source.staged_path),
                    backup_output,
                    warnings,
                    0,
                )
            }
        }
    }

    fn select_staged_sqlite_source(
        plan: &ImporterExecutionPlan,
        warnings: &mut Vec<String>,
    ) -> Result<SelectedLegacySource, String> {
        Self::select_staged_source(plan, LegacySourceKind::SqliteDatabase, warnings)?
            .ok_or_else(|| "no staged SQLite database is available for document migration.".into())
    }

    fn select_optional_staged_source(
        plan: &ImporterExecutionPlan,
        source_kind: LegacySourceKind,
        warnings: &mut Vec<String>,
    ) -> Result<Option<SelectedLegacySource>, String> {
        Self::select_staged_source(plan, source_kind, warnings)
    }

    fn select_staged_source(
        plan: &ImporterExecutionPlan,
        source_kind: LegacySourceKind,
        warnings: &mut Vec<String>,
    ) -> Result<Option<SelectedLegacySource>, String> {
        let mut candidates: Vec<&DiscoveredSource> = plan
            .discovery
            .sources
            .iter()
            .filter(|source| source.exists && source.source_kind == source_kind)
            .collect();
        candidates.sort_by_key(|source| source.priority);

        let Some(selected) = candidates.first() else {
            return Ok(None);
        };

        if candidates.len() > 1 {
            warnings.push(format!(
                "multiple {:?} migration inputs were discovered; using {} (priority {}) and leaving {} additional candidate(s) untouched.",
                source_kind,
                selected.id,
                selected.priority,
                candidates.len() - 1
            ));
        }

        let staged_file = plan
            .staging
            .staged_files
            .iter()
            .find(|file| file.source_id == selected.id)
            .ok_or_else(|| {
                format!(
                    "staged SQLite source {} was planned but no staged file entry was found.",
                    selected.id
                )
            })?;

        let staged_path = PathBuf::from(&staged_file.staged_path);
        if !staged_path.exists() {
            return Err(format!(
                "staged {:?} source is missing at {}",
                source_kind,
                staged_path.display()
            ));
        }

        Ok(Some(SelectedLegacySource {
            source_id: selected.id.clone(),
            source_path: selected.path.clone(),
            staged_path: normalize_path(staged_path),
            priority: selected.priority,
            source_kind,
        }))
    }

    fn prepare_document_migration(
        selected_source: &SelectedLegacySource,
        secure_settings_source: Option<&SelectedLegacySource>,
        window_state_source: Option<&SelectedLegacySource>,
        warnings: &mut Vec<String>,
    ) -> Result<PreparedMigrationSlice, String> {
        let connection = Connection::open_with_flags(
            &selected_source.staged_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|error| {
            format!(
                "failed to open staged legacy SQLite database {}: {error}",
                selected_source.staged_path
            )
        })?;

        ensure_table_exists(&connection, "resumes")?;
        ensure_table_exists(&connection, "resume_sections")?;

        let resumes = Self::load_legacy_documents(&connection)?;
        let sections = Self::load_legacy_sections(&connection)?;
        let chat_sessions = Self::load_legacy_chat_sessions(&connection)?;
        let chat_messages = Self::load_legacy_chat_messages(&connection)?;
        let jd_analyses = Self::load_legacy_jd_analyses(&connection)?;
        let grammar_checks = Self::load_legacy_grammar_checks(&connection)?;
        let dropped_counts = Self::load_dropped_surface_counts(&connection)?;
        let window_state_json = if let Some(window_state_source) = window_state_source {
            Some(Self::prepare_window_state_import(
                window_state_source,
                warnings,
            )?)
        } else {
            None
        };
        let inline_share_count = Self::count_inline_resume_share_rows(&connection)?;
        if inline_share_count > 0 {
            warnings.push(format!(
                "dropped legacy web share fields from {} resume row(s) while building desktop documents.",
                inline_share_count
            ));
        }

        let prepared_documents: Vec<PreparedDocument> = resumes
            .into_iter()
            .map(|row| PreparedDocument {
                id: row.id,
                title: normalize_required_text(Some(row.title), "未命名简历"),
                template: normalize_required_text(Some(row.template), "classic"),
                language: normalize_required_text(Some(row.language), "zh"),
                theme_json: normalize_json_object(
                    row.theme_config,
                    "resume theme_config",
                    warnings,
                ),
                target_job_title: normalize_optional_text(row.target_job_title),
                target_company: normalize_optional_text(row.target_company),
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
                updated_at_epoch_ms: normalize_legacy_timestamp(row.updated_at),
            })
            .collect();

        let document_ids: HashSet<&str> = prepared_documents
            .iter()
            .map(|document| document.id.as_str())
            .collect();

        let mut prepared_sections = Vec::with_capacity(sections.len());
        for row in sections {
            if !document_ids.contains(row.resume_id.as_str()) {
                return Err(format!(
                    "legacy section {} references missing resume {}",
                    row.id, row.resume_id
                ));
            }

            let section_type = normalize_required_text(Some(row.section_type), "custom");
            prepared_sections.push(PreparedSection {
                id: row.id,
                document_id: row.resume_id,
                title: normalize_required_text(Some(row.title), &section_type),
                section_type,
                sort_order: row.sort_order,
                visible: if row.visible == 0 { 0 } else { 1 },
                content_json: normalize_json_object(
                    row.content,
                    "resume section content",
                    warnings,
                ),
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
                updated_at_epoch_ms: normalize_legacy_timestamp(row.updated_at),
            });
        }

        let mut prepared_chat_sessions = Vec::with_capacity(chat_sessions.len());
        for row in chat_sessions {
            if !document_ids.contains(row.resume_id.as_str()) {
                return Err(format!(
                    "legacy chat session {} references missing resume {}",
                    row.id, row.resume_id
                ));
            }

            prepared_chat_sessions.push(PreparedChatSession {
                id: row.id,
                document_id: row.resume_id,
                title: normalize_required_text(Some(row.title), "新对话"),
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
                updated_at_epoch_ms: normalize_legacy_timestamp(row.updated_at),
            });
        }

        let session_ids: HashSet<&str> = prepared_chat_sessions
            .iter()
            .map(|session| session.id.as_str())
            .collect();

        let mut prepared_chat_messages = Vec::with_capacity(chat_messages.len());
        for row in chat_messages {
            if !session_ids.contains(row.session_id.as_str()) {
                return Err(format!(
                    "legacy chat message {} references missing session {}",
                    row.id, row.session_id
                ));
            }

            prepared_chat_messages.push(PreparedChatMessage {
                id: row.id,
                session_id: row.session_id,
                role: normalize_required_text(Some(row.role), "user"),
                content: normalize_required_text(Some(row.content), ""),
                metadata_json: normalize_json_payload(
                    row.metadata,
                    "chat message metadata",
                    warnings,
                    serde_json::json!({}),
                ),
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
            });
        }

        let mut prepared_analysis_records =
            Vec::with_capacity(jd_analyses.len() + grammar_checks.len());
        for row in jd_analyses {
            if !document_ids.contains(row.resume_id.as_str()) {
                return Err(format!(
                    "legacy JD analysis {} references missing resume {}",
                    row.id, row.resume_id
                ));
            }

            let result = parse_json_value(
                row.result,
                "jd analysis result",
                warnings,
                serde_json::json!({}),
            );
            prepared_analysis_records.push(PreparedAnalysisRecord {
                id: row.id,
                document_id: row.resume_id,
                analysis_type: "jd".into(),
                payload_json: serde_json::to_string(&serde_json::json!({
                    "jobDescription": row.job_description,
                    "result": result,
                    "atsScore": row.ats_score,
                }))
                .map_err(|error| format!("failed to serialize JD analysis payload: {error}"))?,
                score: Some(row.overall_score),
                issue_count: None,
                target_job_title: normalize_optional_text(row.target_job_title),
                target_company: normalize_optional_text(row.target_company),
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
            });
        }

        for row in grammar_checks {
            if !document_ids.contains(row.resume_id.as_str()) {
                return Err(format!(
                    "legacy grammar check {} references missing resume {}",
                    row.id, row.resume_id
                ));
            }

            prepared_analysis_records.push(PreparedAnalysisRecord {
                id: row.id,
                document_id: row.resume_id,
                analysis_type: "grammar".into(),
                payload_json: normalize_json_payload(
                    row.result,
                    "grammar check result",
                    warnings,
                    serde_json::json!({}),
                ),
                score: Some(row.score),
                issue_count: Some(row.issue_count),
                target_job_title: None,
                target_company: None,
                created_at_epoch_ms: normalize_legacy_timestamp(row.created_at),
            });
        }

        Ok(PreparedMigrationSlice {
            documents: prepared_documents,
            sections: prepared_sections,
            chat_sessions: prepared_chat_sessions,
            chat_messages: prepared_chat_messages,
            analysis_records: prepared_analysis_records,
            window_state_json,
            window_state_staged_path: window_state_source.map(|source| source.staged_path.clone()),
            secure_settings_staged_path: secure_settings_source
                .map(|source| source.staged_path.clone()),
            dropped_counts,
        })
    }

    fn prepare_window_state_import(
        source: &SelectedLegacySource,
        warnings: &mut Vec<String>,
    ) -> Result<String, String> {
        let raw = fs::read_to_string(&source.staged_path).map_err(|error| {
            format!(
                "failed to read staged window-state payload {}: {error}",
                source.staged_path
            )
        })?;
        let parsed = serde_json::from_str::<serde_json::Value>(&raw).map_err(|error| {
            format!(
                "failed to parse staged window-state payload {}: {error}",
                source.staged_path
            )
        })?;
        let object = parsed.as_object().ok_or_else(|| {
            format!(
                "legacy window-state payload at {} must be a JSON object",
                source.staged_path
            )
        })?;

        let width = normalize_window_dimension(
            object.get("width").and_then(serde_json::Value::as_i64),
            1440,
            1200,
            4096,
            "width",
            warnings,
        );
        let height = normalize_window_dimension(
            object.get("height").and_then(serde_json::Value::as_i64),
            960,
            760,
            2160,
            "height",
            warnings,
        );
        let x = normalize_window_coordinate(
            object.get("x").and_then(serde_json::Value::as_i64),
            "x",
            warnings,
        );
        let y = normalize_window_coordinate(
            object.get("y").and_then(serde_json::Value::as_i64),
            "y",
            warnings,
        );

        serde_json::to_string(&serde_json::json!({
            "width": width,
            "height": height,
            "x": x,
            "y": y,
        }))
        .map_err(|error| format!("failed to serialize normalized window-state payload: {error}"))
    }

    fn load_legacy_documents(connection: &Connection) -> Result<Vec<RawLegacyDocument>, String> {
        let columns = load_table_columns(connection, "resumes")?;
        ensure_required_columns(
            &columns,
            "resumes",
            &[
                "id",
                "title",
                "template",
                "theme_config",
                "language",
                "created_at",
                "updated_at",
            ],
        )?;

        let target_job_title_expr = optional_column_sql(&columns, "target_job_title");
        let target_company_expr = optional_column_sql(&columns, "target_company");
        let query = format!(
            r#"
            SELECT
              id,
              title,
              template,
              theme_config,
              language,
              {target_job_title_expr} AS target_job_title,
              {target_company_expr} AS target_company,
              created_at,
              updated_at
            FROM resumes
            ORDER BY updated_at DESC, created_at DESC, id ASC
            "#
        );

        let mut statement = connection
            .prepare(&query)
            .map_err(|error| format!("failed to prepare resume import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacyDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    template: row.get(2)?,
                    theme_config: row.get(3)?,
                    language: row.get(4)?,
                    target_job_title: row.get(5)?,
                    target_company: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|error| format!("failed to read legacy resumes: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy resumes: {error}"))
    }

    fn load_legacy_sections(connection: &Connection) -> Result<Vec<RawLegacySection>, String> {
        let columns = load_table_columns(connection, "resume_sections")?;
        ensure_required_columns(
            &columns,
            "resume_sections",
            &[
                "id",
                "resume_id",
                "type",
                "title",
                "sort_order",
                "visible",
                "content",
                "created_at",
                "updated_at",
            ],
        )?;

        let mut statement = connection
            .prepare(
                r#"
                SELECT
                  id,
                  resume_id,
                  type,
                  title,
                  sort_order,
                  visible,
                  content,
                  created_at,
                  updated_at
                FROM resume_sections
                ORDER BY sort_order ASC, created_at ASC, id ASC
                "#,
            )
            .map_err(|error| format!("failed to prepare section import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacySection {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    section_type: row.get(2)?,
                    title: row.get(3)?,
                    sort_order: row.get(4)?,
                    visible: row.get(5)?,
                    content: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|error| format!("failed to read legacy resume sections: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy resume sections: {error}"))
    }

    fn load_legacy_chat_sessions(
        connection: &Connection,
    ) -> Result<Vec<RawLegacyChatSession>, String> {
        if !table_exists(connection, "chat_sessions")? {
            return Ok(Vec::new());
        }

        let columns = load_table_columns(connection, "chat_sessions")?;
        ensure_required_columns(
            &columns,
            "chat_sessions",
            &["id", "resume_id", "title", "created_at", "updated_at"],
        )?;

        let mut statement = connection
            .prepare(
                r#"
                SELECT id, resume_id, title, created_at, updated_at
                FROM chat_sessions
                ORDER BY updated_at DESC, created_at DESC, id ASC
                "#,
            )
            .map_err(|error| format!("failed to prepare chat session import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacyChatSession {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    title: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|error| format!("failed to read legacy chat sessions: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy chat sessions: {error}"))
    }

    fn load_legacy_chat_messages(
        connection: &Connection,
    ) -> Result<Vec<RawLegacyChatMessage>, String> {
        if !table_exists(connection, "chat_messages")? {
            return Ok(Vec::new());
        }

        let columns = load_table_columns(connection, "chat_messages")?;
        ensure_required_columns(
            &columns,
            "chat_messages",
            &[
                "id",
                "session_id",
                "role",
                "content",
                "metadata",
                "created_at",
            ],
        )?;

        let mut statement = connection
            .prepare(
                r#"
                SELECT id, session_id, role, content, metadata, created_at
                FROM chat_messages
                ORDER BY created_at ASC, id ASC
                "#,
            )
            .map_err(|error| format!("failed to prepare chat message import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacyChatMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    metadata: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|error| format!("failed to read legacy chat messages: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy chat messages: {error}"))
    }

    fn load_legacy_jd_analyses(
        connection: &Connection,
    ) -> Result<Vec<RawLegacyJdAnalysis>, String> {
        if !table_exists(connection, "jd_analyses")? {
            return Ok(Vec::new());
        }

        let columns = load_table_columns(connection, "jd_analyses")?;
        ensure_required_columns(
            &columns,
            "jd_analyses",
            &[
                "id",
                "resume_id",
                "job_description",
                "result",
                "overall_score",
                "ats_score",
                "created_at",
            ],
        )?;

        let target_job_title_expr = optional_column_sql(&columns, "target_job_title");
        let target_company_expr = optional_column_sql(&columns, "target_company");
        let query = format!(
            r#"
            SELECT
              id,
              resume_id,
              job_description,
              {target_job_title_expr} AS target_job_title,
              {target_company_expr} AS target_company,
              result,
              overall_score,
              ats_score,
              created_at
            FROM jd_analyses
            ORDER BY created_at DESC, id ASC
            "#
        );

        let mut statement = connection
            .prepare(&query)
            .map_err(|error| format!("failed to prepare JD analysis import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacyJdAnalysis {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    job_description: row.get(2)?,
                    target_job_title: row.get(3)?,
                    target_company: row.get(4)?,
                    result: row.get(5)?,
                    overall_score: row.get(6)?,
                    ats_score: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|error| format!("failed to read legacy JD analyses: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy JD analyses: {error}"))
    }

    fn load_legacy_grammar_checks(
        connection: &Connection,
    ) -> Result<Vec<RawLegacyGrammarCheck>, String> {
        if !table_exists(connection, "grammar_checks")? {
            return Ok(Vec::new());
        }

        let columns = load_table_columns(connection, "grammar_checks")?;
        ensure_required_columns(
            &columns,
            "grammar_checks",
            &[
                "id",
                "resume_id",
                "result",
                "score",
                "issue_count",
                "created_at",
            ],
        )?;

        let mut statement = connection
            .prepare(
                r#"
                SELECT id, resume_id, result, score, issue_count, created_at
                FROM grammar_checks
                ORDER BY created_at DESC, id ASC
                "#,
            )
            .map_err(|error| format!("failed to prepare grammar check import query: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok(RawLegacyGrammarCheck {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    result: row.get(2)?,
                    score: row.get(3)?,
                    issue_count: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|error| format!("failed to read legacy grammar checks: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to collect legacy grammar checks: {error}"))
    }

    fn load_dropped_surface_counts(
        connection: &Connection,
    ) -> Result<Vec<DroppedEntityCount>, String> {
        Ok(vec![
            DroppedEntityCount {
                entity: "resume_shares".into(),
                count: count_table_rows_if_exists(connection, "resume_shares")?,
                reason: "Public share records are removed from the desktop-first runtime.".into(),
            },
            DroppedEntityCount {
                entity: "auth_accounts".into(),
                count: count_table_rows_if_exists(connection, "auth_accounts")?,
                reason: "OAuth runtime records are not preserved in the desktop workspace.".into(),
            },
        ])
    }

    fn count_inline_resume_share_rows(connection: &Connection) -> Result<u32, String> {
        let columns = load_table_columns(connection, "resumes")?;
        if !columns.contains("share_token") && !columns.contains("is_public") {
            return Ok(0);
        }

        let share_token_expr = if columns.contains("share_token") {
            "share_token"
        } else {
            "NULL"
        };
        let is_public_expr = if columns.contains("is_public") {
            "is_public"
        } else {
            "0"
        };

        let query = format!(
            r#"
            SELECT COUNT(*)
            FROM resumes
            WHERE
              ({share_token_expr} IS NOT NULL AND TRIM({share_token_expr}) <> '')
              OR {is_public_expr} = 1
            "#
        );

        connection
            .query_row(&query, [], |row| row.get::<_, i64>(0))
            .map(|count| count.max(0) as u32)
            .map_err(|error| format!("failed to count dropped inline resume share fields: {error}"))
    }

    fn commit_document_migration(
        plan: &ImporterExecutionPlan,
        selected_source: &SelectedLegacySource,
        prepared: &PreparedMigrationSlice,
        warnings: &mut Vec<String>,
    ) -> Result<MigrationCommitStats, String> {
        let mut connection =
            Connection::open(&plan.config.workspace_database_path).map_err(|error| {
                format!("failed to open workspace db for migration commit: {error}")
            })?;
        connection
            .execute_batch(
                r#"
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
                PRAGMA synchronous = NORMAL;
                "#,
            )
            .map_err(|error| {
                format!("failed to configure workspace db for migration commit: {error}")
            })?;

        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to start migration transaction: {error}"))?;
        let mut stats = MigrationCommitStats::default();

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "sqlite_database",
            &selected_source.staged_path,
            "run_started",
            0,
            0,
            0,
            serde_json::json!({
                "selectedSourceId": selected_source.source_id,
                "selectedSourcePath": selected_source.source_path,
                "stagedSourcePath": selected_source.staged_path,
                "priority": selected_source.priority,
            }),
        )?;

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "migration",
            &selected_source.staged_path,
            "validation_completed",
            0,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "documentsReady": prepared.documents.len(),
                "sectionsReady": prepared.sections.len(),
                "warnings": warnings,
            }),
        )?;

        for document in &prepared.documents {
            transaction
                .execute(
                    r#"
                    INSERT INTO documents (
                      id,
                      title,
                      template,
                      language,
                      theme_json,
                      is_default,
                      target_job_title,
                      target_company,
                      created_at_epoch_ms,
                      updated_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                    "#,
                    params![
                        document.id,
                        document.title,
                        document.template,
                        document.language,
                        document.theme_json,
                        document.target_job_title,
                        document.target_company,
                        document.created_at_epoch_ms,
                        document.updated_at_epoch_ms
                    ],
                )
                .map_err(|error| {
                    format!(
                        "failed to insert imported document {}: {error}",
                        document.id
                    )
                })?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "documents",
            &selected_source.staged_path,
            "imported",
            prepared.documents.len() as i64,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "entity": "documents",
                "importedCount": prepared.documents.len(),
            }),
        )?;

        for section in &prepared.sections {
            transaction
                .execute(
                    r#"
                    INSERT INTO document_sections (
                      id,
                      document_id,
                      section_type,
                      title,
                      sort_order,
                      visible,
                      content_json,
                      created_at_epoch_ms,
                      updated_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                    params![
                        section.id,
                        section.document_id,
                        section.section_type,
                        section.title,
                        section.sort_order,
                        section.visible,
                        section.content_json,
                        section.created_at_epoch_ms,
                        section.updated_at_epoch_ms
                    ],
                )
                .map_err(|error| {
                    format!(
                        "failed to insert imported document section {}: {error}",
                        section.id
                    )
                })?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "document_sections",
            &selected_source.staged_path,
            "imported",
            prepared.sections.len() as i64,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "entity": "document_sections",
                "importedCount": prepared.sections.len(),
            }),
        )?;

        for session in &prepared.chat_sessions {
            transaction
                .execute(
                    r#"
                    INSERT INTO ai_chat_sessions (
                      id,
                      document_id,
                      title,
                      created_at_epoch_ms,
                      updated_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?)
                    "#,
                    params![
                        session.id,
                        session.document_id,
                        session.title,
                        session.created_at_epoch_ms,
                        session.updated_at_epoch_ms
                    ],
                )
                .map_err(|error| {
                    format!(
                        "failed to insert imported chat session {}: {error}",
                        session.id
                    )
                })?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "ai_chat_sessions",
            &selected_source.staged_path,
            "imported",
            prepared.chat_sessions.len() as i64,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "entity": "ai_chat_sessions",
                "importedCount": prepared.chat_sessions.len(),
            }),
        )?;

        for message in &prepared.chat_messages {
            transaction
                .execute(
                    r#"
                    INSERT INTO ai_chat_messages (
                      id,
                      session_id,
                      role,
                      content,
                      metadata_json,
                      created_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    "#,
                    params![
                        message.id,
                        message.session_id,
                        message.role,
                        message.content,
                        message.metadata_json,
                        message.created_at_epoch_ms
                    ],
                )
                .map_err(|error| {
                    format!(
                        "failed to insert imported chat message {}: {error}",
                        message.id
                    )
                })?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "ai_chat_messages",
            &selected_source.staged_path,
            "imported",
            prepared.chat_messages.len() as i64,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "entity": "ai_chat_messages",
                "importedCount": prepared.chat_messages.len(),
            }),
        )?;

        for record in &prepared.analysis_records {
            transaction
                .execute(
                    r#"
                    INSERT INTO ai_analysis_records (
                      id,
                      document_id,
                      analysis_type,
                      payload_json,
                      score,
                      issue_count,
                      target_job_title,
                      target_company,
                      created_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                    params![
                        record.id,
                        record.document_id,
                        record.analysis_type,
                        record.payload_json,
                        record.score,
                        record.issue_count,
                        record.target_job_title,
                        record.target_company,
                        record.created_at_epoch_ms
                    ],
                )
                .map_err(|error| {
                    format!(
                        "failed to insert imported analysis record {}: {error}",
                        record.id
                    )
                })?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "ai_analysis_records",
            &selected_source.staged_path,
            "imported",
            prepared.analysis_records.len() as i64,
            0,
            warnings.len() as i64,
            serde_json::json!({
                "entity": "ai_analysis_records",
                "importedCount": prepared.analysis_records.len(),
            }),
        )?;

        if let Some(window_state_json) = &prepared.window_state_json {
            transaction
                .execute(
                    r#"
                    UPDATE workspace_settings
                    SET window_state_json = ?, updated_at_epoch_ms = ?
                    WHERE id = 1
                    "#,
                    params![window_state_json, now_epoch_ms()? as i64],
                )
                .map_err(|error| format!("failed to persist imported window state: {error}"))?;
            stats.window_state_imported = true;

            stats.audit_rows_written += insert_semantic_audit_row(
                &transaction,
                &plan.config.run_id,
                "window_state",
                prepared
                    .window_state_staged_path
                    .as_deref()
                    .unwrap_or(&selected_source.staged_path),
                "imported",
                1,
                0,
                warnings.len() as i64,
                serde_json::json!({
                    "entity": "workspace_settings.window_state_json",
                    "windowStateJson": window_state_json,
                }),
            )?;
        }

        if let Some(secure_settings_staged_path) = &prepared.secure_settings_staged_path {
            let import_result = settings::import_legacy_secure_settings(
                Path::new(&plan.config.workspace_root),
                Path::new(secure_settings_staged_path),
            )?;
            warnings.extend(import_result.warnings.iter().cloned());
            stats.secure_settings_imported_count = import_result.imported_secret_count;
            stats.secure_settings_opaque_count = import_result.opaque_secret_count;
            stats.audit_rows_written += insert_semantic_audit_row(
                &transaction,
                &plan.config.run_id,
                "workspace_secrets",
                secure_settings_staged_path,
                "imported",
                (import_result.imported_secret_count + import_result.opaque_secret_count) as i64,
                0,
                import_result.warnings.len() as i64,
                serde_json::json!({
                    "entity": "workspace_secrets",
                    "importedSecretCount": import_result.imported_secret_count,
                    "opaqueSecretCount": import_result.opaque_secret_count,
                    "importedKeys": import_result.imported_keys,
                    "opaqueKeys": import_result.opaque_keys,
                    "warnings": import_result.warnings,
                }),
            )?;
        }

        for dropped in &prepared.dropped_counts {
            stats.audit_rows_written += insert_semantic_audit_row(
                &transaction,
                &plan.config.run_id,
                &dropped.entity,
                &selected_source.staged_path,
                "dropped_runtime_surface",
                0,
                dropped.count as i64,
                0,
                serde_json::json!({
                    "entity": dropped.entity,
                    "reason": dropped.reason,
                }),
            )?;
        }

        stats.audit_rows_written += insert_semantic_audit_row(
            &transaction,
            &plan.config.run_id,
            "migration",
            &selected_source.staged_path,
            "commit_completed",
            (prepared.documents.len()
                + prepared.sections.len()
                + prepared.chat_sessions.len()
                + prepared.chat_messages.len()
                + prepared.analysis_records.len()) as i64,
            prepared
                .dropped_counts
                .iter()
                .map(|item| item.count as i64)
                .sum(),
            warnings.len() as i64,
            serde_json::json!({
                "importedCounts": [
                    { "entity": "documents", "count": prepared.documents.len() },
                    { "entity": "document_sections", "count": prepared.sections.len() },
                    { "entity": "ai_chat_sessions", "count": prepared.chat_sessions.len() },
                    { "entity": "ai_chat_messages", "count": prepared.chat_messages.len() },
                    { "entity": "ai_analysis_records", "count": prepared.analysis_records.len() },
                ],
                "droppedCounts": prepared.dropped_counts,
                "warnings": warnings,
            }),
        )?;

        transaction
            .commit()
            .map_err(|error| format!("failed to commit migration transaction: {error}"))?;

        Ok(stats)
    }

    fn failed_migration_result(
        plan: &ImporterExecutionPlan,
        summary: String,
        source_database_path: Option<String>,
        backup_path: Option<String>,
        warnings: Vec<String>,
        audit_rows_written: u32,
    ) -> MigrationExecutionResult {
        MigrationExecutionResult {
            run_id: plan.config.run_id.clone(),
            state: MigrationExecutionState::Failed,
            summary,
            source_database_path,
            backup_path,
            imported_counts: Vec::new(),
            dropped_counts: Vec::new(),
            warning_count: warnings.len() as u32,
            warnings,
            audit_rows_written,
        }
    }

    fn write_migration_audit_rows(
        plan: &ImporterExecutionPlan,
        manifest_entries: &[StagingManifestEntry],
    ) -> Result<(), String> {
        let db_path = PathBuf::from(&plan.config.workspace_database_path);
        if !db_path.exists() {
            return Err(format!(
                "workspace database not found at {}",
                normalize_path(db_path)
            ));
        }

        let mut connection = Connection::open(&db_path)
            .map_err(|error| format!("failed to open workspace db for audit writes: {error}"))?;

        let transaction = connection
            .transaction()
            .map_err(|error| format!("failed to start migration_audit transaction: {error}"))?;

        for entry in manifest_entries {
            let (status, imported_count, warning_count) = match entry.status {
                StagingFileStatus::Copied => (
                    "staged_copied",
                    1_i64,
                    if entry.preexisting_target {
                        1_i64
                    } else {
                        0_i64
                    },
                ),
                StagingFileStatus::Missing => (
                    "staged_missing",
                    0_i64,
                    if entry.preexisting_target {
                        2_i64
                    } else {
                        1_i64
                    },
                ),
                StagingFileStatus::Error => (
                    "staged_error",
                    0_i64,
                    if entry.preexisting_target {
                        2_i64
                    } else {
                        1_i64
                    },
                ),
            };

            let details = serde_json::json!({
                "sourceId": entry.source_id,
                "sourceKind": entry.source_kind,
                "sourcePath": entry.source_path,
                "stagedPath": entry.staged_path,
                "bytes": entry.bytes,
                "sha256": entry.sha256,
                "preexistingTarget": entry.preexisting_target,
                "error": entry.error,
            });

            transaction
                .execute(
                    r#"
                    INSERT INTO migration_audit (
                      id, run_id, source_kind, source_path, status,
                      imported_count, dropped_count, warning_count, details_json, created_at_epoch_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                    "#,
                    params![
                        Uuid::new_v4().to_string(),
                        plan.config.run_id.as_str(),
                        format!("{:?}", &entry.source_kind).to_lowercase(),
                        entry.source_path.as_str(),
                        status,
                        imported_count,
                        warning_count,
                        serde_json::to_string(&details).map_err(|error| format!(
                            "failed to serialize migration_audit details: {error}"
                        ))?,
                        now_epoch_ms()? as i64
                    ],
                )
                .map_err(|error| format!("failed to insert migration_audit row: {error}"))?;
        }

        transaction
            .commit()
            .map_err(|error| format!("failed to commit migration_audit transaction: {error}"))
    }

    fn prepare_file_rollbacks(
        workspace_root: &Path,
        staging_dir: &str,
        needs_secret_rollbacks: bool,
    ) -> Result<Vec<FileRollbackSnapshot>, String> {
        if !needs_secret_rollbacks {
            return Ok(Vec::new());
        }

        let backup_root = PathBuf::from(staging_dir).join("rollback");
        let targets = vec![
            (
                settings::secrets_manifest_path(workspace_root),
                backup_root.join("secrets-manifest.backup.json"),
            ),
            (
                settings::vault_fallback_path(workspace_root),
                backup_root.join("vault-fallback.backup.json"),
            ),
        ];

        let mut rollbacks = Vec::new();
        for (target_path, backup_path) in targets {
            if let Some(parent) = backup_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "failed to create rollback directory {}: {error}",
                        parent.display()
                    )
                })?;
            }

            let existed_before = target_path.exists();
            if existed_before {
                fs::copy(&target_path, &backup_path).map_err(|error| {
                    format!(
                        "failed to snapshot {} into {} before migration: {error}",
                        target_path.display(),
                        backup_path.display()
                    )
                })?;
            }

            rollbacks.push(FileRollbackSnapshot {
                target_path,
                backup_path,
                existed_before,
            });
        }

        Ok(rollbacks)
    }

    fn restore_file_rollbacks(rollbacks: &[FileRollbackSnapshot], warnings: &mut Vec<String>) {
        for rollback in rollbacks {
            if rollback.existed_before {
                match fs::copy(&rollback.backup_path, &rollback.target_path) {
                    Ok(_) => warnings.push(format!(
                        "restored {} from rollback snapshot after migration failure.",
                        rollback.target_path.display()
                    )),
                    Err(error) => warnings.push(format!(
                        "failed to restore {} from rollback snapshot {}: {error}",
                        rollback.target_path.display(),
                        rollback.backup_path.display()
                    )),
                }
            } else if rollback.target_path.exists() {
                match fs::remove_file(&rollback.target_path) {
                    Ok(_) => warnings.push(format!(
                        "removed newly created {} after migration failure.",
                        rollback.target_path.display()
                    )),
                    Err(error) => warnings.push(format!(
                        "failed to remove newly created {} after migration failure: {error}",
                        rollback.target_path.display()
                    )),
                }
            }
        }
    }

    fn cleanup_file_rollbacks(rollbacks: &[FileRollbackSnapshot], warnings: &mut Vec<String>) {
        for rollback in rollbacks {
            if rollback.backup_path.exists() {
                match fs::remove_file(&rollback.backup_path) {
                    Ok(_) => {}
                    Err(error) => warnings.push(format!(
                        "migration succeeded but rollback snapshot {} could not be removed: {error}",
                        rollback.backup_path.display()
                    )),
                }
            }
        }
    }
}

fn insert_semantic_audit_row(
    transaction: &rusqlite::Transaction<'_>,
    run_id: &str,
    source_kind: &str,
    source_path: &str,
    status: &str,
    imported_count: i64,
    dropped_count: i64,
    warning_count: i64,
    details: serde_json::Value,
) -> Result<u32, String> {
    transaction
        .execute(
            r#"
            INSERT INTO migration_audit (
              id, run_id, source_kind, source_path, status,
              imported_count, dropped_count, warning_count, details_json, created_at_epoch_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            params![
                Uuid::new_v4().to_string(),
                run_id,
                source_kind,
                source_path,
                status,
                imported_count,
                dropped_count,
                warning_count,
                serde_json::to_string(&details).map_err(|error| format!(
                    "failed to serialize semantic migration audit details: {error}"
                ))?,
                now_epoch_ms()? as i64
            ],
        )
        .map_err(|error| format!("failed to insert semantic migration audit row: {error}"))?;

    Ok(1)
}

fn normalize_path(path: PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_window_dimension(
    value: Option<i64>,
    fallback: i64,
    min: i64,
    max: i64,
    label: &str,
    warnings: &mut Vec<String>,
) -> i64 {
    let raw = value.unwrap_or_else(|| {
        warnings.push(format!(
            "legacy window-state {label} was missing; using fallback value {fallback}."
        ));
        fallback
    });
    let clamped = raw.clamp(min, max);
    if clamped != raw {
        warnings.push(format!(
            "legacy window-state {label}={raw} was outside the supported range and was clamped to {clamped}."
        ));
    }
    clamped
}

fn normalize_window_coordinate(
    value: Option<i64>,
    label: &str,
    warnings: &mut Vec<String>,
) -> Option<i64> {
    value.map(|raw| {
        let clamped = raw.clamp(-16_384, 16_384);
        if clamped != raw {
            warnings.push(format!(
                "legacy window-state {label}={raw} was outside the supported range and was clamped to {clamped}."
            ));
        }
        clamped
    })
}

fn normalize_required_text(value: Option<String>, fallback: &str) -> String {
    normalize_optional_text(value).unwrap_or_else(|| fallback.to_string())
}

fn normalize_json_object(
    value: Option<String>,
    context: &str,
    warnings: &mut Vec<String>,
) -> String {
    match parse_json_value(value, context, warnings, serde_json::json!({})) {
        serde_json::Value::Object(map) => {
            serde_json::to_string(&serde_json::Value::Object(map)).unwrap_or_else(|_| "{}".into())
        }
        _ => {
            warnings.push(format!(
                "{context} was not a JSON object and was replaced with an empty object."
            ));
            "{}".into()
        }
    }
}

fn normalize_json_payload(
    value: Option<String>,
    context: &str,
    warnings: &mut Vec<String>,
    fallback: serde_json::Value,
) -> String {
    serde_json::to_string(&parse_json_value(value, context, warnings, fallback))
        .unwrap_or_else(|_| "{}".into())
}

fn parse_json_value(
    value: Option<String>,
    context: &str,
    warnings: &mut Vec<String>,
    fallback: serde_json::Value,
) -> serde_json::Value {
    let Some(raw) = value else {
        return fallback;
    };

    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(parsed) => parsed,
        Err(error) => {
            warnings.push(format!(
                "{context} could not be parsed as JSON and was replaced with a safe fallback: {error}"
            ));
            fallback
        }
    }
}

fn normalize_legacy_timestamp(value: i64) -> i64 {
    if value.abs() >= 100_000_000_000 {
        value
    } else {
        value.saturating_mul(1000)
    }
}

fn ensure_table_exists(connection: &Connection, table: &str) -> Result<(), String> {
    if !table_exists(connection, table)? {
        return Err(format!("required legacy table is missing: {table}"));
    }

    Ok(())
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .map_err(|error| format!("failed to inspect legacy table {table}: {error}"))
}

fn load_table_columns(connection: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("failed to inspect columns for {table}: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("failed to query columns for {table}: {error}"))?;

    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|error| format!("failed to collect columns for {table}: {error}"))
}

fn ensure_required_columns(
    columns: &HashSet<String>,
    table: &str,
    required: &[&str],
) -> Result<(), String> {
    let missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|column| !columns.contains(*column))
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "legacy table {table} is missing required column(s): {}",
            missing.join(", ")
        ))
    }
}

fn optional_column_sql(columns: &HashSet<String>, column: &str) -> &'static str {
    if columns.contains(column) {
        match column {
            "target_job_title" => "target_job_title",
            "target_company" => "target_company",
            _ => "NULL",
        }
    } else {
        "NULL"
    }
}

fn count_table_rows_if_exists(connection: &Connection, table: &str) -> Result<u32, String> {
    if !table_exists(connection, table)? {
        return Ok(0);
    }

    let query = format!("SELECT COUNT(*) FROM {table}");
    connection
        .query_row(&query, [], |row| row.get::<_, i64>(0))
        .map(|count| count.max(0) as u32)
        .map_err(|error| format!("failed to count rows in optional table {table}: {error}"))
}

struct TargetTableCount {
    table: String,
    row_count: u32,
}

struct TargetWorkspaceState {
    non_empty_tables: Vec<TargetTableCount>,
    migration_audit_rows: u32,
}

fn inspect_target_workspace_state(
    workspace_database_path: &str,
) -> Result<TargetWorkspaceState, String> {
    let db_path = PathBuf::from(workspace_database_path);
    if !db_path.exists() {
        return Ok(TargetWorkspaceState {
            non_empty_tables: Vec::new(),
            migration_audit_rows: 0,
        });
    }

    let connection = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| {
            format!(
                "failed to open target workspace database {} for inspection: {error}",
                db_path.display()
            )
        })?;

    let runtime_tables = [
        "documents",
        "document_sections",
        "ai_chat_sessions",
        "ai_chat_messages",
        "ai_analysis_records",
    ];

    let mut non_empty_tables = Vec::new();
    for table in runtime_tables {
        let row_count = count_table_rows_if_exists(&connection, table)?;
        if row_count > 0 {
            non_empty_tables.push(TargetTableCount {
                table: table.into(),
                row_count,
            });
        }
    }

    let migration_audit_rows = count_table_rows_if_exists(&connection, "migration_audit")?;

    Ok(TargetWorkspaceState {
        non_empty_tables,
        migration_audit_rows,
    })
}

fn derive_staging_state(entries: &[StagingManifestEntry]) -> StagingExecutionState {
    if entries.is_empty() {
        return StagingExecutionState::Failed;
    }

    let copied = entries
        .iter()
        .filter(|entry| matches!(entry.status, StagingFileStatus::Copied))
        .count();
    let errored = entries
        .iter()
        .filter(|entry| matches!(entry.status, StagingFileStatus::Error))
        .count();
    let missing = entries
        .iter()
        .filter(|entry| matches!(entry.status, StagingFileStatus::Missing))
        .count();

    if copied == entries.len() {
        StagingExecutionState::Success
    } else if copied > 0 && (errored > 0 || missing > 0) {
        StagingExecutionState::Partial
    } else {
        StagingExecutionState::Failed
    }
}

fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("path has no parent directory: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create directory {}: {error}", parent.display()))
}

fn write_json_file<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    let payload = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
    fs::write(path, payload).map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn compute_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn now_epoch_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock drift detected: {error}"))?;
    Ok(duration.as_millis() as u64)
}

mod domain;
mod importer;
mod legacy_import_contract;
mod settings;
mod storage;
mod workspace;

use domain::DomainContractSummary;
use importer::{
    ImporterExecutionPlan, ImporterRunResult, ImporterState, LegacyDiscoveryInput, LegacyImporter,
    MigrationExecutionResult, StagingExecutionResult,
};
use legacy_import_contract::LegacyImportContract;
use serde::Serialize;
use settings::{SecretVaultStatus, WorkspaceSettingsDocument};
use storage::{StorageSnapshot, TemplateValidationExportWriteResult, TemplateValidationSnapshot};
use tauri::Manager;
use workspace::WorkspaceSnapshot;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapContext {
    app_name: String,
    app_version: String,
    frontend_shell: String,
    runtime: String,
    platform: String,
    build_channel: String,
    branch: String,
    runtime_mode: String,
    supports_native_commands: bool,
    limitations: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImporterDryRunSnapshot {
    plan: ImporterExecutionPlan,
    result: ImporterRunResult,
    staging_execution: Option<StagingExecutionResult>,
    migration_execution: Option<MigrationExecutionResult>,
}

enum ImporterExecutionMode {
    DryRun,
    Staging,
    Migration,
}

#[tauri::command]
fn get_bootstrap_context(app: tauri::AppHandle) -> BootstrapContext {
    BootstrapContext {
        app_name: app.package_info().name.clone(),
        app_version: app.package_info().version.to_string(),
        frontend_shell: "React + Vite + TanStack Router + react-i18next".into(),
        runtime: "Tauri + Rust bootstrap shell".into(),
        platform: std::env::consts::OS.into(),
        build_channel: if cfg!(debug_assertions) {
            "development".into()
        } else {
            "production".into()
        },
        branch: "tauri-rust-desktop-rewrite".into(),
        runtime_mode: "tauri".into(),
        supports_native_commands: true,
        limitations: Vec::new(),
    }
}

#[tauri::command]
fn get_workspace_snapshot(app: tauri::AppHandle) -> Result<WorkspaceSnapshot, String> {
    workspace::get_workspace_snapshot(&app)
}

#[tauri::command]
fn get_domain_contract_summary() -> DomainContractSummary {
    domain::domain_contract_summary()
}

#[tauri::command]
fn get_legacy_import_contract() -> LegacyImportContract {
    legacy_import_contract::build_legacy_import_contract()
}

#[tauri::command]
fn get_storage_snapshot(app: tauri::AppHandle) -> Result<StorageSnapshot, String> {
    storage::get_storage_snapshot(&app)
}

#[tauri::command]
fn get_template_validation_snapshot(
    app: tauri::AppHandle,
) -> Result<TemplateValidationSnapshot, String> {
    storage::get_template_validation_snapshot(&app)
}

#[tauri::command]
fn write_template_validation_export(
    app: tauri::AppHandle,
    file_name: Option<String>,
    html: String,
) -> Result<TemplateValidationExportWriteResult, String> {
    storage::write_template_validation_export(&app, file_name, html)
}

#[tauri::command]
fn get_workspace_settings_snapshot(
    app: tauri::AppHandle,
) -> Result<WorkspaceSettingsDocument, String> {
    let workspace_root = resolve_workspace_root(&app)?;
    settings::load_or_initialize_settings(&workspace_root)
}

#[tauri::command]
fn get_secret_vault_status(app: tauri::AppHandle) -> Result<SecretVaultStatus, String> {
    let workspace_root = resolve_workspace_root(&app)?;
    settings::inspect_vault_status(&workspace_root)
}

#[tauri::command]
fn get_importer_dry_run(app: tauri::AppHandle) -> Result<ImporterDryRunSnapshot, String> {
    build_importer_snapshot(&app, ImporterExecutionMode::DryRun)
}

#[tauri::command]
fn execute_importer_staging(app: tauri::AppHandle) -> Result<ImporterDryRunSnapshot, String> {
    build_importer_snapshot(&app, ImporterExecutionMode::Staging)
}

#[tauri::command]
fn execute_importer_migration(app: tauri::AppHandle) -> Result<ImporterDryRunSnapshot, String> {
    build_importer_snapshot(&app, ImporterExecutionMode::Migration)
}

fn build_importer_snapshot(
    app: &tauri::AppHandle,
    mode: ImporterExecutionMode,
) -> Result<ImporterDryRunSnapshot, String> {
    let app_data_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    let workspace_root = resolve_workspace_root(app)?;
    let database_path = workspace_root.join("rolerover.db");

    let plan = LegacyImporter::build_plan(
        &path_to_string(&workspace_root),
        &path_to_string(&database_path),
        LegacyDiscoveryInput {
            app_data_root: path_to_string(&app_data_root),
            allow_local_storage_fallback: true,
        },
        false,
    );
    let result = LegacyImporter::evaluate_plan(&plan);

    let (staging_execution, migration_execution) = match mode {
        ImporterExecutionMode::DryRun => (None, None),
        ImporterExecutionMode::Staging => {
            if !matches!(result.state, ImporterState::ReadyForExecution) {
                return Err(format!(
                    "importer staging is blocked until dry-run passes: {}",
                    result.summary
                ));
            }

            (
                Some(LegacyImporter::execute_staging_and_audit(&plan, true)?),
                None,
            )
        }
        ImporterExecutionMode::Migration => {
            if !matches!(result.state, ImporterState::ReadyForExecution) {
                return Err(format!(
                    "importer migration is blocked until dry-run passes: {}",
                    result.summary
                ));
            }

            storage::get_storage_snapshot(app)?;
            let (staging_execution, migration_execution) =
                LegacyImporter::execute_document_migration(&plan)?;
            (Some(staging_execution), Some(migration_execution))
        }
    };

    Ok(ImporterDryRunSnapshot {
        plan,
        result,
        staging_execution,
        migration_execution,
    })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_context,
            get_workspace_snapshot,
            get_domain_contract_summary,
            get_legacy_import_contract,
            get_storage_snapshot,
            get_template_validation_snapshot,
            write_template_validation_export,
            get_workspace_settings_snapshot,
            get_secret_vault_status,
            get_importer_dry_run,
            execute_importer_staging,
            execute_importer_migration
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RoleRover desktop shell");
}

fn resolve_workspace_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    Ok(app_data_dir.join("workspace"))
}

fn path_to_string(path: &std::path::Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const WORKSPACE_SCHEMA_VERSION: u32 = 1;
const WORKSPACE_MANIFEST_FILE: &str = "workspace.json";
const WORKSPACE_ROOT_DIR: &str = "workspace";
const DOCUMENTS_DIR: &str = "documents";
const EXPORTS_DIR: &str = "exports";
const IMPORTS_DIR: &str = "imports";
const CACHE_DIR: &str = "cache";
const SECRETS_DIR: &str = "secrets";
const MANIFESTS_DIR: &str = "manifests";
const DATABASE_FILE: &str = "rolerover.db";
const WORKSPACE_SECURE_SETTINGS_FILE: &str = "vault-fallback.json";
const LEGACY_PRODUCT_DIR: &str = "RoleRover";
const LEGACY_DATABASE_FILE: &str = "jade.db";
const LEGACY_DATA_DIR: &str = "data";
const LEGACY_SECURE_SETTINGS_FILE: &str = "secure-settings.json";
const LEGACY_WINDOW_STATE_FILE: &str = "window-state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceManifest {
    schema_version: u32,
    workspace_id: String,
    created_at_epoch_ms: u64,
    last_opened_at_epoch_ms: u64,
    database_rel_path: String,
    secure_settings_rel_path: String,
    documents_rel_path: String,
    exports_rel_path: String,
    imports_rel_path: String,
    cache_rel_path: String,
    manifests_rel_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySourceSnapshot {
    id: String,
    label: String,
    kind: String,
    path: String,
    exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    schema_version: u32,
    workspace_id: String,
    bootstrap_status: String,
    migration_status: String,
    created_at_epoch_ms: u64,
    last_opened_at_epoch_ms: u64,
    root_dir: String,
    manifest_path: String,
    database_path: String,
    secure_settings_path: String,
    documents_dir: String,
    exports_dir: String,
    imports_dir: String,
    cache_dir: String,
    manifests_dir: String,
    legacy_sources: Vec<LegacySourceSnapshot>,
}

enum BootstrapStatus {
    Created,
    Reused,
}

pub fn get_workspace_snapshot(app: &AppHandle) -> Result<WorkspaceSnapshot, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;

    let workspace_root = app_data_dir.join(WORKSPACE_ROOT_DIR);
    ensure_directory(&workspace_root)?;

    let documents_dir = workspace_root.join(DOCUMENTS_DIR);
    let exports_dir = workspace_root.join(EXPORTS_DIR);
    let imports_dir = workspace_root.join(IMPORTS_DIR);
    let cache_dir = workspace_root.join(CACHE_DIR);
    let secrets_dir = workspace_root.join(SECRETS_DIR);
    let manifests_dir = workspace_root.join(MANIFESTS_DIR);

    for dir in [
        &documents_dir,
        &exports_dir,
        &imports_dir,
        &cache_dir,
        &secrets_dir,
        &manifests_dir,
    ] {
        ensure_directory(dir)?;
    }

    let manifest_path = manifests_dir.join(WORKSPACE_MANIFEST_FILE);
    let (mut manifest, bootstrap_status) = load_or_initialize_manifest(&manifest_path)?;

    manifest.last_opened_at_epoch_ms = now_epoch_ms()?;
    persist_manifest(&manifest_path, &manifest)?;

    let database_path = workspace_root.join(&manifest.database_rel_path);
    let secure_settings_path = workspace_root.join(&manifest.secure_settings_rel_path);

    let legacy_sources = collect_legacy_sources(&app_data_dir);
    let migration_status = if legacy_sources.iter().any(|source| source.exists) {
        "legacySourcesDetected"
    } else {
        "cleanWorkspace"
    };

    Ok(WorkspaceSnapshot {
        schema_version: manifest.schema_version,
        workspace_id: manifest.workspace_id.clone(),
        bootstrap_status: match bootstrap_status {
            BootstrapStatus::Created => "created",
            BootstrapStatus::Reused => "reused",
        }
        .into(),
        migration_status: migration_status.into(),
        created_at_epoch_ms: manifest.created_at_epoch_ms,
        last_opened_at_epoch_ms: manifest.last_opened_at_epoch_ms,
        root_dir: path_to_string(&workspace_root),
        manifest_path: path_to_string(&manifest_path),
        database_path: path_to_string(&database_path),
        secure_settings_path: path_to_string(&secure_settings_path),
        documents_dir: path_to_string(&documents_dir),
        exports_dir: path_to_string(&exports_dir),
        imports_dir: path_to_string(&imports_dir),
        cache_dir: path_to_string(&cache_dir),
        manifests_dir: path_to_string(&manifests_dir),
        legacy_sources,
    })
}

fn load_or_initialize_manifest(
    manifest_path: &Path,
) -> Result<(WorkspaceManifest, BootstrapStatus), String> {
    if manifest_path.exists() {
        let raw = fs::read_to_string(manifest_path).map_err(|error| {
            format!(
                "failed to read workspace manifest at {}: {error}",
                manifest_path.display()
            )
        })?;
        let manifest = serde_json::from_str::<WorkspaceManifest>(&raw).map_err(|error| {
            format!(
                "failed to parse workspace manifest at {}: {error}",
                manifest_path.display()
            )
        })?;
        let manifest = migrate_manifest_paths(manifest);
        return Ok((manifest, BootstrapStatus::Reused));
    }

    let manifest = WorkspaceManifest {
        schema_version: WORKSPACE_SCHEMA_VERSION,
        workspace_id: Uuid::new_v4().to_string(),
        created_at_epoch_ms: now_epoch_ms()?,
        last_opened_at_epoch_ms: now_epoch_ms()?,
        database_rel_path: DATABASE_FILE.into(),
        secure_settings_rel_path: format!("{SECRETS_DIR}/{WORKSPACE_SECURE_SETTINGS_FILE}"),
        documents_rel_path: DOCUMENTS_DIR.into(),
        exports_rel_path: EXPORTS_DIR.into(),
        imports_rel_path: IMPORTS_DIR.into(),
        cache_rel_path: CACHE_DIR.into(),
        manifests_rel_path: MANIFESTS_DIR.into(),
    };

    persist_manifest(manifest_path, &manifest)?;
    Ok((manifest, BootstrapStatus::Created))
}

fn migrate_manifest_paths(mut manifest: WorkspaceManifest) -> WorkspaceManifest {
    if manifest.secure_settings_rel_path == format!("{SECRETS_DIR}/secure-settings.json") {
        manifest.secure_settings_rel_path =
            format!("{SECRETS_DIR}/{WORKSPACE_SECURE_SETTINGS_FILE}");
    }
    manifest
}

fn persist_manifest(manifest_path: &Path, manifest: &WorkspaceManifest) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("failed to serialize workspace manifest: {error}"))?;
    fs::write(manifest_path, payload).map_err(|error| {
        format!(
            "failed to write workspace manifest at {}: {error}",
            manifest_path.display()
        )
    })
}

fn collect_legacy_sources(app_data_dir: &Path) -> Vec<LegacySourceSnapshot> {
    let mut sources = Vec::new();

    let mut roots = vec![app_data_dir.to_path_buf()];

    if let Some(parent) = app_data_dir.parent() {
        roots.push(parent.join(LEGACY_PRODUCT_DIR));
        roots.push(parent.join(LEGACY_PRODUCT_DIR.to_lowercase()));
    }

    for root in roots {
        sources.push(LegacySourceSnapshot {
            id: format!("legacy-db:{}", root.display()),
            label: "Legacy Electron SQLite".into(),
            kind: "sqlite".into(),
            path: path_to_string(&root.join(LEGACY_DATA_DIR).join(LEGACY_DATABASE_FILE)),
            exists: root
                .join(LEGACY_DATA_DIR)
                .join(LEGACY_DATABASE_FILE)
                .exists(),
        });
        sources.push(LegacySourceSnapshot {
            id: format!("legacy-secure-settings:{}", root.display()),
            label: "Legacy secure settings".into(),
            kind: "secure-settings".into(),
            path: path_to_string(&root.join(LEGACY_SECURE_SETTINGS_FILE)),
            exists: root.join(LEGACY_SECURE_SETTINGS_FILE).exists(),
        });
        sources.push(LegacySourceSnapshot {
            id: format!("legacy-window-state:{}", root.display()),
            label: "Legacy window state".into(),
            kind: "window-state".into(),
            path: path_to_string(&root.join(LEGACY_WINDOW_STATE_FILE)),
            exists: root.join(LEGACY_WINDOW_STATE_FILE).exists(),
        });
    }

    sources
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("failed to create directory {}: {error}", path.display()))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn now_epoch_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock drift detected: {error}"))?;
    Ok(duration.as_millis() as u64)
}

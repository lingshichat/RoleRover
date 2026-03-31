use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const STORAGE_SCHEMA_VERSION: u32 = 1;
const WORKSPACE_ROOT_DIR: &str = "workspace";
const DATABASE_FILE: &str = "rolerover.db";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableCountSnapshot {
    table: String,
    row_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSnapshot {
    schema_version: u32,
    bootstrap_status: String,
    workspace_root: String,
    database_path: String,
    workspace_id: String,
    initialized: bool,
    sqlite_version: String,
    table_counts: Vec<TableCountSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationSection {
    id: String,
    document_id: String,
    section_type: String,
    title: String,
    sort_order: i32,
    visible: bool,
    content: Value,
    created_at_epoch_ms: i64,
    updated_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationMetadata {
    id: String,
    title: String,
    template: String,
    language: String,
    target_job_title: Option<String>,
    target_company: Option<String>,
    is_default: bool,
    is_sample: bool,
    created_at_epoch_ms: i64,
    updated_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationSnapshot {
    source: String,
    representative_templates: Vec<String>,
    documents: Vec<TemplateValidationDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationDocument {
    metadata: TemplateValidationMetadata,
    theme: Value,
    sections: Vec<TemplateValidationSection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationExportWriteResult {
    file_name: String,
    output_path: String,
    bytes_written: usize,
}

struct StoragePaths {
    workspace_root: PathBuf,
    database_path: PathBuf,
}

pub fn get_storage_snapshot(app: &AppHandle) -> Result<StorageSnapshot, String> {
    let paths = resolve_storage_paths(app)?;
    ensure_storage_directory(&paths.workspace_root)?;

    let already_existed = paths.database_path.exists();
    let app_version = app.package_info().version.to_string();

    let connection = Connection::open(&paths.database_path).map_err(|error| {
        format!(
            "failed to open sqlite database {}: {error}",
            paths.database_path.display()
        )
    })?;

    configure_connection(&connection)?;
    bootstrap_schema(&connection)?;
    let workspace_id = seed_workspace_defaults(&connection, &app_version)?;

    let sqlite_version = connection
        .query_row("SELECT sqlite_version()", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("failed to query sqlite version: {error}"))?;

    let table_counts = collect_table_counts(&connection)?;

    Ok(StorageSnapshot {
        schema_version: STORAGE_SCHEMA_VERSION,
        bootstrap_status: if already_existed {
            "reused".into()
        } else {
            "created".into()
        },
        workspace_root: path_to_string(&paths.workspace_root),
        database_path: path_to_string(&paths.database_path),
        workspace_id,
        initialized: true,
        sqlite_version,
        table_counts,
    })
}

pub fn get_template_validation_snapshot(
    app: &AppHandle,
) -> Result<TemplateValidationSnapshot, String> {
    let paths = resolve_storage_paths(app)?;
    ensure_storage_directory(&paths.workspace_root)?;
    let app_version = app.package_info().version.to_string();

    let connection = Connection::open(&paths.database_path).map_err(|error| {
        format!(
            "failed to open sqlite database {}: {error}",
            paths.database_path.display()
        )
    })?;
    configure_connection(&connection)?;
    bootstrap_schema(&connection)?;
    seed_workspace_defaults(&connection, &app_version)?;

    let mut workspace_docs = load_workspace_template_documents(&connection)?;
    let mut used_sample_templates = Vec::new();

    for template in ["classic", "modern"] {
        if !workspace_docs
            .iter()
            .any(|document| document.metadata.template == template)
        {
            workspace_docs.push(build_sample_template_document(template));
            used_sample_templates.push(template.to_string());
        }
    }

    let source = if used_sample_templates.is_empty() {
        "workspace_documents".to_string()
    } else if used_sample_templates.len() == 2 {
        "native_sample_documents".to_string()
    } else {
        "workspace_plus_native_sample_documents".to_string()
    };

    Ok(TemplateValidationSnapshot {
        source,
        representative_templates: vec!["classic".to_string(), "modern".to_string()],
        documents: workspace_docs,
    })
}

pub fn write_template_validation_export(
    app: &AppHandle,
    file_name: Option<String>,
    html: String,
) -> Result<TemplateValidationExportWriteResult, String> {
    let paths = resolve_storage_paths(app)?;
    let exports_dir = paths.workspace_root.join("exports");
    ensure_storage_directory(&exports_dir)?;

    let sanitized = sanitize_export_file_name(file_name.as_deref().unwrap_or(""));
    let preferred_name = if sanitized.is_empty() {
        "template-validation-export.html".to_string()
    } else {
        sanitized
    };
    let output_name = resolve_non_conflicting_name(&exports_dir, &preferred_name)?;
    let output_path = exports_dir.join(&output_name);
    let bytes = html.into_bytes();
    let bytes_written = bytes.len();

    fs::write(&output_path, bytes).map_err(|error| {
        format!(
            "failed to write template validation export {}: {error}",
            output_path.display()
        )
    })?;

    Ok(TemplateValidationExportWriteResult {
        file_name: output_name,
        output_path: path_to_string(&output_path),
        bytes_written,
    })
}

fn resolve_storage_paths(app: &AppHandle) -> Result<StoragePaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;

    let workspace_root = app_data_dir.join(WORKSPACE_ROOT_DIR);
    let database_path = workspace_root.join(DATABASE_FILE);

    Ok(StoragePaths {
        workspace_root,
        database_path,
    })
}

fn load_workspace_template_documents(
    connection: &Connection,
) -> Result<Vec<TemplateValidationDocument>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
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
            FROM documents
            WHERE template IN ('classic', 'modern')
            ORDER BY updated_at_epoch_ms DESC
            "#,
        )
        .map_err(|error| format!("failed to prepare template document query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)? != 0,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })
        .map_err(|error| format!("failed to query template documents: {error}"))?;

    let mut newest_by_template: HashMap<String, TemplateValidationDocument> = HashMap::new();
    for row in rows {
        let (
            id,
            title,
            template,
            language,
            theme_json,
            is_default,
            target_job_title,
            target_company,
            created_at_epoch_ms,
            updated_at_epoch_ms,
        ) = row.map_err(|error| format!("failed to map template document row: {error}"))?;
        if newest_by_template.contains_key(&template) {
            continue;
        }

        newest_by_template.insert(
            template.clone(),
            TemplateValidationDocument {
                metadata: TemplateValidationMetadata {
                    id: id.clone(),
                    title,
                    template,
                    language,
                    target_job_title,
                    target_company,
                    is_default,
                    is_sample: false,
                    created_at_epoch_ms,
                    updated_at_epoch_ms,
                },
                theme: parse_json_or_default(&theme_json, "{}"),
                sections: load_document_sections(connection, &id)?,
            },
        );
    }

    let mut documents = Vec::new();
    for template in ["classic", "modern"] {
        if let Some(document) = newest_by_template.remove(template) {
            documents.push(document);
        }
    }

    Ok(documents)
}

fn load_document_sections(
    connection: &Connection,
    document_id: &str,
) -> Result<Vec<TemplateValidationSection>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id,
              document_id,
              section_type,
              title,
              sort_order,
              visible,
              content_json,
              created_at_epoch_ms,
              updated_at_epoch_ms
            FROM document_sections
            WHERE document_id = ?1
            ORDER BY sort_order ASC, created_at_epoch_ms ASC
            "#,
        )
        .map_err(|error| format!("failed to prepare section query: {error}"))?;

    let rows = statement
        .query_map(params![document_id], |row| {
            Ok(TemplateValidationSection {
                id: row.get::<_, String>(0)?,
                document_id: row.get::<_, String>(1)?,
                section_type: row.get::<_, String>(2)?,
                title: row.get::<_, String>(3)?,
                sort_order: row.get::<_, i32>(4)?,
                visible: row.get::<_, i64>(5)? != 0,
                content: parse_json_or_default(
                    &row.get::<_, String>(6)?,
                    "{}",
                ),
                created_at_epoch_ms: row.get::<_, i64>(7)?,
                updated_at_epoch_ms: row.get::<_, i64>(8)?,
            })
        })
        .map_err(|error| format!("failed to query sections for {document_id}: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to map sections for {document_id}: {error}"))
}

fn build_sample_template_document(template: &str) -> TemplateValidationDocument {
    let is_modern = template == "modern";
    let document_id = format!("native-sample-{template}");
    let now = now_epoch_ms().unwrap_or_default() as i64;

    let theme_config = if is_modern {
        json!({
            "primaryColor": "#0f172a",
            "accentColor": "#e11d48",
            "fontFamily": "Inter",
            "fontSize": "medium",
            "lineSpacing": 1.6,
            "margin": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
            "sectionSpacing": 16,
            "avatarStyle": "circle"
        })
    } else {
        json!({
            "primaryColor": "#111827",
            "accentColor": "#2563eb",
            "fontFamily": "Inter",
            "fontSize": "medium",
            "lineSpacing": 1.5,
            "margin": { "top": 24, "right": 24, "bottom": 24, "left": 24 },
            "sectionSpacing": 16,
            "avatarStyle": "oneInch"
        })
    };

    let sections = vec![
        TemplateValidationSection {
            id: format!("{document_id}-personal-info"),
            document_id: document_id.clone(),
            section_type: "personal_info".to_string(),
            title: "Personal Info".to_string(),
            sort_order: 0,
            visible: true,
            content: json!({
                "fullName": if is_modern { "Modern Candidate" } else { "Classic Candidate" },
                "jobTitle": "Desktop Migration Engineer",
                "email": "candidate@rolerover.local",
                "phone": "+1-555-0100",
                "location": "Desktop Runtime"
            }),
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        },
        TemplateValidationSection {
            id: format!("{document_id}-summary"),
            document_id: document_id.clone(),
            section_type: "summary".to_string(),
            title: "Summary".to_string(),
            sort_order: 1,
            visible: true,
            content: json!({
                "text": "Native desktop sample used to validate unified template preview/export for representative templates."
            }),
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        },
        TemplateValidationSection {
            id: format!("{document_id}-work-experience"),
            document_id: document_id.clone(),
            section_type: "work_experience".to_string(),
            title: "Work Experience".to_string(),
            sort_order: 2,
            visible: true,
            content: json!({
                "items": [
                    {
                        "id": format!("{document_id}-work-item-1"),
                        "company": "RoleRover",
                        "position": "Desktop Rewrite Owner",
                        "location": "Native Shell",
                        "startDate": "2025-01",
                        "endDate": null,
                        "current": true,
                        "description": "Unified template contract between preview and export.",
                        "technologies": ["Tauri", "Rust", "TypeScript"],
                        "highlights": [
                            "Validated classic and modern template slices in desktop shell."
                        ]
                    }
                ]
            }),
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        },
    ];

    TemplateValidationDocument {
        metadata: TemplateValidationMetadata {
            id: document_id,
            title: if is_modern {
                "Native Sample - Modern Template Validation"
            } else {
                "Native Sample - Classic Template Validation"
            }
            .to_string(),
            template: template.to_string(),
            language: "en".to_string(),
            target_job_title: Some("Desktop Migration Engineer".to_string()),
            target_company: Some("RoleRover".to_string()),
            is_default: false,
            is_sample: true,
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        },
        theme: theme_config,
        sections,
    }
}

fn parse_json_or_default(raw: &str, fallback: &str) -> Value {
    serde_json::from_str::<Value>(raw).unwrap_or_else(|_| {
        serde_json::from_str::<Value>(fallback).unwrap_or_else(|_| Value::Object(Default::default()))
    })
}

fn sanitize_export_file_name(raw: &str) -> String {
    let mut sanitized = raw
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric()
                || *character == '-'
                || *character == '_'
                || *character == '.'
        })
        .collect::<String>();
    if !sanitized.to_ascii_lowercase().ends_with(".html") {
        sanitized.push_str(".html");
    }
    if sanitized.starts_with('.') {
        sanitized = format!("export{sanitized}");
    }
    sanitized
}

fn resolve_non_conflicting_name(
    directory: &PathBuf,
    preferred_name: &str,
) -> Result<String, String> {
    let preferred_path = directory.join(preferred_name);
    if !preferred_path.exists() {
        return Ok(preferred_name.to_string());
    }

    let timestamp = now_epoch_ms()?;
    let candidate = format!(
        "{}-{timestamp}.html",
        preferred_name.trim_end_matches(".html")
    );
    Ok(candidate)
}

fn ensure_storage_directory(path: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "failed to create storage directory {}: {error}",
            path.display()
        )
    })
}

fn configure_connection(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;
            "#,
        )
        .map_err(|error| format!("failed to configure sqlite connection: {error}"))
}

fn bootstrap_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspace_metadata (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              workspace_id TEXT NOT NULL,
              schema_version INTEGER NOT NULL,
              created_at_epoch_ms INTEGER NOT NULL,
              updated_at_epoch_ms INTEGER NOT NULL,
              app_version TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspace_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              language TEXT NOT NULL DEFAULT 'zh',
              theme TEXT NOT NULL DEFAULT 'system',
              ai_provider TEXT NOT NULL DEFAULT 'openai',
              ai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
              ai_model TEXT NOT NULL DEFAULT 'gpt-4o',
              auto_save INTEGER NOT NULL DEFAULT 1,
              auto_save_interval_ms INTEGER NOT NULL DEFAULT 500,
              window_state_json TEXT NOT NULL DEFAULT '{}',
              updated_at_epoch_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              template TEXT NOT NULL,
              language TEXT NOT NULL,
              theme_json TEXT NOT NULL DEFAULT '{}',
              is_default INTEGER NOT NULL DEFAULT 0,
              target_job_title TEXT,
              target_company TEXT,
              created_at_epoch_ms INTEGER NOT NULL,
              updated_at_epoch_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS document_sections (
              id TEXT PRIMARY KEY,
              document_id TEXT NOT NULL,
              section_type TEXT NOT NULL,
              title TEXT NOT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              visible INTEGER NOT NULL DEFAULT 1,
              content_json TEXT NOT NULL DEFAULT '{}',
              created_at_epoch_ms INTEGER NOT NULL,
              updated_at_epoch_ms INTEGER NOT NULL,
              FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_chat_sessions (
              id TEXT PRIMARY KEY,
              document_id TEXT,
              title TEXT NOT NULL,
              created_at_epoch_ms INTEGER NOT NULL,
              updated_at_epoch_ms INTEGER NOT NULL,
              FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS ai_chat_messages (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              metadata_json TEXT NOT NULL DEFAULT '{}',
              created_at_epoch_ms INTEGER NOT NULL,
              FOREIGN KEY(session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_analysis_records (
              id TEXT PRIMARY KEY,
              document_id TEXT NOT NULL,
              analysis_type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              score INTEGER,
              issue_count INTEGER,
              target_job_title TEXT,
              target_company TEXT,
              created_at_epoch_ms INTEGER NOT NULL,
              FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS migration_audit (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              source_kind TEXT NOT NULL,
              source_path TEXT NOT NULL,
              status TEXT NOT NULL,
              imported_count INTEGER NOT NULL DEFAULT 0,
              dropped_count INTEGER NOT NULL DEFAULT 0,
              warning_count INTEGER NOT NULL DEFAULT 0,
              details_json TEXT NOT NULL DEFAULT '{}',
              created_at_epoch_ms INTEGER NOT NULL
            );
            "#,
        )
        .map_err(|error| format!("failed to bootstrap storage schema: {error}"))
}

fn seed_workspace_defaults(connection: &Connection, app_version: &str) -> Result<String, String> {
    let now = now_epoch_ms()? as i64;
    let workspace_id = connection
        .query_row(
            "SELECT workspace_id FROM workspace_metadata WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("failed to load workspace metadata: {error}"))?
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    connection
        .execute(
            r#"
            INSERT OR IGNORE INTO workspace_metadata (
              id, workspace_id, schema_version, created_at_epoch_ms, updated_at_epoch_ms, app_version
            ) VALUES (1, ?, ?, ?, ?, ?)
            "#,
            params![
                workspace_id,
                STORAGE_SCHEMA_VERSION as i64,
                now,
                now,
                app_version
            ],
        )
        .map_err(|error| format!("failed to seed workspace metadata: {error}"))?;

    connection
        .execute(
            r#"
            UPDATE workspace_metadata
            SET schema_version = ?, updated_at_epoch_ms = ?, app_version = ?
            WHERE id = 1
            "#,
            params![STORAGE_SCHEMA_VERSION as i64, now, app_version],
        )
        .map_err(|error| format!("failed to update workspace metadata: {error}"))?;

    connection
        .execute(
            r#"
            INSERT OR IGNORE INTO workspace_settings (
              id, language, theme, ai_provider, ai_base_url, ai_model, auto_save, auto_save_interval_ms,
              window_state_json, updated_at_epoch_ms
            ) VALUES (
              1, 'zh', 'system', 'openai', 'https://api.openai.com/v1', 'gpt-4o', 1, 500, '{}', ?
            )
            "#,
            params![now],
        )
        .map_err(|error| format!("failed to seed workspace settings: {error}"))?;

    Ok(workspace_id)
}

fn collect_table_counts(connection: &Connection) -> Result<Vec<TableCountSnapshot>, String> {
    let tables = [
        "workspace_metadata",
        "workspace_settings",
        "documents",
        "document_sections",
        "ai_chat_sessions",
        "ai_chat_messages",
        "ai_analysis_records",
        "migration_audit",
    ];

    tables
        .iter()
        .map(|table| {
            let query = format!("SELECT COUNT(*) FROM {table}");
            let row_count = connection
                .query_row(&query, [], |row| row.get::<_, i64>(0))
                .map_err(|error| format!("failed to count table {table}: {error}"))?;
            Ok(TableCountSnapshot {
                table: (*table).into(),
                row_count,
            })
        })
        .collect()
}

fn now_epoch_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock drift detected: {error}"))?;
    Ok(duration.as_millis() as u64)
}

fn path_to_string(path: &PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}

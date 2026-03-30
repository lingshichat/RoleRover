#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const SETTINGS_DIR: &str = "settings";
const SETTINGS_FILE: &str = "workspace-settings.json";
const SECRETS_DIR: &str = "secrets";
const SECRETS_MANIFEST_FILE: &str = "secrets-manifest.json";
const VAULT_FILE_FALLBACK: &str = "vault-fallback.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettingsDocument {
    pub schema_version: u32,
    pub locale: String,
    pub theme: String,
    pub ai: WorkspaceAiSettings,
    pub editor: WorkspaceEditorSettings,
    pub window: WorkspaceWindowSettings,
    pub updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAiSettings {
    pub default_provider: String,
    pub provider_configs: BTreeMap<String, ProviderRuntimeSettings>,
    pub exa_pool_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRuntimeSettings {
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEditorSettings {
    pub auto_save: bool,
    pub auto_save_interval_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWindowSettings {
    pub remember_window_state: bool,
    pub restore_last_workspace: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretKeyDescriptor {
    pub key: String,
    pub provider: Option<String>,
    pub purpose: String,
    pub updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsManifestDocument {
    pub schema_version: u32,
    pub vault_backend: SecretVaultBackend,
    pub encrypted_at_rest: bool,
    pub key_descriptors: Vec<SecretKeyDescriptor>,
    pub warnings: Vec<String>,
    pub updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretVaultBackend {
    Unconfigured,
    OsKeyring,
    Stronghold,
    FileFallback,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretVaultStatus {
    pub backend: SecretVaultBackend,
    pub encrypted_at_rest: bool,
    pub status: SecretVaultReadiness,
    pub warnings: Vec<String>,
    pub manifest_path: String,
    pub fallback_path: String,
    pub registered_secret_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretVaultReadiness {
    Ready,
    NeedsConfiguration,
    Degraded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySecureSettingEntry {
    encrypted: bool,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum VaultFallbackEncoding {
    Utf8Plaintext,
    LegacySafeStorageBase64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFallbackEntry {
    encoding: VaultFallbackEncoding,
    encrypted: bool,
    value: String,
    imported_from: String,
    imported_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFallbackDocument {
    schema_version: u32,
    entries: BTreeMap<String, VaultFallbackEntry>,
    updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureSettingsImportResult {
    pub imported_secret_count: u32,
    pub opaque_secret_count: u32,
    pub imported_keys: Vec<String>,
    pub opaque_keys: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn settings_file_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(SETTINGS_DIR).join(SETTINGS_FILE)
}

pub fn secrets_manifest_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(SECRETS_DIR).join(SECRETS_MANIFEST_FILE)
}

pub fn vault_fallback_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(SECRETS_DIR).join(VAULT_FILE_FALLBACK)
}

pub fn load_or_initialize_settings(
    workspace_root: &Path,
) -> Result<WorkspaceSettingsDocument, String> {
    let path = settings_file_path(workspace_root);
    if path.exists() {
        return read_json_file::<WorkspaceSettingsDocument>(&path);
    }

    let default_doc = default_settings_document()?;
    persist_settings(workspace_root, default_doc.clone())?;
    Ok(default_doc)
}

pub fn persist_settings(
    workspace_root: &Path,
    mut document: WorkspaceSettingsDocument,
) -> Result<(), String> {
    document.updated_at_epoch_ms = now_epoch_ms()?;
    let path = settings_file_path(workspace_root);
    ensure_parent(&path)?;
    write_json_file(&path, &document)
}

pub fn load_or_initialize_secrets_manifest(
    workspace_root: &Path,
) -> Result<SecretsManifestDocument, String> {
    let path = secrets_manifest_path(workspace_root);
    if path.exists() {
        return read_json_file::<SecretsManifestDocument>(&path);
    }

    let default_doc = default_secrets_manifest()?;
    persist_secrets_manifest(workspace_root, default_doc.clone())?;
    Ok(default_doc)
}

pub fn persist_secrets_manifest(
    workspace_root: &Path,
    mut document: SecretsManifestDocument,
) -> Result<(), String> {
    document.updated_at_epoch_ms = now_epoch_ms()?;
    let path = secrets_manifest_path(workspace_root);
    ensure_parent(&path)?;
    write_json_file(&path, &document)
}

pub fn inspect_vault_status(workspace_root: &Path) -> Result<SecretVaultStatus, String> {
    let manifest = load_or_initialize_secrets_manifest(workspace_root)?;
    let has_fallback_file = vault_fallback_path(workspace_root).exists();

    let mut warnings = manifest.warnings.clone();
    if has_fallback_file {
        warnings.push("vault-fallback.json detected; plaintext fallback path exists".into());
    }

    let status = match manifest.vault_backend {
        SecretVaultBackend::Unconfigured => SecretVaultReadiness::NeedsConfiguration,
        SecretVaultBackend::OsKeyring | SecretVaultBackend::Stronghold => {
            if manifest.encrypted_at_rest {
                SecretVaultReadiness::Ready
            } else {
                SecretVaultReadiness::Degraded
            }
        }
        SecretVaultBackend::FileFallback => SecretVaultReadiness::Degraded,
    };

    Ok(SecretVaultStatus {
        backend: manifest.vault_backend,
        encrypted_at_rest: manifest.encrypted_at_rest,
        status,
        warnings,
        manifest_path: path_to_string(&secrets_manifest_path(workspace_root)),
        fallback_path: path_to_string(&vault_fallback_path(workspace_root)),
        registered_secret_count: manifest.key_descriptors.len(),
    })
}

pub fn import_legacy_secure_settings(
    workspace_root: &Path,
    legacy_settings_path: &Path,
) -> Result<SecureSettingsImportResult, String> {
    let legacy_store =
        read_json_file::<BTreeMap<String, LegacySecureSettingEntry>>(legacy_settings_path)?;
    let imported_at_epoch_ms = now_epoch_ms()?;
    let mut fallback_entries = BTreeMap::new();
    let mut key_descriptors = Vec::new();
    let mut imported_keys = Vec::new();
    let mut opaque_keys = Vec::new();
    let mut warnings = Vec::new();

    for (legacy_key, entry) in legacy_store {
        match legacy_key.as_str() {
            "jade_secure_provider_api_keys" => {
                import_provider_map_entry(
                    &legacy_key,
                    &entry,
                    imported_at_epoch_ms,
                    &mut fallback_entries,
                    &mut key_descriptors,
                    &mut imported_keys,
                    &mut opaque_keys,
                    &mut warnings,
                )?;
            }
            "jade_secure_exa_pool_api_key" => {
                import_single_secret_entry(
                    &legacy_key,
                    "provider.exa_pool.api_key",
                    Some("exa_pool"),
                    "Imported Exa Pool API key from the legacy desktop secure settings store.",
                    &entry,
                    imported_at_epoch_ms,
                    &mut fallback_entries,
                    &mut key_descriptors,
                    &mut imported_keys,
                    &mut opaque_keys,
                    &mut warnings,
                )?;
            }
            "jade_api_key" => {
                import_single_secret_entry(
                    &legacy_key,
                    "provider.openai.api_key",
                    Some("openai"),
                    "Imported legacy OpenAI API key from desktop compatibility storage.",
                    &entry,
                    imported_at_epoch_ms,
                    &mut fallback_entries,
                    &mut key_descriptors,
                    &mut imported_keys,
                    &mut opaque_keys,
                    &mut warnings,
                )?;
            }
            _ => {
                carry_forward_opaque_secret(
                    &legacy_key,
                    &entry,
                    imported_at_epoch_ms,
                    &mut fallback_entries,
                    &mut key_descriptors,
                    &mut opaque_keys,
                    &mut warnings,
                    "Unrecognized legacy secure settings key was preserved for later inspection.",
                );
            }
        }
    }

    if fallback_entries.is_empty() && key_descriptors.is_empty() {
        warnings.push(
            "Legacy secure settings file existed, but it did not contain any importable or preservable entries."
                .into(),
        );
        return Ok(SecureSettingsImportResult {
            imported_secret_count: 0,
            opaque_secret_count: 0,
            imported_keys,
            opaque_keys,
            warnings,
        });
    }

    let mut manifest = load_or_initialize_secrets_manifest(workspace_root)?;
    manifest.vault_backend = SecretVaultBackend::FileFallback;
    manifest.encrypted_at_rest = false;
    manifest.key_descriptors = key_descriptors;
    manifest.warnings = build_import_manifest_warnings(
        imported_keys.len() as u32,
        opaque_keys.len() as u32,
        &warnings,
    );
    persist_secrets_manifest(workspace_root, manifest)?;

    let fallback_doc = VaultFallbackDocument {
        schema_version: 1,
        entries: fallback_entries,
        updated_at_epoch_ms: imported_at_epoch_ms,
    };
    let fallback_path = vault_fallback_path(workspace_root);
    ensure_parent(&fallback_path)?;
    write_json_file(&fallback_path, &fallback_doc)?;

    Ok(SecureSettingsImportResult {
        imported_secret_count: imported_keys.len() as u32,
        opaque_secret_count: opaque_keys.len() as u32,
        imported_keys,
        opaque_keys,
        warnings,
    })
}

fn default_settings_document() -> Result<WorkspaceSettingsDocument, String> {
    let mut provider_configs = BTreeMap::new();
    provider_configs.insert(
        "openai".into(),
        ProviderRuntimeSettings {
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o".into(),
        },
    );
    provider_configs.insert(
        "anthropic".into(),
        ProviderRuntimeSettings {
            base_url: "https://api.anthropic.com".into(),
            model: "claude-sonnet-4-20250514".into(),
        },
    );
    provider_configs.insert(
        "gemini".into(),
        ProviderRuntimeSettings {
            base_url: "https://generativelanguage.googleapis.com/v1beta".into(),
            model: "gemini-2.0-flash".into(),
        },
    );

    Ok(WorkspaceSettingsDocument {
        schema_version: 1,
        locale: "zh".into(),
        theme: "system".into(),
        ai: WorkspaceAiSettings {
            default_provider: "openai".into(),
            provider_configs,
            exa_pool_base_url: String::new(),
        },
        editor: WorkspaceEditorSettings {
            auto_save: true,
            auto_save_interval_ms: 500,
        },
        window: WorkspaceWindowSettings {
            remember_window_state: true,
            restore_last_workspace: true,
        },
        updated_at_epoch_ms: now_epoch_ms()?,
    })
}

fn default_secrets_manifest() -> Result<SecretsManifestDocument, String> {
    Ok(SecretsManifestDocument {
        schema_version: 1,
        vault_backend: SecretVaultBackend::Unconfigured,
        encrypted_at_rest: false,
        key_descriptors: Vec::new(),
        warnings: vec![
            "Vault backend is not configured yet; secret persistence must be wired before production use."
                .into(),
            "No plaintext secret values are stored in this manifest.".into(),
        ],
        updated_at_epoch_ms: now_epoch_ms()?,
    })
}

fn import_provider_map_entry(
    legacy_key: &str,
    entry: &LegacySecureSettingEntry,
    imported_at_epoch_ms: u64,
    fallback_entries: &mut BTreeMap<String, VaultFallbackEntry>,
    key_descriptors: &mut Vec<SecretKeyDescriptor>,
    imported_keys: &mut Vec<String>,
    opaque_keys: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let decoded = match decode_legacy_entry_to_utf8(legacy_key, entry) {
        Ok(Some(decoded)) => decoded,
        Ok(None) => {
            carry_forward_opaque_secret(
                legacy_key,
                entry,
                imported_at_epoch_ms,
                fallback_entries,
                key_descriptors,
                opaque_keys,
                warnings,
                "Legacy provider API key map is still encrypted by Electron safeStorage and was preserved as an opaque payload.",
            );
            return Ok(());
        }
        Err(error) => {
            warnings.push(error);
            return Ok(());
        }
    };

    let parsed = serde_json::from_str::<BTreeMap<String, String>>(&decoded).map_err(|error| {
        format!("failed to parse {legacy_key} as a provider API key map during import: {error}")
    })?;

    for (provider, value) in parsed {
        let Some(normalized_provider) = normalize_provider_key(&provider) else {
            warnings.push(format!(
                "unsupported provider key '{provider}' was skipped during legacy secure settings import."
            ));
            continue;
        };

        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }

        let target_key = format!("provider.{normalized_provider}.api_key");
        upsert_plaintext_secret(
            target_key,
            Some(normalized_provider.to_string()),
            format!("Imported {normalized_provider} API key from the legacy secure provider map."),
            trimmed.to_string(),
            legacy_key.to_string(),
            imported_at_epoch_ms,
            fallback_entries,
            key_descriptors,
            imported_keys,
            warnings,
        );
    }

    Ok(())
}

fn import_single_secret_entry(
    legacy_key: &str,
    target_key: &str,
    provider: Option<&str>,
    purpose: &str,
    entry: &LegacySecureSettingEntry,
    imported_at_epoch_ms: u64,
    fallback_entries: &mut BTreeMap<String, VaultFallbackEntry>,
    key_descriptors: &mut Vec<SecretKeyDescriptor>,
    imported_keys: &mut Vec<String>,
    opaque_keys: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let decoded = match decode_legacy_entry_to_utf8(legacy_key, entry) {
        Ok(Some(decoded)) => decoded,
        Ok(None) => {
            carry_forward_opaque_secret(
                legacy_key,
                entry,
                imported_at_epoch_ms,
                fallback_entries,
                key_descriptors,
                opaque_keys,
                warnings,
                "Legacy secure setting is still encrypted by Electron safeStorage and was preserved as an opaque payload.",
            );
            return Ok(());
        }
        Err(error) => {
            warnings.push(error);
            return Ok(());
        }
    };

    let trimmed = decoded.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    upsert_plaintext_secret(
        target_key.to_string(),
        provider.map(ToString::to_string),
        purpose.to_string(),
        trimmed.to_string(),
        legacy_key.to_string(),
        imported_at_epoch_ms,
        fallback_entries,
        key_descriptors,
        imported_keys,
        warnings,
    );

    Ok(())
}

fn upsert_plaintext_secret(
    target_key: String,
    provider: Option<String>,
    purpose: String,
    plaintext_value: String,
    imported_from: String,
    imported_at_epoch_ms: u64,
    fallback_entries: &mut BTreeMap<String, VaultFallbackEntry>,
    key_descriptors: &mut Vec<SecretKeyDescriptor>,
    imported_keys: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    if fallback_entries.contains_key(&target_key) {
        warnings.push(format!(
            "duplicate secret target '{target_key}' was overwritten by the latest imported legacy entry."
        ));
    }

    fallback_entries.insert(
        target_key.clone(),
        VaultFallbackEntry {
            encoding: VaultFallbackEncoding::Utf8Plaintext,
            encrypted: false,
            value: plaintext_value,
            imported_from,
            imported_at_epoch_ms,
        },
    );
    imported_keys.push(target_key.clone());

    key_descriptors.retain(|descriptor| descriptor.key != target_key);
    key_descriptors.push(SecretKeyDescriptor {
        key: target_key,
        provider,
        purpose,
        updated_at_epoch_ms: imported_at_epoch_ms,
    });
}

fn carry_forward_opaque_secret(
    legacy_key: &str,
    entry: &LegacySecureSettingEntry,
    imported_at_epoch_ms: u64,
    fallback_entries: &mut BTreeMap<String, VaultFallbackEntry>,
    key_descriptors: &mut Vec<SecretKeyDescriptor>,
    opaque_keys: &mut Vec<String>,
    warnings: &mut Vec<String>,
    warning_message: &str,
) {
    let target_key = format!("legacy.{legacy_key}");
    fallback_entries.insert(
        target_key.clone(),
        VaultFallbackEntry {
            encoding: VaultFallbackEncoding::LegacySafeStorageBase64,
            encrypted: entry.encrypted,
            value: entry.value.clone(),
            imported_from: legacy_key.to_string(),
            imported_at_epoch_ms,
        },
    );
    opaque_keys.push(target_key.clone());
    key_descriptors.push(SecretKeyDescriptor {
        key: target_key,
        provider: None,
        purpose: "Opaque legacy secure payload preserved for later migration tooling.".into(),
        updated_at_epoch_ms: imported_at_epoch_ms,
    });
    warnings.push(format!("{warning_message} ({legacy_key})"));
}

fn build_import_manifest_warnings(
    imported_secret_count: u32,
    opaque_secret_count: u32,
    import_warnings: &[String],
) -> Vec<String> {
    let mut warnings = vec![
        "Secrets were imported into vault-fallback.json because an encrypted desktop vault backend is not wired yet."
            .into(),
    ];

    if imported_secret_count == 0 {
        warnings.push(
            "No plaintext secret values were recoverable from the legacy secure settings store."
                .into(),
        );
    }

    if opaque_secret_count > 0 {
        warnings.push(format!(
            "{opaque_secret_count} encrypted legacy secret payload(s) were preserved as opaque safeStorage blobs and still require follow-up decryption or manual re-entry."
        ));
    }

    warnings.extend(import_warnings.iter().cloned());
    warnings
}

fn decode_legacy_entry_to_utf8(
    legacy_key: &str,
    entry: &LegacySecureSettingEntry,
) -> Result<Option<String>, String> {
    if entry.encrypted {
        return Ok(None);
    }

    let bytes = decode_base64(&entry.value).map_err(|error| {
        format!("failed to decode base64 payload for legacy secure setting {legacy_key}: {error}")
    })?;
    String::from_utf8(bytes).map(Some).map_err(|error| {
        format!(
            "legacy secure setting {legacy_key} was not valid UTF-8 after base64 decoding: {error}"
        )
    })
}

fn normalize_provider_key(provider: &str) -> Option<&'static str> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "openai" | "custom" | "azure" => Some("openai"),
        "anthropic" => Some("anthropic"),
        "gemini" => Some("gemini"),
        _ => None,
    }
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut sextets = Vec::new();
    for ch in input.chars().filter(|ch| !ch.is_ascii_whitespace()) {
        match ch {
            '=' => break,
            'A'..='Z' => sextets.push((ch as u8) - b'A'),
            'a'..='z' => sextets.push((ch as u8) - b'a' + 26),
            '0'..='9' => sextets.push((ch as u8) - b'0' + 52),
            '+' => sextets.push(62),
            '/' => sextets.push(63),
            _ => return Err(format!("invalid base64 character '{ch}'")),
        }
    }

    if sextets.is_empty() {
        return Ok(Vec::new());
    }

    let remainder = sextets.len() % 4;
    if remainder == 1 {
        return Err("base64 payload has an invalid length".into());
    }

    let mut bytes = Vec::with_capacity((sextets.len() * 3) / 4);
    let mut index = 0;
    while index < sextets.len() {
        let a = sextets[index];
        let b = *sextets.get(index + 1).unwrap_or(&0);
        let c = *sextets.get(index + 2).unwrap_or(&0);
        let d = *sextets.get(index + 3).unwrap_or(&0);

        bytes.push((a << 2) | (b >> 4));
        if index + 2 < sextets.len() {
            bytes.push(((b & 0x0F) << 4) | (c >> 2));
        }
        if index + 3 < sextets.len() {
            bytes.push(((c & 0x03) << 6) | d);
        }

        index += 4;
    }

    Ok(bytes)
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create directory {}: {error}", parent.display()))
}

fn read_json_file<T>(path: &Path) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

fn write_json_file<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    let payload = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
    fs::write(path, payload).map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn now_epoch_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock drift detected: {error}"))?;
    Ok(duration.as_millis() as u64)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

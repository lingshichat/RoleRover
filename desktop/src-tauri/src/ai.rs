use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use crate::settings;

pub const AI_STREAM_EVENT_NAME: &str = "desktop://ai-stream";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAiPromptStreamInput {
    pub provider: String,
    pub prompt: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub request_id: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamStartReceipt {
    pub request_id: String,
    pub provider: String,
    pub model: String,
    pub event_name: String,
    pub started_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DesktopAiStreamEventKind {
    Started,
    Delta,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiStreamEvent {
    pub request_id: String,
    pub provider: String,
    pub model: String,
    pub kind: DesktopAiStreamEventKind,
    pub started_at_epoch_ms: u64,
    pub emitted_at_epoch_ms: u64,
    pub finished_at_epoch_ms: Option<u64>,
    pub chunk_index: Option<u32>,
    pub delta_text: Option<String>,
    pub accumulated_text: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
struct ResolvedProviderConfig {
    provider: String,
    base_url: String,
    model: String,
    api_key: String,
}

#[derive(Default)]
struct SseEventBuffer {
    buffer: Vec<u8>,
}

impl SseEventBuffer {
    fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();

        while let Some(boundary_index) = find_sse_boundary(&self.buffer) {
            let event_bytes = self.buffer.drain(..boundary_index).collect::<Vec<u8>>();
            let payload_bytes = trim_event_terminator(event_bytes);

            if payload_bytes.is_empty() {
                continue;
            }

            if let Ok(payload) = String::from_utf8(payload_bytes) {
                events.push(payload);
            }
        }

        events
    }
}

pub fn start_ai_prompt_stream(
    app: &AppHandle,
    workspace_root: &std::path::Path,
    input: StartAiPromptStreamInput,
) -> Result<AiStreamStartReceipt, String> {
    let prompt = input.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("prompt is required for native streaming".into());
    }

    let resolved = resolve_provider_config(workspace_root, &input)?;
    let request_id = input
        .request_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let started_at_epoch_ms = now_epoch_ms()?;
    let app_handle = app.clone();
    let system_prompt = input
        .system_prompt
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let receipt = AiStreamStartReceipt {
        request_id: request_id.clone(),
        provider: resolved.provider.clone(),
        model: resolved.model.clone(),
        event_name: AI_STREAM_EVENT_NAME.into(),
        started_at_epoch_ms,
    };

    tauri::async_runtime::spawn(async move {
        let run_result = match resolved.provider.as_str() {
            "openai" => {
                run_openai_compatible_stream(
                    &app_handle,
                    &request_id,
                    &prompt,
                    system_prompt.as_deref(),
                    &resolved,
                    started_at_epoch_ms,
                )
                .await
            }
            unsupported => Err(format!(
                "provider '{unsupported}' is not wired for native desktop streaming yet; PR5 validates the OpenAI-compatible path first."
            )),
        };

        if let Err(error) = run_result {
            let _ = emit_stream_event(
                &app_handle,
                DesktopAiStreamEvent {
                    request_id: request_id.clone(),
                    provider: resolved.provider.clone(),
                    model: resolved.model.clone(),
                    kind: DesktopAiStreamEventKind::Error,
                    started_at_epoch_ms,
                    emitted_at_epoch_ms: now_epoch_ms().unwrap_or(started_at_epoch_ms),
                    finished_at_epoch_ms: Some(now_epoch_ms().unwrap_or(started_at_epoch_ms)),
                    chunk_index: None,
                    delta_text: None,
                    accumulated_text: None,
                    error_message: Some(error),
                },
            );
        }
    });

    Ok(receipt)
}

fn resolve_provider_config(
    workspace_root: &std::path::Path,
    input: &StartAiPromptStreamInput,
) -> Result<ResolvedProviderConfig, String> {
    let settings_document = settings::load_or_initialize_settings(workspace_root)?;
    let provider = if input.provider.trim().is_empty() {
        settings_document.ai.default_provider.trim().to_string()
    } else {
        normalize_supported_provider(&input.provider).ok_or_else(|| {
            format!(
                "provider '{}' is not part of the desktop runtime contract",
                input.provider.trim()
            )
        })?
    };
    let configured = settings_document.ai.provider_configs.get(&provider);
    let base_url = input
        .base_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| configured.map(|value| value.base_url.trim().to_string()))
        .unwrap_or_else(|| default_base_url_for_provider(&provider).to_string());
    let model = input
        .model
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| configured.map(|value| value.model.trim().to_string()))
        .unwrap_or_else(|| default_model_for_provider(&provider).to_string());
    let api_key_secret_key = format!("provider.{provider}.api_key");
    let api_key = settings::read_secret_value(workspace_root, &api_key_secret_key)?
        .unwrap_or_default()
        .trim()
        .to_string();

    if api_key.is_empty() {
        return Err(format!(
            "No API key is configured for provider '{provider}'. Save `{api_key_secret_key}` first."
        ));
    }

    Ok(ResolvedProviderConfig {
        provider,
        base_url,
        model,
        api_key,
    })
}

async fn run_openai_compatible_stream(
    app: &AppHandle,
    request_id: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    config: &ResolvedProviderConfig,
    started_at_epoch_ms: u64,
) -> Result<(), String> {
    emit_stream_event(
        app,
        DesktopAiStreamEvent {
            request_id: request_id.to_string(),
            provider: config.provider.clone(),
            model: config.model.clone(),
            kind: DesktopAiStreamEventKind::Started,
            started_at_epoch_ms,
            emitted_at_epoch_ms: now_epoch_ms()?,
            finished_at_epoch_ms: None,
            chunk_index: Some(0),
            delta_text: None,
            accumulated_text: Some(String::new()),
            error_message: None,
        },
    )?;

    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let mut messages = Vec::new();
    if let Some(system_prompt) = system_prompt.filter(|value| !value.trim().is_empty()) {
        messages.push(json!({
            "role": "system",
            "content": system_prompt,
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": prompt,
    }));

    let response = client
        .post(&endpoint)
        .bearer_auth(&config.api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": config.model,
            "stream": true,
            "messages": messages,
        }))
        .send()
        .await
        .map_err(|error| format!("failed to call {endpoint}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| String::from("failed to read upstream error body"));
        return Err(format!("provider returned {status}: {body}"));
    }

    let mut event_buffer = SseEventBuffer::default();
    let mut accumulated_text = String::new();
    let mut chunk_index = 0u32;
    let mut response_stream = response.bytes_stream();

    while let Some(chunk_result) = response_stream.next().await {
        let chunk =
            chunk_result.map_err(|error| format!("failed to read stream chunk: {error}"))?;
        for event_payload in event_buffer.push(chunk.as_ref()) {
            let Some(data_payload) = extract_sse_data_payload(&event_payload) else {
                continue;
            };

            if data_payload == "[DONE]" {
                emit_stream_event(
                    app,
                    DesktopAiStreamEvent {
                        request_id: request_id.to_string(),
                        provider: config.provider.clone(),
                        model: config.model.clone(),
                        kind: DesktopAiStreamEventKind::Completed,
                        started_at_epoch_ms,
                        emitted_at_epoch_ms: now_epoch_ms()?,
                        finished_at_epoch_ms: Some(now_epoch_ms()?),
                        chunk_index: Some(chunk_index),
                        delta_text: None,
                        accumulated_text: Some(accumulated_text.clone()),
                        error_message: None,
                    },
                )?;
                return Ok(());
            }

            if let Some(delta_text) = extract_openai_delta_text(&data_payload) {
                if delta_text.is_empty() {
                    continue;
                }

                chunk_index += 1;
                accumulated_text.push_str(&delta_text);
                emit_stream_event(
                    app,
                    DesktopAiStreamEvent {
                        request_id: request_id.to_string(),
                        provider: config.provider.clone(),
                        model: config.model.clone(),
                        kind: DesktopAiStreamEventKind::Delta,
                        started_at_epoch_ms,
                        emitted_at_epoch_ms: now_epoch_ms()?,
                        finished_at_epoch_ms: None,
                        chunk_index: Some(chunk_index),
                        delta_text: Some(delta_text),
                        accumulated_text: Some(accumulated_text.clone()),
                        error_message: None,
                    },
                )?;
            }
        }
    }

    emit_stream_event(
        app,
        DesktopAiStreamEvent {
            request_id: request_id.to_string(),
            provider: config.provider.clone(),
            model: config.model.clone(),
            kind: DesktopAiStreamEventKind::Completed,
            started_at_epoch_ms,
            emitted_at_epoch_ms: now_epoch_ms()?,
            finished_at_epoch_ms: Some(now_epoch_ms()?),
            chunk_index: Some(chunk_index),
            delta_text: None,
            accumulated_text: Some(accumulated_text),
            error_message: None,
        },
    )?;

    Ok(())
}

fn emit_stream_event(app: &AppHandle, payload: DesktopAiStreamEvent) -> Result<(), String> {
    app.emit(AI_STREAM_EVENT_NAME, payload)
        .map_err(|error| format!("failed to emit AI stream event: {error}"))
}

fn extract_sse_data_payload(event_payload: &str) -> Option<String> {
    let mut data_lines = Vec::new();
    for line in event_payload.lines() {
        if let Some(content) = line.strip_prefix("data:") {
            data_lines.push(content.trim_start().to_string());
        }
    }

    if data_lines.is_empty() {
        None
    } else {
        Some(data_lines.join("\n"))
    }
}

fn extract_openai_delta_text(data_payload: &str) -> Option<String> {
    let payload = serde_json::from_str::<serde_json::Value>(data_payload).ok()?;
    let choice = payload.get("choices")?.as_array()?.first()?;
    let content = choice.get("delta")?.get("content")?;

    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }

    let mut aggregated = String::new();
    for item in content.as_array()? {
        if let Some(text) = item.get("text").and_then(|value| value.as_str()) {
            aggregated.push_str(text);
        }
    }

    if aggregated.is_empty() {
        None
    } else {
        Some(aggregated)
    }
}

fn normalize_supported_provider(provider: &str) -> Option<String> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "openai" | "anthropic" | "gemini" => Some(provider.trim().to_ascii_lowercase()),
        _ => None,
    }
}

fn default_base_url_for_provider(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "https://api.anthropic.com",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta",
        _ => "https://api.openai.com/v1",
    }
}

fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "claude-sonnet-4-20250514",
        "gemini" => "gemini-2.0-flash",
        _ => "gpt-4o",
    }
}

fn now_epoch_ms() -> Result<u64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("clock drift detected: {error}"))?;
    Ok(duration.as_millis() as u64)
}

fn find_sse_boundary(buffer: &[u8]) -> Option<usize> {
    let mut index = 0usize;
    while index + 1 < buffer.len() {
        if buffer[index] == b'\n' && buffer[index + 1] == b'\n' {
            return Some(index + 2);
        }

        if index + 3 < buffer.len()
            && buffer[index] == b'\r'
            && buffer[index + 1] == b'\n'
            && buffer[index + 2] == b'\r'
            && buffer[index + 3] == b'\n'
        {
            return Some(index + 4);
        }

        index += 1;
    }

    None
}

fn trim_event_terminator(mut event_bytes: Vec<u8>) -> Vec<u8> {
    while matches!(event_bytes.last(), Some(b'\n' | b'\r')) {
        event_bytes.pop();
    }
    event_bytes
}

// ---------------------------------------------------------------------------
// Fetch AI Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchAiModelsResult {
    pub provider: String,
    pub models: Vec<String>,
}

pub async fn fetch_ai_models(
    workspace_root: &std::path::Path,
    provider_override: Option<&str>,
) -> Result<FetchAiModelsResult, String> {
    let settings_document = settings::load_or_initialize_settings(workspace_root)?;
    let provider = provider_override
        .filter(|value| !value.trim().is_empty())
        .and_then(|value| normalize_supported_provider(value))
        .unwrap_or_else(|| settings_document.ai.default_provider.trim().to_string());

    let configured = settings_document.ai.provider_configs.get(&provider);
    let base_url = configured
        .map(|value| value.base_url.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_base_url_for_provider(&provider).to_string());

    let api_key_secret_key = format!("provider.{provider}.api_key");
    let api_key = settings::read_secret_value(workspace_root, &api_key_secret_key)?
        .unwrap_or_default()
        .trim()
        .to_string();

    if api_key.is_empty() {
        return Ok(FetchAiModelsResult {
            provider,
            models: Vec::new(),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let models = match provider.as_str() {
        "anthropic" => fetch_anthropic_models(&client, &base_url, &api_key).await?,
        "gemini" => fetch_gemini_models(&client, &base_url, &api_key).await?,
        _ => fetch_openai_models(&client, &base_url, &api_key).await?,
    };

    Ok(FetchAiModelsResult { provider, models })
}

async fn fetch_openai_models(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> Result<Vec<String>, String> {
    let endpoint = format!("{}/models", base_url.trim_end_matches('/'));
    let response = client
        .get(&endpoint)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| format!("failed to fetch OpenAI models: {error}"))?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse OpenAI models response: {error}"))?;

    let models = body
        .get("data")
        .and_then(|v| v.as_array())
        .or_else(|| body.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.get("id").and_then(|v| v.as_str()))
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut models = models;
    models.sort();
    Ok(models)
}

async fn fetch_anthropic_models(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> Result<Vec<String>, String> {
    let endpoint = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let response = client
        .get(&endpoint)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(|error| format!("failed to fetch Anthropic models: {error}"))?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse Anthropic models response: {error}"))?;

    let models = body
        .get("data")
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.get("id").and_then(|value| value.as_str()))
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut models = models;
    models.sort();
    Ok(models)
}

async fn fetch_gemini_models(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> Result<Vec<String>, String> {
    let endpoint = format!(
        "{}/models?key={}",
        base_url.trim_end_matches('/'),
        api_key
    );
    let response = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|error| format!("failed to fetch Gemini models: {error}"))?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse Gemini models response: {error}"))?;

    let models = body
        .get("models")
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.get("name").and_then(|value| value.as_str()))
                .map(|name| name.strip_prefix("models/").unwrap_or(name).to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut models = models;
    models.sort();
    Ok(models)
}

// ---------------------------------------------------------------------------
// Test AI Connectivity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityTestResult {
    pub success: bool,
    pub latency_ms: u64,
    pub error_message: Option<String>,
}

pub async fn test_ai_connectivity(
    workspace_root: &std::path::Path,
    provider_override: Option<&str>,
) -> Result<ConnectivityTestResult, String> {
    let settings_document = settings::load_or_initialize_settings(workspace_root)?;
    let provider = provider_override
        .filter(|value| !value.trim().is_empty())
        .and_then(|value| normalize_supported_provider(value))
        .unwrap_or_else(|| settings_document.ai.default_provider.trim().to_string());

    let configured = settings_document.ai.provider_configs.get(&provider);
    let base_url = configured
        .map(|value| value.base_url.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_base_url_for_provider(&provider).to_string());
    let model = configured
        .map(|value| value.model.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_model_for_provider(&provider).to_string());

    let api_key_secret_key = format!("provider.{provider}.api_key");
    let api_key = settings::read_secret_value(workspace_root, &api_key_secret_key)?
        .unwrap_or_default()
        .trim()
        .to_string();

    if api_key.is_empty() {
        return Ok(ConnectivityTestResult {
            success: false,
            latency_ms: 0,
            error_message: Some(format!(
                "No API key configured for provider '{provider}'."
            )),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let start = Instant::now();

    let result = match provider.as_str() {
        "anthropic" => {
            test_anthropic_connectivity(&client, &base_url, &api_key, &model).await
        }
        "gemini" => {
            test_gemini_connectivity(&client, &base_url, &api_key, &model).await
        }
        _ => {
            test_openai_connectivity(&client, &base_url, &api_key, &model).await
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(()) => Ok(ConnectivityTestResult {
            success: true,
            latency_ms,
            error_message: None,
        }),
        Err(error) => Ok(ConnectivityTestResult {
            success: false,
            latency_ms,
            error_message: Some(error),
        }),
    }
}

async fn test_openai_connectivity(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<(), String> {
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let response = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
        }))
        .send()
        .await
        .map_err(|error| format!("connection failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".into());
        return Err(format!("provider returned {status}: {body}"));
    }

    Ok(())
}

async fn test_anthropic_connectivity(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<(), String> {
    let endpoint = format!("{}/v1/messages", base_url.trim_end_matches('/'));
    let response = client
        .post(&endpoint)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
        }))
        .send()
        .await
        .map_err(|error| format!("connection failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".into());
        return Err(format!("provider returned {status}: {body}"));
    }

    Ok(())
}

async fn test_gemini_connectivity(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
) -> Result<(), String> {
    let endpoint = format!(
        "{}/models/{}:generateContent?key={}",
        base_url.trim_end_matches('/'),
        model,
        api_key
    );
    let response = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&json!({
            "contents": [{"parts": [{"text": "hi"}]}],
            "generationConfig": {"maxOutputTokens": 1},
        }))
        .send()
        .await
        .map_err(|error| format!("connection failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".into());
        return Err(format!("provider returned {status}: {body}"));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Test Exa Connectivity
// ---------------------------------------------------------------------------

pub async fn test_exa_connectivity(
    workspace_root: &std::path::Path,
) -> Result<ConnectivityTestResult, String> {
    let settings_document = settings::load_or_initialize_settings(workspace_root)?;
    let exa_base_url = settings_document.ai.exa_pool_base_url.trim().to_string();
    let exa_base_url = if exa_base_url.is_empty() {
        "https://api.exa.ai".to_string()
    } else {
        exa_base_url
    };

    let api_key_secret_key = "provider.exa_pool.api_key";
    let api_key = settings::read_secret_value(workspace_root, api_key_secret_key)?
        .unwrap_or_default()
        .trim()
        .to_string();

    if api_key.is_empty() {
        return Ok(ConnectivityTestResult {
            success: false,
            latency_ms: 0,
            error_message: Some("No API key configured for Exa.".into()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let endpoint = format!("{}/search", exa_base_url.trim_end_matches('/'));
    let start = Instant::now();

    let response = client
        .post(&endpoint)
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "query": "test",
            "numResults": 1,
        }))
        .send()
        .await
        .map_err(|error| format!("connection failed: {error}"))?;

    let latency_ms = start.elapsed().as_millis() as u64;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".into());
        return Ok(ConnectivityTestResult {
            success: false,
            latency_ms,
            error_message: Some(format!("Exa returned {status}: {body}")),
        });
    }

    Ok(ConnectivityTestResult {
        success: true,
        latency_ms,
        error_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_openai_delta_text, extract_sse_data_payload, SseEventBuffer};

    #[test]
    fn sse_buffer_handles_split_boundaries() {
        let mut buffer = SseEventBuffer::default();
        let first = buffer.push(b"data: {\"choices\":[{\"delta\":{\"content\":\"Hel");
        assert!(first.is_empty());

        let second = buffer.push(b"lo\"}}]}\n\ndata: [DONE]\n\n");
        assert_eq!(second.len(), 2);
        assert_eq!(
            extract_sse_data_payload(&second[0]).as_deref(),
            Some("{\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}")
        );
        assert_eq!(
            extract_sse_data_payload(&second[1]).as_deref(),
            Some("[DONE]")
        );
    }

    #[test]
    fn extracts_openai_delta_text_from_chunk() {
        let payload = "{\"choices\":[{\"delta\":{\"content\":\"stream token\"}}]}";
        assert_eq!(
            extract_openai_delta_text(payload).as_deref(),
            Some("stream token")
        );
    }

    #[test]
    fn extracts_openai_delta_text_from_content_array() {
        let payload =
            "{\"choices\":[{\"delta\":{\"content\":[{\"type\":\"output_text_delta\",\"text\":\"stream \"},{\"type\":\"output_text_delta\",\"text\":\"token\"}]}}]}";
        assert_eq!(
            extract_openai_delta_text(payload).as_deref(),
            Some("stream token")
        );
    }
}

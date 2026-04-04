use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::BTreeMap,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

use crate::{settings, storage};

pub const AI_STREAM_EVENT_NAME: &str = "desktop://ai-stream";
const DEFAULT_EXA_BASE_URL: &str = "https://api.exa.ai";
const MAX_FETCHED_WEBPAGE_CHARS: usize = 8_000;
const MAX_FETCHED_WEBPAGE_COUNT: usize = 3;
const MAX_SEARCH_RESULTS: usize = 5;
const MAX_SEARCH_SNIPPET_CHARS: usize = 2_000;
const MAX_TOOL_ROUNDS: usize = 6;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAiPromptStreamInput {
    pub provider: String,
    pub prompt: String,
    pub document_id: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub request_id: Option<String>,
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(default)]
    pub conversation: Vec<DesktopAiConversationMessage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DesktopAiConversationRole {
    User,
    Assistant,
}

impl DesktopAiConversationRole {
    fn as_str(&self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiConversationMessage {
    pub role: DesktopAiConversationRole,
    pub content: String,
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
    Tool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DesktopAiToolCallState {
    InputStreaming,
    OutputAvailable,
    OutputError,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAiToolCallPayload {
    pub tool_call_id: String,
    pub tool_name: String,
    pub state: DesktopAiToolCallState,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub error_text: Option<String>,
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
    pub tool_call: Option<DesktopAiToolCallPayload>,
}

#[derive(Debug, Clone)]
struct ResolvedProviderConfig {
    provider: String,
    base_url: String,
    model: String,
    api_key: String,
}

#[derive(Debug, Clone)]
struct ResolvedExaConfig {
    base_url: String,
    api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSectionToolInput {
    section_id: String,
    title: Option<String>,
    content: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateResumeMetadataToolInput {
    title: Option<String>,
    template: Option<String>,
    language: Option<String>,
    target_job_title: Option<String>,
    target_company: Option<String>,
}

#[derive(Debug, Clone)]
struct OpenAiToolCallDelta {
    index: usize,
    id: Option<String>,
    name: Option<String>,
    arguments_fragment: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct StreamingToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

#[derive(Debug, Clone)]
struct CompletedToolCall {
    id: String,
    name: String,
    arguments: serde_json::Value,
}

struct OpenAiRoundOutcome {
    assistant_text: String,
    tool_calls: Vec<CompletedToolCall>,
}

struct ExaToolRunOutcome {
    prompt_context: Option<String>,
    tool_output: serde_json::Value,
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
    let workspace_root = workspace_root.to_path_buf();
    let system_prompt = input
        .system_prompt
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let images = input
        .images
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let document_id = input
        .document_id
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let conversation = input
        .conversation
        .iter()
        .filter_map(|message| {
            let content = message.content.trim();
            if content.is_empty() {
                return None;
            }

            Some(DesktopAiConversationMessage {
                role: message.role.clone(),
                content: content.to_string(),
            })
        })
        .collect::<Vec<_>>();
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
                    &workspace_root,
                    &request_id,
                    &prompt,
                    system_prompt.as_deref(),
                    document_id.as_deref(),
                    &conversation,
                    &images,
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
                    tool_call: None,
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
    workspace_root: &std::path::Path,
    request_id: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    document_id: Option<&str>,
    conversation: &[DesktopAiConversationMessage],
    images: &[String],
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
            tool_call: None,
        },
    )?;

    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let mut messages = Vec::new();
    let tools = build_resume_tools(document_id);
    if let Some(system_prompt) = system_prompt.filter(|value| !value.trim().is_empty()) {
        messages.push(json!({
            "role": "system",
            "content": system_prompt,
        }));
    }
    push_conversation_messages(&mut messages, conversation);
    let prompt_with_web_context = enrich_prompt_with_exa_context(
        app,
        request_id,
        config,
        started_at_epoch_ms,
        &client,
        workspace_root,
        prompt,
    )
    .await;
    let user_content = if images.is_empty() {
        json!(prompt_with_web_context)
    } else {
        let mut content_parts = Vec::with_capacity(images.len() + 1);
        for image_url in images {
            content_parts.push(json!({
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                },
            }));
        }
        content_parts.push(json!({
            "type": "text",
            "text": prompt_with_web_context,
        }));
        json!(content_parts)
    };
    messages.push(json!({
        "role": "user",
        "content": user_content,
    }));

    let mut accumulated_text = String::new();
    let mut chunk_index = 0u32;
    let mut tool_rounds = 0usize;

    loop {
        let round_outcome = stream_openai_round(
            app,
            &client,
            &endpoint,
            request_id,
            config,
            started_at_epoch_ms,
            &messages,
            tools.as_ref(),
            &mut accumulated_text,
            &mut chunk_index,
        )
        .await?;

        if round_outcome.tool_calls.is_empty() {
            break;
        }

        tool_rounds += 1;
        if tool_rounds > MAX_TOOL_ROUNDS {
            return Err(format!(
                "resume tool execution exceeded the desktop safety limit of {MAX_TOOL_ROUNDS} rounds"
            ));
        }

        let assistant_text = round_outcome.assistant_text.trim().to_string();
        let has_assistant_text = !assistant_text.is_empty();

        let tool_calls_payload = round_outcome
            .tool_calls
            .iter()
            .map(|tool_call| {
                json!({
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_call.name,
                        "arguments": tool_call.arguments.to_string(),
                    }
                })
            })
            .collect::<Vec<_>>();

        let mut assistant_message = json!({
            "role": "assistant",
            "content": if has_assistant_text {
                json!(assistant_text)
            } else {
                serde_json::Value::Null
            },
            "tool_calls": tool_calls_payload,
        });
        if !has_assistant_text {
            assistant_message["content"] = serde_json::Value::Null;
        }
        messages.push(assistant_message);

        let Some(active_document_id) = document_id else {
            return Err("resume-editing tools require a documentId in the desktop runtime".into());
        };

        for tool_call in round_outcome.tool_calls {
            emit_tool_call_event(
                app,
                request_id,
                config,
                started_at_epoch_ms,
                DesktopAiToolCallPayload {
                    tool_call_id: tool_call.id.clone(),
                    tool_name: tool_call.name.clone(),
                    state: DesktopAiToolCallState::InputStreaming,
                    input: Some(tool_call.arguments.clone()),
                    output: None,
                    error_text: None,
                },
            );

            match execute_resume_tool(app, active_document_id, &tool_call) {
                Ok(result) => {
                    emit_tool_call_event(
                        app,
                        request_id,
                        config,
                        started_at_epoch_ms,
                        DesktopAiToolCallPayload {
                            tool_call_id: tool_call.id.clone(),
                            tool_name: tool_call.name.clone(),
                            state: DesktopAiToolCallState::OutputAvailable,
                            input: Some(tool_call.arguments.clone()),
                            output: Some(result.clone()),
                            error_text: None,
                        },
                    );

                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result.to_string(),
                    }));
                }
                Err(error) => {
                    emit_tool_call_event(
                        app,
                        request_id,
                        config,
                        started_at_epoch_ms,
                        DesktopAiToolCallPayload {
                            tool_call_id: tool_call.id.clone(),
                            tool_name: tool_call.name.clone(),
                            state: DesktopAiToolCallState::OutputError,
                            input: Some(tool_call.arguments.clone()),
                            output: None,
                            error_text: Some(error.clone()),
                        },
                    );

                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json!({
                            "success": false,
                            "error": error,
                        }).to_string(),
                    }));
                }
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
            tool_call: None,
        },
    )?;

    Ok(())
}

async fn stream_openai_round(
    app: &AppHandle,
    client: &reqwest::Client,
    endpoint: &str,
    request_id: &str,
    config: &ResolvedProviderConfig,
    started_at_epoch_ms: u64,
    messages: &[serde_json::Value],
    tools: Option<&serde_json::Value>,
    accumulated_text: &mut String,
    chunk_index: &mut u32,
) -> Result<OpenAiRoundOutcome, String> {
    let mut payload = json!({
        "model": config.model,
        "stream": true,
        "messages": messages,
    });

    if let Some(tools) = tools {
        payload["tools"] = tools.clone();
    }

    let response = client
        .post(endpoint)
        .bearer_auth(&config.api_key)
        .header("Content-Type", "application/json")
        .json(&payload)
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
    let mut round_text = String::new();
    let mut response_stream = response.bytes_stream();
    let mut tool_calls = BTreeMap::<usize, StreamingToolCall>::new();

    while let Some(chunk_result) = response_stream.next().await {
        let chunk =
            chunk_result.map_err(|error| format!("failed to read stream chunk: {error}"))?;
        for event_payload in event_buffer.push(chunk.as_ref()) {
            let Some(data_payload) = extract_sse_data_payload(&event_payload) else {
                continue;
            };

            if data_payload == "[DONE]" {
                return Ok(OpenAiRoundOutcome {
                    assistant_text: round_text,
                    tool_calls: finalize_tool_calls(tool_calls)?,
                });
            }

            if let Some(delta_text) = extract_openai_delta_text(&data_payload) {
                if !delta_text.is_empty() {
                    *chunk_index += 1;
                    round_text.push_str(&delta_text);
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
                            chunk_index: Some(*chunk_index),
                            delta_text: Some(delta_text),
                            accumulated_text: Some(accumulated_text.clone()),
                            error_message: None,
                            tool_call: None,
                        },
                    )?;
                }
            }

            for tool_call_delta in extract_openai_tool_call_deltas(&data_payload) {
                merge_tool_call_delta(&mut tool_calls, tool_call_delta);
            }
        }
    }

    Ok(OpenAiRoundOutcome {
        assistant_text: round_text,
        tool_calls: finalize_tool_calls(tool_calls)?,
    })
}

fn build_resume_tools(document_id: Option<&str>) -> Option<serde_json::Value> {
    let document_id = document_id?.trim();
    if document_id.is_empty() {
        return None;
    }

    Some(json!([
        {
            "type": "function",
            "function": {
                "name": "updateSection",
                "description": "Update one existing resume section. Use the exact sectionId from the resume context. Always send the full updated content object for that section and preserve untouched fields and existing item IDs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sectionId": {
                            "type": "string",
                            "description": "The exact sectionId to update."
                        },
                        "title": {
                            "type": "string",
                            "description": "Optional new section title."
                        },
                        "content": {
                            "type": "object",
                            "description": "The full updated section content object."
                        }
                    },
                    "required": ["sectionId", "content"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "updateResumeMetadata",
                "description": "Update top-level resume metadata such as title, language, template, target job title, or target company.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "template": { "type": "string" },
                        "language": { "type": "string" },
                        "targetJobTitle": { "type": "string" },
                        "targetCompany": { "type": "string" }
                    },
                    "additionalProperties": false
                }
            }
        }
    ]))
}

fn extract_openai_tool_call_deltas(payload: &str) -> Vec<OpenAiToolCallDelta> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return Vec::new();
    };

    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("tool_calls"))
        .and_then(|tool_calls| tool_calls.as_array())
        .map(|tool_calls| {
            tool_calls
                .iter()
                .filter_map(|tool_call| {
                    let index = tool_call.get("index")?.as_u64()? as usize;
                    let id = tool_call
                        .get("id")
                        .and_then(|value| value.as_str())
                        .map(ToString::to_string);
                    let name = tool_call
                        .get("function")
                        .and_then(|function| function.get("name"))
                        .and_then(|value| value.as_str())
                        .map(ToString::to_string);
                    let arguments_fragment = tool_call
                        .get("function")
                        .and_then(|function| function.get("arguments"))
                        .and_then(|value| value.as_str())
                        .map(ToString::to_string);

                    Some(OpenAiToolCallDelta {
                        index,
                        id,
                        name,
                        arguments_fragment,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn merge_tool_call_delta(
    tool_calls: &mut BTreeMap<usize, StreamingToolCall>,
    delta: OpenAiToolCallDelta,
) {
    let entry = tool_calls.entry(delta.index).or_default();
    if let Some(id) = delta.id {
        entry.id = Some(id);
    }
    if let Some(name) = delta.name {
        entry.name = Some(name);
    }
    if let Some(arguments_fragment) = delta.arguments_fragment {
        entry.arguments.push_str(&arguments_fragment);
    }
}

fn finalize_tool_calls(
    tool_calls: BTreeMap<usize, StreamingToolCall>,
) -> Result<Vec<CompletedToolCall>, String> {
    tool_calls
        .into_values()
        .map(|tool_call| {
            let id = tool_call
                .id
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let name = tool_call
                .name
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "tool call was missing a function name".to_string())?;
            let arguments = if tool_call.arguments.trim().is_empty() {
                json!({})
            } else {
                serde_json::from_str::<serde_json::Value>(&tool_call.arguments)
                    .map_err(|error| format!("failed to parse tool arguments for {name}: {error}"))?
            };

            Ok(CompletedToolCall {
                id,
                name,
                arguments,
            })
        })
        .collect()
}

fn execute_resume_tool(
    app: &AppHandle,
    document_id: &str,
    tool_call: &CompletedToolCall,
) -> Result<serde_json::Value, String> {
    match tool_call.name.as_str() {
        "updateSection" => {
            let input: UpdateSectionToolInput = serde_json::from_value(tool_call.arguments.clone())
                .map_err(|error| format!("invalid arguments for updateSection: {error}"))?;
            execute_update_section_tool(app, document_id, input)
        }
        "updateResumeMetadata" => {
            let input: UpdateResumeMetadataToolInput =
                serde_json::from_value(tool_call.arguments.clone()).map_err(|error| {
                    format!("invalid arguments for updateResumeMetadata: {error}")
                })?;
            execute_update_resume_metadata_tool(app, document_id, input)
        }
        other => Err(format!("unsupported desktop resume tool: {other}")),
    }
}

fn execute_update_section_tool(
    app: &AppHandle,
    document_id: &str,
    input: UpdateSectionToolInput,
) -> Result<serde_json::Value, String> {
    if !input.content.is_object() {
        return Err("updateSection.content must be a JSON object".into());
    }

    let document = storage::get_document(app, document_id)?
        .ok_or_else(|| format!("document not found for tool execution: {document_id}"))?;
    let mut save_input = to_save_document_input(&document);
    let target_section = save_input
        .sections
        .iter_mut()
        .find(|section| section.id == input.section_id)
        .ok_or_else(|| format!("section not found: {}", input.section_id))?;

    target_section.content = input.content;
    target_section.updated_at_epoch_ms = None;

    if let Some(title) = input
        .title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        target_section.title = title;
    }

    let updated = storage::save_document(app, save_input)?;
    let updated_section = updated
        .sections
        .iter()
        .find(|section| section.id == input.section_id)
        .ok_or_else(|| format!("updated section not found after save: {}", input.section_id))?;

    Ok(json!({
        "success": true,
        "documentId": updated.id,
        "sectionId": updated_section.id,
        "sectionType": updated_section.section_type,
        "title": updated_section.title,
    }))
}

fn execute_update_resume_metadata_tool(
    app: &AppHandle,
    document_id: &str,
    input: UpdateResumeMetadataToolInput,
) -> Result<serde_json::Value, String> {
    if input.title.is_none()
        && input.template.is_none()
        && input.language.is_none()
        && input.target_job_title.is_none()
        && input.target_company.is_none()
    {
        return Err("updateResumeMetadata requires at least one field to update".into());
    }

    let updated = storage::update_document(
        app,
        storage::UpdateDocumentInput {
            id: document_id.to_string(),
            title: input.title,
            template: input.template,
            language: input.language,
            theme_json: None,
            target_job_title: input.target_job_title,
            target_company: input.target_company,
        },
    )?;

    Ok(json!({
        "success": true,
        "documentId": updated.id,
        "title": updated.title,
        "template": updated.template,
        "language": updated.language,
        "targetJobTitle": updated.target_job_title,
        "targetCompany": updated.target_company,
    }))
}

fn to_save_document_input(document: &storage::DocumentDetail) -> storage::SaveDocumentInput {
    storage::SaveDocumentInput {
        id: document.id.clone(),
        title: document.title.clone(),
        template: document.template.clone(),
        language: document.language.clone(),
        theme_json: document.theme_json.clone(),
        target_job_title: document.target_job_title.clone(),
        target_company: document.target_company.clone(),
        sections: document
            .sections
            .iter()
            .map(|section| storage::SaveDocumentSectionInput {
                id: section.id.clone(),
                document_id: section.document_id.clone(),
                section_type: section.section_type.clone(),
                title: section.title.clone(),
                sort_order: section.sort_order,
                visible: section.visible,
                content: parse_json_object_or_default(&section.content_json),
                created_at_epoch_ms: Some(section.created_at_epoch_ms),
                updated_at_epoch_ms: Some(section.updated_at_epoch_ms),
            })
            .collect(),
    }
}

fn parse_json_object_or_default(raw: &str) -> serde_json::Value {
    match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(value) if value.is_object() => value,
        Ok(_) | Err(_) => json!({}),
    }
}

fn push_conversation_messages(
    messages: &mut Vec<serde_json::Value>,
    conversation: &[DesktopAiConversationMessage],
) {
    for message in conversation {
        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        messages.push(json!({
            "role": message.role.as_str(),
            "content": content,
        }));
    }
}

async fn enrich_prompt_with_exa_context(
    app: &AppHandle,
    request_id: &str,
    config: &ResolvedProviderConfig,
    started_at_epoch_ms: u64,
    client: &reqwest::Client,
    workspace_root: &std::path::Path,
    prompt: &str,
) -> String {
    let prompt_without_resume_context = prompt
        .split("\n\nResume context:\n")
        .next()
        .unwrap_or(prompt);
    let urls = extract_urls(prompt_without_resume_context);

    let Some(exa_config) = resolve_exa_config(workspace_root).ok().flatten() else {
        return prompt.to_string();
    };

    if !urls.is_empty() {
        let tool_call_id = format!("{request_id}-fetch-web-page");
        let tool_input = json!({
            "urls": urls,
            "text": true,
        });
        emit_tool_call_event(
            app,
            request_id,
            config,
            started_at_epoch_ms,
            DesktopAiToolCallPayload {
                tool_call_id: tool_call_id.clone(),
                tool_name: "fetchWebPage".into(),
                state: DesktopAiToolCallState::InputStreaming,
                input: Some(tool_input.clone()),
                output: None,
                error_text: None,
            },
        );

        return match fetch_webpage_context(client, &exa_config, &urls).await {
            Ok(outcome) => {
                emit_tool_call_event(
                    app,
                    request_id,
                    config,
                    started_at_epoch_ms,
                    DesktopAiToolCallPayload {
                        tool_call_id,
                        tool_name: "fetchWebPage".into(),
                        state: DesktopAiToolCallState::OutputAvailable,
                        input: Some(tool_input),
                        output: Some(outcome.tool_output.clone()),
                        error_text: None,
                    },
                );

                if let Some(web_context) = outcome.prompt_context {
                    format!(
                        "{prompt}\n\nFetched webpage context via Exa:\n{web_context}\n\nUse the fetched page content above to answer the user's request. Cite the relevant URLs you relied on. Do not claim that you cannot access the provided link when webpage context is included."
                    )
                } else {
                    prompt.to_string()
                }
            }
            Err(error) => {
                emit_tool_call_event(
                    app,
                    request_id,
                    config,
                    started_at_epoch_ms,
                    DesktopAiToolCallPayload {
                        tool_call_id,
                        tool_name: "fetchWebPage".into(),
                        state: DesktopAiToolCallState::OutputError,
                        input: Some(tool_input),
                        output: None,
                        error_text: Some(error.clone()),
                    },
                );
                eprintln!("Failed to fetch webpage context through Exa: {error}");
                prompt.to_string()
            }
        };
    }

    if !should_search_web(prompt_without_resume_context) {
        return prompt.to_string();
    }

    let tool_call_id = format!("{request_id}-search-web");
    let tool_input = json!({
        "query": prompt_without_resume_context.trim(),
        "numResults": MAX_SEARCH_RESULTS,
        "searchType": "auto",
        "includeText": true,
    });
    emit_tool_call_event(
        app,
        request_id,
        config,
        started_at_epoch_ms,
        DesktopAiToolCallPayload {
            tool_call_id: tool_call_id.clone(),
            tool_name: "searchWeb".into(),
            state: DesktopAiToolCallState::InputStreaming,
            input: Some(tool_input.clone()),
            output: None,
            error_text: None,
        },
    );

    match search_web_context(client, &exa_config, prompt_without_resume_context.trim()).await {
        Ok(outcome) => {
            emit_tool_call_event(
                app,
                request_id,
                config,
                started_at_epoch_ms,
                DesktopAiToolCallPayload {
                    tool_call_id,
                    tool_name: "searchWeb".into(),
                    state: DesktopAiToolCallState::OutputAvailable,
                    input: Some(tool_input),
                    output: Some(outcome.tool_output.clone()),
                    error_text: None,
                },
            );

            if let Some(search_context) = outcome.prompt_context {
                format!(
                    "{prompt}\n\nSearch results via Exa:\n{search_context}\n\nUse the search results above to answer the user's request. Cite the relevant URLs you relied on. Do not say you cannot browse when search results are included."
                )
            } else {
                prompt.to_string()
            }
        }
        Err(error) => {
            emit_tool_call_event(
                app,
                request_id,
                config,
                started_at_epoch_ms,
                DesktopAiToolCallPayload {
                    tool_call_id,
                    tool_name: "searchWeb".into(),
                    state: DesktopAiToolCallState::OutputError,
                    input: Some(tool_input),
                    output: None,
                    error_text: Some(error.clone()),
                },
            );
            eprintln!("Failed to search web context through Exa: {error}");
            prompt.to_string()
        }
    }
}

fn resolve_exa_config(
    workspace_root: &std::path::Path,
) -> Result<Option<ResolvedExaConfig>, String> {
    let settings_document = settings::load_or_initialize_settings(workspace_root)?;
    let base_url = settings_document.ai.exa_pool_base_url.trim().to_string();
    let base_url = if base_url.is_empty() {
        DEFAULT_EXA_BASE_URL.to_string()
    } else {
        base_url
    };

    let api_key = settings::read_secret_value(workspace_root, "provider.exa_pool.api_key")?
        .unwrap_or_default()
        .trim()
        .to_string();

    if api_key.is_empty() {
        return Ok(None);
    }

    Ok(Some(ResolvedExaConfig { base_url, api_key }))
}

fn extract_urls(text: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut cursor = 0usize;

    while cursor < text.len() {
        let remaining = &text[cursor..];
        let Some(relative_start) = find_url_start(remaining) else {
            break;
        };

        let start = cursor + relative_start;
        let candidate = extract_url_candidate(&text[start..]);
        if candidate.is_empty() {
            cursor = start.saturating_add("https://".len());
            continue;
        }

        if !urls.iter().any(|existing| existing == &candidate) {
            urls.push(candidate);
            if urls.len() >= MAX_FETCHED_WEBPAGE_COUNT {
                break;
            }
        }

        cursor = start.saturating_add(1);
    }

    urls
}

fn find_url_start(text: &str) -> Option<usize> {
    let http = text.find("http://");
    let https = text.find("https://");

    match (http, https) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn extract_url_candidate(text: &str) -> String {
    let mut end = 0usize;

    for (index, character) in text.char_indices() {
      if index > 0 && is_url_terminator(character) {
            break;
        }
        end = index + character.len_utf8();
    }

    if end == 0 {
        return String::new();
    }

    trim_url_token(&text[..end])
}

fn is_url_terminator(character: char) -> bool {
    character.is_whitespace()
        || matches!(
            character,
            '"' | '\''
                | ','
                | ';'
                | '<'
                | '>'
                | '['
                | ']'
                | '{'
                | '}'
                | '|'
                | '\\'
                | '^'
                | '`'
                | '，'
                | '。'
                | '；'
                | '：'
                | '！'
                | '？'
                | '（'
                | '）'
                | '【'
                | '】'
                | '《'
                | '》'
                | '、'
        )
        || (!character.is_ascii() && !matches!(character, '%' | '#' | '&' | '=' | '-' | '_' | '/' | ':' | '.' | '?' | '~' | '+'))
}

fn trim_url_token(token: &str) -> String {
    token
        .trim()
        .trim_matches(|character: char| {
            matches!(
                character,
                '"' | '\'' | ',' | '.' | ';' | ':' | '!' | '?' | ')' | ']' | '}' | '>' | '，'
                    | '。' | '；' | '：' | '！' | '？' | '）' | '】' | '》' | '、'
            )
        })
        .to_string()
}

fn should_search_web(text: &str) -> bool {
    let normalized = text.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }

    const SEARCH_CUES: [&str; 22] = [
        "搜索",
        "搜一下",
        "帮我搜",
        "查一下",
        "帮我查",
        "查询",
        "检索",
        "找一下",
        "帮我找",
        "最新",
        "最近",
        "官网",
        "文档",
        "教程",
        "search",
        "look up",
        "find ",
        "latest",
        "recent",
        "documentation",
        "docs",
        "tutorial",
    ];

    SEARCH_CUES.iter().any(|cue| normalized.contains(cue))
}

async fn fetch_webpage_context(
    client: &reqwest::Client,
    config: &ResolvedExaConfig,
    urls: &[String],
) -> Result<ExaToolRunOutcome, String> {
    let endpoint = format!("{}/contents", config.base_url.trim_end_matches('/'));
    let response = client
        .post(&endpoint)
        .bearer_auth(&config.api_key)
        .header("Content-Type", "application/json")
        .header("User-Agent", "rolerover-desktop/1.0")
        .json(&json!({
            "urls": urls,
            "text": true,
        }))
        .send()
        .await
        .map_err(|error| format!("failed to call {endpoint}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read Exa error body".into());
        return Err(format!("Exa returned {status}: {body}"));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse Exa response: {error}"))?;
    let results = body
        .get("results")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let pages = results
        .iter()
        .filter_map(|item| {
            let url = item.get("url")?.as_str()?.trim();
            if url.is_empty() {
                return None;
            }

            let title = item
                .get("title")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Untitled");
            let excerpt = item
                .get("text")
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value, MAX_FETCHED_WEBPAGE_CHARS))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "No page text returned.".into());

            Some(json!({
                "url": url,
                "title": title,
                "text": excerpt,
            }))
        })
        .collect::<Vec<_>>();

    let prompt_context = if pages.is_empty() {
        None
    } else {
        Some(
            pages
                .iter()
                .filter_map(|page| {
                    let url = page.get("url")?.as_str()?;
                    let title = page.get("title")?.as_str()?;
                    let excerpt = page.get("text")?.as_str()?;
                    Some(format!(
                        "URL: {url}\nTitle: {title}\nContent excerpt:\n{excerpt}"
                    ))
                })
                .collect::<Vec<_>>()
                .join("\n\n---\n\n"),
        )
    };

    Ok(ExaToolRunOutcome {
        prompt_context,
        tool_output: json!({
            "success": true,
            "resultCount": pages.len(),
            "pages": pages,
        }),
    })
}

async fn search_web_context(
    client: &reqwest::Client,
    config: &ResolvedExaConfig,
    query: &str,
) -> Result<ExaToolRunOutcome, String> {
    if query.is_empty() {
        return Ok(ExaToolRunOutcome {
            prompt_context: None,
            tool_output: json!({
                "success": true,
                "query": query,
                "searchType": "auto",
                "resultCount": 0,
                "results": [],
            }),
        });
    }

    let endpoint = format!("{}/search", config.base_url.trim_end_matches('/'));
    let response = client
        .post(&endpoint)
        .bearer_auth(&config.api_key)
        .header("Content-Type", "application/json")
        .header("User-Agent", "rolerover-desktop/1.0")
        .json(&json!({
            "query": query,
            "numResults": MAX_SEARCH_RESULTS,
            "type": "auto",
            "contents": {
                "text": true,
            },
        }))
        .send()
        .await
        .map_err(|error| format!("failed to call {endpoint}: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read Exa error body".into());
        return Err(format!("Exa returned {status}: {body}"));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse Exa response: {error}"))?;
    let results = body
        .get("results")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let search_results = results
        .iter()
        .take(MAX_SEARCH_RESULTS)
        .filter_map(|item| {
            let url = item.get("url")?.as_str()?.trim();
            if url.is_empty() {
                return None;
            }

            let title = item
                .get("title")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Untitled");
            let published_date = item
                .get("publishedDate")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let excerpt = item
                .get("text")
                .and_then(|value| value.as_str())
                .map(|value| truncate_text(value, MAX_SEARCH_SNIPPET_CHARS))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "No summary returned.".into());

            let mut lines = vec![format!("URL: {url}"), format!("Title: {title}")];
            if let Some(published_date) = published_date {
                lines.push(format!("Published: {published_date}"));
            }
            lines.push(format!("Snippet:\n{excerpt}"));

            Some(json!({
                "url": url,
                "title": title,
                "publishedDate": published_date,
                "text": excerpt,
                "display": lines.join("\n"),
            }))
        })
        .collect::<Vec<_>>();

    let prompt_context = if search_results.is_empty() {
        None
    } else {
        Some(
            search_results
                .iter()
                .filter_map(|result| {
                    result
                        .get("display")
                        .and_then(|value| value.as_str())
                        .map(ToString::to_string)
                })
                .collect::<Vec<_>>()
                .join("\n\n---\n\n"),
        )
    };

    let results_for_output = search_results
        .iter()
        .map(|result| {
            json!({
                "url": result.get("url").cloned().unwrap_or(serde_json::Value::Null),
                "title": result.get("title").cloned().unwrap_or(serde_json::Value::Null),
                "publishedDate": result
                    .get("publishedDate")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null),
                "text": result.get("text").cloned().unwrap_or(serde_json::Value::Null),
            })
        })
        .collect::<Vec<_>>();

    Ok(ExaToolRunOutcome {
        prompt_context,
        tool_output: json!({
            "success": true,
            "query": query,
            "searchType": "auto",
            "resultCount": results_for_output.len(),
            "results": results_for_output,
        }),
    })
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let truncated = trimmed.chars().take(max_chars).collect::<String>();
    format!("{truncated}...")
}

fn emit_stream_event(app: &AppHandle, payload: DesktopAiStreamEvent) -> Result<(), String> {
    app.emit(AI_STREAM_EVENT_NAME, payload)
        .map_err(|error| format!("failed to emit AI stream event: {error}"))
}

fn emit_tool_call_event(
    app: &AppHandle,
    request_id: &str,
    config: &ResolvedProviderConfig,
    started_at_epoch_ms: u64,
    tool_call: DesktopAiToolCallPayload,
) {
    let _ = emit_stream_event(
        app,
        DesktopAiStreamEvent {
            request_id: request_id.to_string(),
            provider: config.provider.clone(),
            model: config.model.clone(),
            kind: DesktopAiStreamEventKind::Tool,
            started_at_epoch_ms,
            emitted_at_epoch_ms: now_epoch_ms().unwrap_or(started_at_epoch_ms),
            finished_at_epoch_ms: None,
            chunk_index: None,
            delta_text: None,
            accumulated_text: None,
            error_message: None,
            tool_call: Some(tool_call),
        },
    );
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
    let Some(exa_config) = resolve_exa_config(workspace_root)? else {
        return Ok(ConnectivityTestResult {
            success: false,
            latency_ms: 0,
            error_message: Some("No API key configured for Exa.".into()),
        });
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let endpoint = format!("{}/search", exa_config.base_url.trim_end_matches('/'));
    let start = Instant::now();

    let response = client
        .post(&endpoint)
        .bearer_auth(&exa_config.api_key)
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
    use super::{
        extract_openai_delta_text, extract_openai_tool_call_deltas, extract_sse_data_payload,
        extract_url_candidate, extract_urls, finalize_tool_calls, merge_tool_call_delta,
        push_conversation_messages, should_search_web, trim_url_token,
        DesktopAiConversationMessage, DesktopAiConversationRole, StreamingToolCall,
        SseEventBuffer,
    };
    use std::collections::BTreeMap;
    use serde_json::json;

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

    #[test]
    fn extracts_urls_from_prompt_text() {
        let urls = extract_urls(
            "帮我看看这个链接 https://docs.bigmodel.cn/cn/coding-plan/overview ，再参考 https://example.com/test?x=1).",
        );
        assert_eq!(
            urls,
            vec![
                "https://docs.bigmodel.cn/cn/coding-plan/overview".to_string(),
                "https://example.com/test?x=1".to_string()
            ]
        );
    }

    #[test]
    fn trims_trailing_punctuation_from_urls() {
        assert_eq!(
            trim_url_token("https://example.com/path?x=1)."),
            "https://example.com/path?x=1"
        );
    }

    #[test]
    fn extracts_url_without_following_instruction_text() {
        assert_eq!(
            extract_url_candidate("https://docs.bigmodel.cn/cn/coding-plan/overview;读一下这个"),
            "https://docs.bigmodel.cn/cn/coding-plan/overview"
        );
    }

    #[test]
    fn extracts_url_without_ascii_suffix_after_semicolon() {
        assert_eq!(
            extract_url_candidate("https://docs.bigmodel.cn/cn/coding-plan/overview;read-this"),
            "https://docs.bigmodel.cn/cn/coding-plan/overview"
        );
    }

    #[test]
    fn extracts_url_without_following_clause_after_comma() {
        assert_eq!(
            extract_url_candidate("https://docs.bigmodel.cn/cn/coding-plan/overview,看看这个"),
            "https://docs.bigmodel.cn/cn/coding-plan/overview"
        );
    }

    #[test]
    fn detects_search_intent_from_prompt_text() {
        assert!(should_search_web("帮我搜索 MiniMax M2 最新能力"));
        assert!(should_search_web("look up the latest tauri updater docs"));
    }

    #[test]
    fn ignores_normal_resume_edit_prompts() {
        assert!(!should_search_web("帮我优化这段工作经历，写得更量化一些"));
        assert!(!should_search_web("rewrite this summary to sound stronger"));
    }

    #[test]
    fn conversation_history_keeps_roles_and_skips_blank_messages() {
        let mut messages = Vec::new();
        push_conversation_messages(
            &mut messages,
            &[
                DesktopAiConversationMessage {
                    role: DesktopAiConversationRole::User,
                    content: "上一句用户提问".into(),
                },
                DesktopAiConversationMessage {
                    role: DesktopAiConversationRole::Assistant,
                    content: "  回复内容  ".into(),
                },
                DesktopAiConversationMessage {
                    role: DesktopAiConversationRole::Assistant,
                    content: "   ".into(),
                },
            ],
        );

        assert_eq!(
            messages,
            vec![
                json!({
                    "role": "user",
                    "content": "上一句用户提问",
                }),
                json!({
                    "role": "assistant",
                    "content": "回复内容",
                }),
            ]
        );
    }

    #[test]
    fn extracts_openai_tool_call_deltas_from_stream_chunk() {
        let payload = r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"updateSection","arguments":"{\"sectionId\":\"sec_1\""}}]}}]}"#;
        let deltas = extract_openai_tool_call_deltas(payload);

        assert_eq!(deltas.len(), 1);
        assert_eq!(deltas[0].index, 0);
        assert_eq!(deltas[0].id.as_deref(), Some("call_123"));
        assert_eq!(deltas[0].name.as_deref(), Some("updateSection"));
        assert_eq!(
            deltas[0].arguments_fragment.as_deref(),
            Some("{\"sectionId\":\"sec_1\"")
        );
    }

    #[test]
    fn finalizes_streamed_tool_call_arguments() {
        let mut tool_calls = BTreeMap::<usize, StreamingToolCall>::new();
        for payload in [
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"updateSection","arguments":"{\"sectionId\":\"sec_1\","}}]}}]}"#,
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"content\":{\"text\":\"updated\"}}"}}]}}]}"#,
        ] {
            for delta in extract_openai_tool_call_deltas(payload) {
                merge_tool_call_delta(&mut tool_calls, delta);
            }
        }

        let finalized = finalize_tool_calls(tool_calls).expect("tool calls should parse");
        assert_eq!(finalized.len(), 1);
        assert_eq!(finalized[0].id, "call_123");
        assert_eq!(finalized[0].name, "updateSection");
        assert_eq!(
            finalized[0].arguments,
            json!({
                "sectionId": "sec_1",
                "content": { "text": "updated" },
            })
        );
    }
}

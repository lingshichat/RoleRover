import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export function extractAIConfig(request: NextRequest): AIConfig {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const baseURL = request.headers.get('x-base-url') || 'https://api.openai.com/v1';
  const model = request.headers.get('x-model') || 'gpt-4o';
  return { provider, apiKey, baseURL, model };
}

function isOpenAICompatibleProviderError(payload: unknown): payload is {
  choices: null;
  base_resp?: { status_code?: number; status_msg?: string };
} {
  if (!payload || typeof payload !== 'object') return false;

  const record = payload as Record<string, unknown>;
  return record.object === 'chat.completion' && record.choices === null && typeof record.base_resp === 'object';
}

async function openAICompatibleFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.ok) {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (!isOpenAICompatibleProviderError(payload)) {
    return response;
  }

  const statusCode = payload.base_resp?.status_code;
  const statusMessage = payload.base_resp?.status_msg || 'The upstream OpenAI-compatible provider returned an invalid completion payload.';
  const translatedStatus = statusCode === 2062 ? 429 : 502;

  return new Response(
    JSON.stringify({
      error: {
        message: statusMessage,
        type: 'provider_error',
        code: statusCode ? String(statusCode) : 'invalid_chat_completion_payload',
      },
    }),
    {
      status: translatedStatus,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

export function getModel(config: AIConfig, modelOverride?: string) {
  if (!config.apiKey) {
    throw new AIConfigError('API key is required. Please configure it in Settings.');
  }
  const modelId = modelOverride || config.model;

  switch (config.provider) {
    case 'anthropic': {
      const p = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    case 'gemini': {
      const p = createGoogleGenerativeAI({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    default: {
      const p = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: openAICompatibleFetch,
      });
      return p.chat(modelId);
    }
  }
}

/**
 * Returns providerOptions for JSON mode — only applicable to OpenAI-compatible providers.
 */
export function getJsonProviderOptions(config: AIConfig) {
  if (config.provider === 'openai') {
    return { openai: { response_format: { type: 'json_object' as const } } };
  }
  return {} as Record<string, never>;
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}

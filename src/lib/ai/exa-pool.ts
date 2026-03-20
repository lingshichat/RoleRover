import { z } from 'zod/v4';

const DEFAULT_MCP_HOST = '127.0.0.1';
const DEFAULT_MCP_PORT = 3334;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SEARCH_RESULTS = 5;
const DEFAULT_FETCH_MAX_CHARS = 8_000;
const DEFAULT_SEARCH_TEXT_MAX_CHARS = 2_000;

export const searchWebInputSchema = z.object({
  query: z.string().min(1).max(500).describe('The web search query'),
  numResults: z.number().int().min(1).max(8).default(DEFAULT_SEARCH_RESULTS).describe('How many results to return'),
  searchType: z.enum(['auto', 'neural', 'fast', 'deep']).default('auto').describe('Which Exa search strategy to use'),
  includeText: z.boolean().default(true).describe('Whether to include page text snippets in the results'),
});

const webSearchItemSchema = z.object({
  title: z.string().default('Untitled'),
  url: z.string(),
  publishedDate: z.string().optional(),
  author: z.string().optional(),
  score: z.number().optional(),
  text: z.string().optional(),
});

export const searchWebOutputSchema = z.object({
  success: z.boolean(),
  query: z.string(),
  searchType: z.enum(['auto', 'neural', 'fast', 'deep']),
  resultCount: z.number().int().nonnegative(),
  results: z.array(webSearchItemSchema),
});

export const fetchWebPageInputSchema = z.object({
  url: z.string().url().describe('The webpage URL to retrieve'),
  includeHtml: z.boolean().default(false).describe('Whether to include raw HTML in the result'),
  maxCharacters: z.number().int().min(500).max(20_000).default(DEFAULT_FETCH_MAX_CHARS).describe('Maximum characters of text content to keep'),
});

export const fetchWebPageOutputSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  resultCount: z.number().int().nonnegative(),
  pages: z.array(z.object({
    url: z.string(),
    title: z.string().default('Untitled'),
    author: z.string().optional(),
    publishedDate: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
  })),
});

export type SearchWebInput = z.infer<typeof searchWebInputSchema>;
export type SearchWebOutput = z.infer<typeof searchWebOutputSchema>;
export type FetchWebPageInput = z.infer<typeof fetchWebPageInputSchema>;
export type FetchWebPageOutput = z.infer<typeof fetchWebPageOutputSchema>;

interface ExaPoolConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ExaPoolHeaderConfig {
  apiKey?: string;
  baseUrl?: string;
}

function truncateText(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}...`;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeExaPoolConfig(config: ExaPoolHeaderConfig): ExaPoolConfig | null {
  const apiKey = config.apiKey?.trim();
  const baseUrl = config.baseUrl?.trim();

  if (!apiKey || !baseUrl) return null;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
  };
}

export function getExaPoolConfig(override?: ExaPoolHeaderConfig | null): ExaPoolConfig | null {
  const normalizedOverride = normalizeExaPoolConfig(override ?? {});
  if (normalizedOverride) return normalizedOverride;

  return normalizeExaPoolConfig({
    apiKey: getOptionalEnv('EXA_POOL_API_KEY'),
    baseUrl: getOptionalEnv('EXA_POOL_BASE_URL'),
  });
}

export function extractExaPoolHeaderConfig(headers: Headers): ExaPoolHeaderConfig | null {
  const apiKey = headers.get('x-exa-pool-api-key')?.trim();
  const baseUrl = headers.get('x-exa-pool-base-url')?.trim();

  if (!apiKey && !baseUrl) return null;

  return {
    apiKey,
    baseUrl,
  };
}

export function isExaPoolConfigured(config?: ExaPoolHeaderConfig | null): boolean {
  return getExaPoolConfig(config) !== null;
}

export function getExaPoolMcpPort(): number {
  const port = Number(process.env.EXA_POOL_MCP_PORT || DEFAULT_MCP_PORT);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_MCP_PORT;
}

export function getExaPoolMcpUrl(): string {
  const explicitUrl = getOptionalEnv('EXA_POOL_MCP_URL');
  if (explicitUrl) return explicitUrl;

  return `http://${DEFAULT_MCP_HOST}:${getExaPoolMcpPort()}/mcp`;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Exa Pool returned invalid JSON (status ${response.status})`);
  }
}

function getErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const message = (data as Record<string, unknown>).error ?? (data as Record<string, unknown>).message;
  return typeof message === 'string' ? message : undefined;
}

async function exaPoolRequest(
  endpoint: string,
  body: Record<string, unknown>,
  configOverride?: ExaPoolHeaderConfig | null,
): Promise<unknown> {
  const config = getExaPoolConfig(configOverride);
  if (!config) {
    throw new Error('Exa Pool is not configured. Fill in the Exa Pool Base URL and API Key in Settings > AI > Web Tools.');
  }

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'jadeai-exa-pool-mcp/1.0',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const message = getErrorMessage(data) ?? response.statusText;
    throw new Error(`Exa Pool request failed (${response.status}): ${message}`);
  }

  return data;
}

function normalizeSearchResult(item: unknown, includeText: boolean): z.infer<typeof webSearchItemSchema> {
  const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled';
  const url = typeof record.url === 'string' ? record.url : '';
  const score = typeof record.score === 'number' ? record.score : undefined;

  return {
    title,
    url,
    publishedDate: typeof record.publishedDate === 'string' ? record.publishedDate : undefined,
    author: typeof record.author === 'string' ? record.author : undefined,
    score,
    text: includeText && typeof record.text === 'string'
      ? truncateText(record.text, DEFAULT_SEARCH_TEXT_MAX_CHARS)
      : undefined,
  };
}

function normalizePage(item: unknown, includeHtml: boolean, maxCharacters: number) {
  const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled';
  const url = typeof record.url === 'string' ? record.url : '';

  return {
    url,
    title,
    author: typeof record.author === 'string' ? record.author : undefined,
    publishedDate: typeof record.publishedDate === 'string' ? record.publishedDate : undefined,
    text: typeof record.text === 'string' ? truncateText(record.text, maxCharacters) : undefined,
    html: includeHtml && typeof record.html === 'string' ? truncateText(record.html, maxCharacters) : undefined,
  };
}

function getResultList(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];

  const results = (data as Record<string, unknown>).results;
  return Array.isArray(results) ? results : [];
}

export async function searchExaPool(input: SearchWebInput, configOverride?: ExaPoolHeaderConfig | null): Promise<SearchWebOutput> {
  const payload: Record<string, unknown> = {
    query: input.query.trim(),
    numResults: input.numResults,
    type: input.searchType,
  };

  if (input.includeText) {
    payload.contents = { text: true };
  }

  const data = await exaPoolRequest('/search', payload, configOverride);
  const results = getResultList(data).map((item: unknown) => normalizeSearchResult(item, input.includeText));

  return {
    success: true,
    query: input.query.trim(),
    searchType: input.searchType,
    resultCount: results.length,
    results,
  };
}

export async function fetchExaPoolWebPage(input: FetchWebPageInput, configOverride?: ExaPoolHeaderConfig | null): Promise<FetchWebPageOutput> {
  const payload: Record<string, unknown> = {
    urls: [input.url],
    text: true,
  };

  if (input.includeHtml) {
    payload.htmlContent = true;
  }

  const data = await exaPoolRequest('/contents', payload, configOverride);
  const pages = getResultList(data).map((item: unknown) => normalizePage(item, input.includeHtml, input.maxCharacters));

  return {
    success: true,
    url: input.url,
    resultCount: pages.length,
    pages,
  };
}

# AI Web Tools Contract

> Purpose: Define the executable cross-layer contract for JadeAI local web tools powered by the local MCP sidecar.

## Scope

This contract covers the local-development-only flow added for AI chat web access:

1. Browser settings panel stores Exa Pool config locally
2. Browser sends Exa Pool config to `/api/ai/chat` in request headers
3. Chat route creates MCP client tools against the local sidecar
4. Local MCP sidecar forwards requests to Exa Pool
5. Tool results are returned to the model and surfaced in chat UI

## Files

- `src/components/settings/settings-dialog.tsx`
- `src/stores/settings-store.ts`
- `src/app/api/ai/chat/route.ts`
- `src/lib/ai/provider.ts`
- `src/lib/ai/exa-pool.ts`
- `src/lib/ai/mcp/client.ts`
- `src/lib/ai/mcp/exa-pool-server.ts`
- `src/lib/ai/prompts.ts`

## Local Commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:mcp
pnpm type-check
```

## Browser Storage Contract

Settings are stored in browser `localStorage`, not server DB:

- AI model key: `jade_api_key`
- Provider config cache: `jade_provider_configs`
- Exa Pool config: `jade_exa_pool_config`

`jade_exa_pool_config` shape:

```json
{
  "baseURL": "https://your-openai-compatible-proxy.example/v1",
  "apiKey": "your-exa-pool-key"
}
```

## Request Header Contract

The browser sends these headers on AI requests:

- `x-provider`
- `x-api-key`
- `x-base-url`
- `x-model`
- `x-exa-pool-base-url`
- `x-exa-pool-api-key`

Header sources:

- `getAIHeaders()` in `src/stores/settings-store.ts`
- `DefaultChatTransport` in `src/hooks/use-ai-chat.ts`

## Chat Route Contract

Endpoint:

- `POST /api/ai/chat`

Input body fields:

- `messages`
- `resumeId`
- `model`
- `sessionId`

Chat route behavior:

1. Resolve user from fingerprint
2. Load resume context
3. Persist the incoming user message
4. Extract model config from request headers
5. Extract Exa Pool config from request headers
6. Build resume mutation tools
7. Build local MCP web tools if Exa Pool config is present
8. Merge both tool sets into `streamText(...)`
9. Persist assistant ordered parts on finish

Important runtime note:

- `src/app/api/ai/chat/route.ts` exports `runtime = 'nodejs'`
- MCP client creation depends on Node runtime

## MCP Client Contract

Client creation happens in `src/lib/ai/mcp/client.ts`.

Transport:

```ts
{
  type: 'http',
  url: 'http://127.0.0.1:3334/mcp',
  headers: {
    'x-exa-pool-base-url': '...',
    'x-exa-pool-api-key': '...'
  }
}
```

Enabled tools:

- `searchWeb`
- `fetchWebPage`

Input/output schemas come from:

- `searchWebInputSchema`
- `searchWebOutputSchema`
- `fetchWebPageInputSchema`
- `fetchWebPageOutputSchema`

## Local MCP Sidecar Contract

Entry:

- `src/lib/ai/mcp/exa-pool-server.ts`

Default endpoint:

- `http://127.0.0.1:3334/mcp`

Health endpoint:

- `GET /health`

Health response:

```json
{
  "ok": true,
  "configured": false,
  "server": "jadeai-exa-pool-mcp",
  "version": "0.1.0"
}
```

Important note:

- `configured` only reflects env-based fallback config
- per-request browser headers can still make tool calls succeed even when `/health` says `configured: false`

## Exa Pool Request Contract

Search request:

- path: `/search`
- method: `POST`

Search payload:

```json
{
  "query": "latest resume ATS tips",
  "numResults": 5,
  "type": "auto",
  "contents": { "text": true }
}
```

Contents request:

- path: `/contents`
- method: `POST`

Contents payload:

```json
{
  "urls": ["https://example.com"],
  "text": true,
  "htmlContent": false
}
```

## Validation Rules

`searchWeb` input:

- `query`: 1..500 chars
- `numResults`: 1..8
- `searchType`: `auto | neural | fast | deep`
- `includeText`: boolean

`fetchWebPage` input:

- `url`: valid URL
- `includeHtml`: boolean
- `maxCharacters`: 500..20000

Normalization rules:

- search text snippets are truncated
- fetched page text/html are truncated
- empty or missing Exa Pool config disables web tools
- malformed nested list payloads like `{ items: { items: [...] } }` are flattened before resume updates

## Error Matrix

| Boundary | Condition | Expected Behavior |
|---|---|---|
| Browser -> Chat API | no AI API key | local inline assistant warning (`__API_KEY_MISSING__`) |
| Browser -> Chat API | no Exa Pool config | web tools are omitted; chat still works |
| Chat API -> MCP | MCP init fails | log server error, continue with resume tools only |
| MCP -> Exa Pool | timeout | return explicit tool error |
| MCP -> Exa Pool | invalid JSON | return explicit tool error |
| MCP -> Exa Pool | 401/403/404/429/5xx | return explicit tool error |
| OpenAI-compatible provider | returns `choices: null` with `base_resp` | provider fetch shim converts it into a normal error response |
| Resume editor | malformed list content | component should not crash; list content should be treated defensively |

## Good / Base / Bad Cases

### Good

- User fills Exa Pool Base URL and API key in Settings
- User asks: "帮我访问这个网页：https://example.com"
- Chat route includes `fetchWebPage`
- MCP sidecar calls `/contents`
- Assistant cites the fetched URL in its response

### Base

- User leaves Exa Pool fields empty
- User asks for normal resume rewrite
- Chat route only enables resume tools
- AI chat remains usable

### Bad

- OpenAI-compatible provider returns `200` with `choices: null`
- Frontend must not appear frozen forever
- Server must expose a readable error instead of raw type validation noise

## Required Manual Checks

1. Start local services with `pnpm dev`
2. Confirm settings panel shows `Web Tools`
3. Fill Exa Pool Base URL and API key in browser
4. Send a normal resume-only prompt
5. Send a URL-fetch prompt
6. Send a search prompt
7. Refresh the page and verify local browser config persists
8. Confirm edited resume data survives reload

## Required Assertion Points

- `/api/ai/chat` receives `x-exa-pool-base-url` and `x-exa-pool-api-key`
- local MCP sidecar is listening on `127.0.0.1:3334`
- successful web tool calls are persisted in assistant `orderedParts`
- malformed provider payloads do not surface as raw schema validation failures to the user

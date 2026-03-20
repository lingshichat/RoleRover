import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod/v4';
import { extractExaPoolHeaderConfig, fetchExaPoolWebPage, fetchWebPageInputSchema, fetchWebPageOutputSchema, getExaPoolConfig, getExaPoolMcpPort, searchExaPool, searchWebInputSchema, searchWebOutputSchema, type ExaPoolHeaderConfig } from '../exa-pool';

const SERVER_NAME = 'jadeai-exa-pool-mcp';
const SERVER_VERSION = '0.1.0';

function loadLocalEnvFiles() {
  const envFiles = ['.env.local', '.env'];

  for (const fileName of envFiles) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

loadLocalEnvFiles();

function buildSearchSummary(result: z.infer<typeof searchWebOutputSchema>): string {
  if (result.results.length === 0) {
    return `No search results found for "${result.query}".`;
  }

  const lines = result.results.map((item, index) => {
    const parts = [
      `${index + 1}. ${item.title}`,
      item.url,
      item.text ? `Snippet: ${item.text}` : undefined,
    ].filter(Boolean);

    return parts.join('\n');
  });

  return [`Found ${result.resultCount} result(s) for "${result.query}":`, ...lines].join('\n\n');
}

function buildFetchSummary(result: z.infer<typeof fetchWebPageOutputSchema>): string {
  if (result.pages.length === 0) {
    return `No webpage content was returned for ${result.url}.`;
  }

  const lines = result.pages.map((page, index) => {
    const parts = [
      `${index + 1}. ${page.title}`,
      page.url,
      page.text ? `Content: ${page.text}` : undefined,
    ].filter(Boolean);

    return parts.join('\n');
  });

  return [`Fetched ${result.resultCount} page(s) for ${result.url}:`, ...lines].join('\n\n');
}

function createServerInstance(config: ExaPoolHeaderConfig | null): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    'searchWeb',
    {
      title: 'Search The Web',
      description: 'Search the public web through Exa Pool when the user asks you to look something up.',
      inputSchema: searchWebInputSchema,
      outputSchema: searchWebOutputSchema,
    },
    async (input) => {
      const result = await searchExaPool(input, config);

      return {
        content: [{ type: 'text', text: buildSearchSummary(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    'fetchWebPage',
    {
      title: 'Fetch Webpage Content',
      description: 'Retrieve the contents of a specific public URL through Exa Pool when the user gives you a webpage to inspect.',
      inputSchema: fetchWebPageInputSchema,
      outputSchema: fetchWebPageOutputSchema,
    },
    async (input) => {
      const result = await fetchExaPoolWebPage(input, config);

      return {
        content: [{ type: 'text', text: buildFetchSummary(result) }],
        structuredContent: result,
      };
    },
  );

  return server;
}

function writeJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;

  return JSON.parse(raw);
}

async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const headerEntries = Object.entries(req.headers)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const headerConfig = extractExaPoolHeaderConfig(new Headers(headerEntries));
  const server = createServerInstance(headerConfig);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close().catch((error) => {
      console.error('Failed to close MCP transport:', error);
    });
    server.close().catch((error) => {
      console.error('Failed to close MCP server:', error);
    });
  });

  try {
    const body = req.method === 'POST' ? await readRequestBody(req) : undefined;
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error('Exa Pool MCP request failed:', error);

    if (!res.headersSent) {
      writeJson(res, 500, {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal MCP server error',
        },
        id: null,
      });
    }
  }
}

const port = getExaPoolMcpPort();
const config = getExaPoolConfig();

const httpServer = http.createServer(async (req, res) => {
  if (!req.url) {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/health') {
    writeJson(res, 200, {
      ok: true,
      configured: Boolean(config),
      server: SERVER_NAME,
      version: SERVER_VERSION,
    });
    return;
  }

  if (url.pathname !== '/mcp') {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'POST') {
    writeJson(res, 405, {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
    return;
  }

  await handleMcpRequest(req, res);
});

httpServer.on('error', (error) => {
  console.error('Exa Pool MCP server failed to start:', error);
  process.exit(1);
});

httpServer.listen(port, '127.0.0.1', () => {
  if (!config) {
    console.warn('Exa Pool MCP server started without EXA_POOL_BASE_URL or EXA_POOL_API_KEY. Web tools will stay unavailable until local env is configured.');
  }

  console.log(`Exa Pool MCP server listening on http://127.0.0.1:${port}/mcp`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    httpServer.close((error) => {
      if (error) {
        console.error('Failed to stop Exa Pool MCP server cleanly:', error);
        process.exit(1);
      }
      process.exit(0);
    });
  });
}

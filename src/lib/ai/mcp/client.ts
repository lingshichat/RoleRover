import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { fetchWebPageInputSchema, fetchWebPageOutputSchema, getExaPoolMcpUrl, isExaPoolConfigured, type ExaPoolHeaderConfig, searchWebInputSchema, searchWebOutputSchema } from '../exa-pool';

export async function createExaPoolMcpClient(config?: ExaPoolHeaderConfig | null): Promise<MCPClient | null> {
  if (!isExaPoolConfigured(config)) {
    return null;
  }

  return createMCPClient({
    transport: {
      type: 'http',
      url: getExaPoolMcpUrl(),
      headers: {
        ...(config?.baseUrl ? { 'x-exa-pool-base-url': config.baseUrl } : {}),
        ...(config?.apiKey ? { 'x-exa-pool-api-key': config.apiKey } : {}),
      },
    },
    onUncaughtError: (error) => {
      console.error('Exa Pool MCP client uncaught error:', error);
    },
  });
}

export async function getExaPoolMcpTools(config?: ExaPoolHeaderConfig | null) {
  const mcpClient = await createExaPoolMcpClient(config);
  if (!mcpClient) {
    return { hasWebTools: false, mcpClient: null, tools: {} };
  }

  const tools = await mcpClient.tools({
    schemas: {
      searchWeb: {
        inputSchema: searchWebInputSchema,
        outputSchema: searchWebOutputSchema,
      },
      fetchWebPage: {
        inputSchema: fetchWebPageInputSchema,
        outputSchema: fetchWebPageOutputSchema,
      },
    },
  });

  return { hasWebTools: true, mcpClient, tools };
}

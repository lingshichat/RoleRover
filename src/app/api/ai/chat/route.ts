import { NextRequest } from 'next/server';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { getModel, extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { chatRepository } from '@/lib/db/repositories/chat.repository';
import { getSystemPrompt } from '@/lib/ai/prompts';
import { createExecutableTools } from '@/lib/ai/tools';
import { getExaPoolMcpTools } from '@/lib/ai/mcp/client';
import { extractExaPoolHeaderConfig } from '@/lib/ai/exa-pool';

const MAX_ROUNDS = 10;
const MAX_MESSAGES = MAX_ROUNDS * 2; // 10 rounds = 20 messages (user + assistant)

export const runtime = 'nodejs';

interface OrderedToolCall {
  toolName?: string;
  input?: unknown;
}

interface OrderedToolResult {
  output?: unknown;
}

export async function POST(request: NextRequest) {
  let mcpClient: Awaited<ReturnType<typeof getExaPoolMcpTools>>['mcpClient'] = null;

  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages, resumeId, model: modelId, sessionId } = await request.json();

    let resumeContext = '';
    if (resumeId) {
      const resume = await resumeRepository.findById(resumeId);
      if (resume) {
        resumeContext = JSON.stringify(resume.sections);
      }
    }

    // Save user message to DB before streaming
    if (sessionId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        const textPart = lastMessage.parts?.find((p: { type: string }) => p.type === 'text');
        const content = textPart?.text || lastMessage.content || '';
        if (content) {
          // First user message in this session → set as session title
          const userMessages = messages.filter((m: { role: string }) => m.role === 'user');
          if (userMessages.length === 1) {
            const title = content.slice(0, 50);
            await chatRepository.updateSessionTitle(sessionId, title);
          }

          await chatRepository.addMessage({
            sessionId,
            role: 'user',
            content,
          });
        }
      }
    }

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig, modelId);
    const modelMessages = await convertToModelMessages(messages);

    // Truncate to last N rounds for LLM context
    const truncatedMessages = modelMessages.slice(-MAX_MESSAGES);
    const exaPoolConfig = extractExaPoolHeaderConfig(request.headers);

    const resumeTools = resumeId ? createExecutableTools(resumeId, aiConfig) : {};
    let webTools: Record<string, unknown> = {};
    let hasWebTools = false;

    try {
      const mcpResult = await getExaPoolMcpTools(exaPoolConfig);
      mcpClient = mcpResult.mcpClient;
      webTools = mcpResult.tools;
      hasWebTools = mcpResult.hasWebTools;
    } catch (error) {
      console.error('Failed to initialize Exa Pool MCP tools:', error);
    }

    const allTools = { ...resumeTools, ...webTools };
    const tools = Object.keys(allTools).length > 0 ? allTools : undefined;

    const result = streamText({
      model,
      system: getSystemPrompt(resumeContext, { hasWebTools }),
      messages: truncatedMessages,
      tools,
      stopWhen: tools ? stepCountIs(25) : undefined,
      onFinish: async ({ text, steps }) => {
        await mcpClient?.close();

        if (!sessionId) return;

        // Build ordered parts array preserving the interleaving of text and tool calls
        const orderedParts: ({ type: 'text'; text: string } | { type: 'tool'; toolName: string; args: unknown; result: unknown })[] = [];

        for (const step of steps) {
          if (step.text) {
            orderedParts.push({ type: 'text', text: step.text });
          }
          const tcs = (step.toolCalls ?? []) as OrderedToolCall[];
          const trs = (step.toolResults ?? []) as OrderedToolResult[];
          for (let i = 0; i < tcs.length; i++) {
            orderedParts.push({
              type: 'tool' as const,
              toolName: tcs[i]?.toolName ?? 'unknown',
              args: tcs[i]?.input,
              result: trs[i]?.output,
            });
          }
        }

        const fullText = text || '';
        if (fullText || orderedParts.some((p) => p.type === 'tool')) {
          await chatRepository.addMessage({
            sessionId,
            role: 'assistant',
            content: fullText,
            metadata: orderedParts.length > 0 ? { orderedParts } : {},
          });
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    await mcpClient?.close().catch((closeError) => {
      console.error('Failed to close Exa Pool MCP client after chat error:', closeError);
    });

    if (error instanceof AIConfigError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 401 });
    }
    console.error('POST /api/ai/chat error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

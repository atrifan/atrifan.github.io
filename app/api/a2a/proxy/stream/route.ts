/**
 * POST /api/a2a/proxy/stream
 *
 * Streaming A2A proxy endpoint using Server-Sent Events (SSE).
 * Checks agent card capabilities and uses streaming if supported.
 * Handles ReasoningEvent messages with special metadata.
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { ClientFactory, ClientFactoryOptions, CallInterceptor, BeforeArgs } from '@a2a-js/sdk/client';
import type { MessageSendParams, AgentCard } from '@a2a-js/sdk';
import { getValidOAuthToken } from '@/src/lib/oauth-token-manager';
import { supabase } from '@/src/lib/supabase';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Custom interceptor to inject authentication headers
 */
class AuthInterceptor implements CallInterceptor {
  constructor(private headers: Record<string, string>) {}

  async before(args: BeforeArgs): Promise<void> {
    const currentOptions = args.options || {};
    args.options = {
      ...currentOptions,
      serviceParameters: {
        ...(currentOptions.serviceParameters || {}),
        ...this.headers,
      },
    };
  }

  async after(): Promise<void> {}
}

/**
 * RAG context data for A2A messages
 */
interface RAGContextItem {
  source: string; // Knowledge base name
  title: string;
  content: string;
  score?: number;
}

/**
 * History correlation data for A2A messages
 */
interface HistoryMatchItem {
  conversationId: string;
  summary: string;
  relevance?: number;
}

/**
 * Persona prompt data for A2A messages
 */
interface PersonaItem {
  name: string;
  prompt: string;
}

/**
 * Recent message for immediate context (last 2-4 exchanges)
 */
interface RecentMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface A2AStreamRequest {
  agentUrl: string;
  agentId?: string;
  query: string; // User's query/message
  recentHistory?: RecentMessage[]; // Last 2-4 exchanges for immediate context
  ragData?: RAGContextItem[];
  historyData?: HistoryMatchItem[]; // Semantic history matches (older relevant context)
  personaPrompts?: PersonaItem[];
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  contextId?: string;
}

/**
 * SSE event types for streaming
 */
interface SSEEvent {
  type: 'reasoning' | 'content' | 'status' | 'error' | 'done';
  data: unknown;
}

/**
 * Extract reasoning event data from A2A message parts
 */
function extractReasoningEvent(part: { kind?: string; data?: unknown; metadata?: unknown }): {
  isReasoning: boolean;
  reasoningType?: 'thinking' | 'action';
  title?: string;
  text?: string;
} | null {
  if (part.kind !== 'data') return null;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = part.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = part.metadata as any;
  
  // Check if this is a ReasoningEvent based on metadata.name or data.type
  const isReasoningEvent = 
    metadata?.name === 'ReasoningEvent' || 
    data?.type === 'reasoning';
  
  if (!isReasoningEvent) return null;
  
  const defaultData = data?.default || data;
  const reasoningType = defaultData?.reasoningType || defaultData?.reasoning_type;
  
  return {
    isReasoning: true,
    reasoningType: reasoningType === 'action' ? 'action' : 'thinking',
    title: defaultData?.title || metadata?.title || 'Reasoning',
    text: defaultData?.text || '',
  };
}

/**
 * Send SSE event to client
 */
function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a TransformStream for SSE
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Helper to send SSE events
  const sendEvent = async (event: SSEEvent) => {
    await writer.write(encoder.encode(formatSSE(event)));
  };
  
  // Start processing in background
  (async () => {
    try {
      const { userId } = await auth();

      if (!userId) {
        await sendEvent({ type: 'error', data: { error: 'Unauthorized' } });
        await writer.close();
        return;
      }

      const body: A2AStreamRequest = await request.json();
      const { agentUrl, agentId, query, recentHistory, ragData, historyData, personaPrompts, authType, authConfig, headers: customHeaders, contextId } = body;

      if (!agentUrl) {
        await sendEvent({ type: 'error', data: { error: 'agentUrl is required' } });
        await writer.close();
        return;
      }

      if (!query) {
        await sendEvent({ type: 'error', data: { error: 'query is required' } });
        await writer.close();
        return;
      }

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json',
        'Connection': 'close',
        'User-Agent': 'ZipRunPlace-A2A-Client/1.0',
      };

      if (customHeaders) {
        for (const [key, value] of Object.entries(customHeaders)) {
          headers[key] = value;
        }
      }

      // Handle OAuth authentication (same as non-streaming endpoint)
      if (authType === 'oauth2' && agentId) {
        const authResult = await handleOAuth(userId, agentId, headers);
        if (!authResult.success) {
          await sendEvent({ type: 'error', data: authResult.error });
          await writer.close();
          return;
        }
      } else if (authType === 'bearer' && authConfig?.token) {
        headers['Authorization'] = `Bearer ${authConfig.token}`;
      } else if (authType === 'api_key' && authConfig?.key) {
        headers[authConfig.headerName || 'X-API-Key'] = authConfig.key;
      } else if (authType === 'basic' && authConfig?.username && authConfig?.password) {
        const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      // Build A2A message parts array
      // Each context piece becomes a separate TextPart for better structure
      const messageParts: Array<{ kind: 'text'; text: string }> = [];

      // Add persona prompt parts first (system-level instructions)
      if (personaPrompts && personaPrompts.length > 0) {
        for (const persona of personaPrompts) {
          messageParts.push({
            kind: 'text',
            text: `[Persona: ${persona.name}]\n${persona.prompt}`,
          });
        }
      }

      // Add RAG context parts (knowledge base context)
      if (ragData && ragData.length > 0) {
        for (const rag of ragData) {
          const scoreInfo = rag.score ? ` (relevance: ${(rag.score * 100).toFixed(0)}%)` : '';
          messageParts.push({
            kind: 'text',
            text: `[RAG: ${rag.source}] ${rag.title}${scoreInfo}\n${rag.content}`,
          });
        }
      }

      // Add semantic history matches (older relevant context from past conversations)
      if (historyData && historyData.length > 0) {
        for (const history of historyData) {
          const relevanceInfo = history.relevance ? ` (relevance: ${(history.relevance * 100).toFixed(0)}%)` : '';
          messageParts.push({
            kind: 'text',
            text: `[Semantic History Match]${relevanceInfo}\n${history.summary}`,
          });
        }
      }

      // Add recent conversation history (last 2-4 exchanges for immediate context)
      if (recentHistory && recentHistory.length > 0) {
        const recentExchanges = recentHistory
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');
        messageParts.push({
          kind: 'text',
          text: `[Recent Conversation]\n${recentExchanges}`,
        });
      }

      // Add the user's current query as the last part
      messageParts.push({
        kind: 'text',
        text: query,
      });

      // Create A2A client
      const interceptors = Object.keys(headers).length > 0 ? [new AuthInterceptor(headers)] : [];
      const factory = new ClientFactory(
        ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
          clientConfig: { interceptors },
        })
      );

      let client;
      let agentCard: AgentCard;
      try {
        // Try to get stored agent card from database first (avoids re-fetching from URL)
        let storedAgentCard: AgentCard | null = null;
        if (agentId) {
          // First try connector lookup
          const { data: connector } = await db
            .from('chat_connectors')
            .select('a2a_agent_id')
            .eq('id', agentId)
            .eq('user_id', userId)
            .single();

          const actualAgentId = connector?.a2a_agent_id || agentId;

          // Get agent card from a2a_agents table
          const { data: agent } = await db
            .from('a2a_agents')
            .select('agent_card, agent_url')
            .eq('id', actualAgentId)
            .eq('user_id', userId)
            .single();

          if (agent?.agent_card) {
            storedAgentCard = agent.agent_card as AgentCard;
            // Ensure the agent card has the URL set
            if (!storedAgentCard.url && agent.agent_url) {
              storedAgentCard.url = agent.agent_url;
            }
            console.log('[A2A Stream] Using stored agent card from database');
          }
        }

        if (storedAgentCard) {
          // Use stored agent card - no network fetch needed
          client = await factory.createFromAgentCard(storedAgentCard);
          agentCard = storedAgentCard;
        } else {
          // Fall back to fetching from URL (for agents without stored card)
          console.log('[A2A Stream] No stored agent card, fetching from URL');
          client = await factory.createFromUrl(agentUrl);
          agentCard = await client.getAgentCard();
        }
      } catch (err) {
        await sendEvent({ type: 'error', data: { error: err instanceof Error ? err.message : 'Failed to connect' } });
        await writer.close();
        return;
      }

      // Check if agent supports streaming
      const supportsStreaming = agentCard.capabilities?.streaming === true;
      console.log('[A2A Stream] Agent supports streaming:', supportsStreaming);

      // Build message params with structured parts
      const messageId = uuidv4();
      const sendParams: MessageSendParams = {
        message: {
          messageId,
          role: 'user',
          parts: messageParts,
          kind: 'message',
          ...(contextId && { contextId }),
        },
      };

      console.log('[A2A Stream] Sending message with', messageParts.length, 'parts');

      let finalContent = '';
      let responseContextId: string | undefined;
      let taskState: string | undefined;

      if (supportsStreaming) {
        // Use streaming API
        console.log('[A2A Stream] Using streaming mode');
        const streamIterator = client.sendMessageStream(sendParams);

        for await (const event of streamIterator) {
          console.log('[A2A Stream] Event:', event.kind);

          if (event.kind === 'message') {
            responseContextId = event.contextId;
            // Process message parts
            if (event.parts) {
              for (const part of event.parts) {
                // Check for reasoning events
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const reasoning = extractReasoningEvent(part as any);
                if (reasoning?.isReasoning) {
                  await sendEvent({
                    type: 'reasoning',
                    data: {
                      reasoningType: reasoning.reasoningType,
                      title: reasoning.title,
                      text: reasoning.text,
                    },
                  });
                } else if (part.kind === 'text' && 'text' in part) {
                  finalContent += part.text;
                  await sendEvent({ type: 'content', data: { text: part.text, append: true } });
                }
              }
            }
          } else if (event.kind === 'task') {
            responseContextId = event.contextId || event.id;
            taskState = event.status?.state;
            await sendEvent({ type: 'status', data: { taskId: event.id, state: taskState } });
          } else if (event.kind === 'status-update') {
            taskState = event.status?.state;
            await sendEvent({ type: 'status', data: { taskId: event.taskId, state: taskState, final: event.final } });
          } else if (event.kind === 'artifact-update') {
            // Extract content from artifacts
            if (event.artifact?.parts) {
              for (const part of event.artifact.parts) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const reasoning = extractReasoningEvent(part as any);
                if (reasoning?.isReasoning) {
                  await sendEvent({
                    type: 'reasoning',
                    data: {
                      reasoningType: reasoning.reasoningType,
                      title: reasoning.title,
                      text: reasoning.text,
                    },
                  });
                } else if (part.kind === 'text' && 'text' in part) {
                  finalContent += part.text;
                  await sendEvent({ type: 'content', data: { text: part.text, append: true } });
                }
              }
            }
          }
        }
      } else {
        // Fall back to non-streaming
        console.log('[A2A Stream] Using non-streaming mode');
        const result = await client.sendMessage(sendParams, {
          signal: AbortSignal.timeout(180000),
        });

        if (result.kind === 'message') {
          responseContextId = result.contextId;
          if (result.parts) {
            for (const part of result.parts) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const reasoning = extractReasoningEvent(part as any);
              if (reasoning?.isReasoning) {
                await sendEvent({
                  type: 'reasoning',
                  data: {
                    reasoningType: reasoning.reasoningType,
                    title: reasoning.title,
                    text: reasoning.text,
                  },
                });
              } else if (part.kind === 'text' && 'text' in part) {
                finalContent += part.text;
              }
            }
          }
        } else if (result.kind === 'task') {
          responseContextId = result.contextId || result.id;
          taskState = result.status?.state;
          if (result.artifacts) {
            for (const artifact of result.artifacts) {
              if (artifact.parts) {
                for (const part of artifact.parts) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const reasoning = extractReasoningEvent(part as any);
                  if (reasoning?.isReasoning) {
                    await sendEvent({
                      type: 'reasoning',
                      data: {
                        reasoningType: reasoning.reasoningType,
                        title: reasoning.title,
                        text: reasoning.text,
                      },
                    });
                  } else if (part.kind === 'text' && 'text' in part) {
                    finalContent += part.text;
                  }
                }
              }
            }
          }
        }

        // Send final content
        await sendEvent({ type: 'content', data: { text: finalContent, append: false } });
      }

      // Send done event with final data
      // Calculate total input from all message parts
      const totalInputLength = messageParts.reduce((sum, part) => sum + part.text.length, 0);
      const inputTokens = Math.ceil(totalInputLength / 4);
      const outputTokens = Math.ceil(finalContent.length / 4);

      await sendEvent({
        type: 'done',
        data: {
          success: true,
          content: finalContent || 'No response from agent',
          inputTokens,
          outputTokens,
          contextId: responseContextId,
          taskState,
        },
      });

      await writer.close();
    } catch (error) {
      console.error('[A2A Stream] Error:', error);
      await sendEvent({
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'Stream failed' },
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Handle OAuth authentication
 */
async function handleOAuth(
  userId: string,
  agentId: string,
  headers: Record<string, string>
): Promise<{ success: boolean; error?: unknown }> {
  let authConfigData: Record<string, unknown> | null = null;
  let actualAgentId: string | null = null;

  // Get connector to find a2a_agent_id
  const { data: connector } = await db
    .from('chat_connectors')
    .select('a2a_agent_id, external_auth_config')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (connector?.external_auth_config && Object.keys(connector.external_auth_config).length > 0) {
    authConfigData = connector.external_auth_config;
    actualAgentId = connector.a2a_agent_id || agentId;
  } else if (connector?.a2a_agent_id) {
    actualAgentId = connector.a2a_agent_id;
    const { data: agent } = await db
      .from('a2a_agents')
      .select('auth_config')
      .eq('id', connector.a2a_agent_id)
      .eq('user_id', userId)
      .single();
    if (agent?.auth_config) {
      authConfigData = agent.auth_config;
    }
  } else {
    const { data: agent } = await db
      .from('a2a_agents')
      .select('auth_config')
      .eq('id', agentId)
      .eq('user_id', userId)
      .single();
    if (agent?.auth_config) {
      authConfigData = agent.auth_config;
      actualAgentId = agentId;
    }
  }

  if (!authConfigData) {
    return { success: false, error: { needsOAuth: true, oauthServerId: agentId, oauthServerType: 'a2a' } };
  }

  const oauthConfig: OAuth2AuthConfig = {
    authorization_endpoint: (authConfigData.authorization_endpoint as string) || '',
    token_endpoint: (authConfigData.token_endpoint as string) || '',
    scopes: (authConfigData.scopes as string) || 'openid',
    use_dcr: authConfigData.use_dcr === 'true' || authConfigData.use_dcr === true,
    client_id: (authConfigData.client_id as string) || '',
    client_secret: (authConfigData.client_secret as string) || '',
    registration_endpoint: (authConfigData.registration_endpoint as string) || '',
  };

  const tokenAgentId = actualAgentId || agentId;
  const tokenResult = await getValidOAuthToken(userId, { type: 'a2a', id: tokenAgentId }, oauthConfig);

  if (!tokenResult.success || !tokenResult.accessToken) {
    return {
      success: false,
      error: {
        needsOAuth: true,
        oauthServerId: tokenAgentId,
        oauthServerType: 'a2a',
        oauthConfig: {
          authorization_endpoint: oauthConfig.authorization_endpoint,
          token_endpoint: oauthConfig.token_endpoint,
          scopes: oauthConfig.scopes,
          client_id: oauthConfig.client_id,
          use_dcr: oauthConfig.use_dcr,
          registration_endpoint: oauthConfig.registration_endpoint,
        },
      },
    };
  }

  headers['Authorization'] = `Bearer ${tokenResult.accessToken}`;
  return { success: true };
}


/**
 * POST /api/a2a/proxy
 *
 * Proxies A2A requests to external agents to avoid CORS issues.
 * The browser calls this endpoint, which then forwards the request to the external agent.
 *
 * Uses the official @a2a-js/sdk client library for A2A protocol compliance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { ClientFactory, ClientFactoryOptions, CallInterceptor, BeforeArgs } from '@a2a-js/sdk/client';
import type { Message, MessageSendParams } from '@a2a-js/sdk';
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

interface A2AProxyRequest {
  agentUrl: string;
  agentId?: string; // A2A agent ID for OAuth token lookup
  query: string; // User's query/message
  recentHistory?: RecentMessage[]; // Last 2-4 exchanges for immediate context
  ragData?: RAGContextItem[];
  historyData?: HistoryMatchItem[]; // Semantic history matches (older relevant context)
  personaPrompts?: PersonaItem[];
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  contextId?: string; // A2A protocol context ID for conversation continuity
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: A2AProxyRequest = await request.json();
    const { agentUrl, agentId, query, recentHistory, ragData, historyData, personaPrompts, authType, authConfig, headers: customHeaders, contextId } = body;

    if (!agentUrl) {
      return NextResponse.json({ error: 'agentUrl is required' }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    // Build headers for the external request - only Content-Type, no auth for now
    // Explicitly request non-streaming JSON response
    // Note: Some servers (like Adobe) require HTTP/1.1 - we set Connection: close to avoid HTTP/2 issues
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Connection': 'close', // Force connection close to avoid HTTP/2 negotiation issues
      'User-Agent': 'ZipRunPlace-A2A-Client/1.0',
    };

    // Add custom headers if provided
    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        headers[key] = value;
      }
    }

    // Handle authentication
    if (authType === 'oauth2' && agentId) {
      // agentId here is the connector ID - we need to get the a2a_agent_id and its auth_config
      let authConfigData: Record<string, unknown> | null = null;
      let actualAgentId: string | null = null;

      // First, get the connector to find the a2a_agent_id and its external_auth_config
      const { data: connector } = await db
        .from('chat_connectors')
        .select('a2a_agent_id, external_auth_config')
        .eq('id', agentId)
        .eq('user_id', userId)
        .single();

      console.log('[A2A Proxy] Connector lookup result:', connector);

      if (connector?.external_auth_config && Object.keys(connector.external_auth_config).length > 0) {
        // Use connector's auth config if it has one
        authConfigData = connector.external_auth_config;
        actualAgentId = connector.a2a_agent_id || agentId;
        console.log('[A2A Proxy] Using connector auth config');
      } else if (connector?.a2a_agent_id) {
        // Get auth config from the linked a2a_agent
        actualAgentId = connector.a2a_agent_id;
        const { data: agent } = await db
          .from('a2a_agents')
          .select('auth_config')
          .eq('id', connector.a2a_agent_id)
          .eq('user_id', userId)
          .single();

        console.log('[A2A Proxy] Agent lookup result:', agent);

        if (agent?.auth_config) {
          authConfigData = agent.auth_config;
          console.log('[A2A Proxy] Using agent auth config');
        }
      } else {
        // Try direct lookup in a2a_agents (for MCP tool calls where agentId IS the agent ID)
        const { data: agent } = await db
          .from('a2a_agents')
          .select('auth_config')
          .eq('id', agentId)
          .eq('user_id', userId)
          .single();

        if (agent?.auth_config) {
          authConfigData = agent.auth_config;
          actualAgentId = agentId;
          console.log('[A2A Proxy] Using direct agent lookup auth config');
        }
      }

      if (!authConfigData) {
        console.error('[A2A Proxy] Failed to get OAuth config for agent:', agentId);
        return NextResponse.json({
          success: false,
          error: 'OAuth configuration not found',
        }, { status: 400 });
      }

      console.log('[A2A Proxy] Auth config data:', JSON.stringify(authConfigData, null, 2));

      const oauthConfig: OAuth2AuthConfig = {
        authorization_endpoint: (authConfigData.authorization_endpoint as string) || '',
        token_endpoint: (authConfigData.token_endpoint as string) || '',
        scopes: (authConfigData.scopes as string) || 'openid',
        use_dcr: authConfigData.use_dcr === 'true' || authConfigData.use_dcr === true,
        client_id: (authConfigData.client_id as string) || '',
        client_secret: (authConfigData.client_secret as string) || '',
        registration_endpoint: (authConfigData.registration_endpoint as string) || '',
      };

      // Use the actual agent ID for token storage (not the connector ID)
      const tokenAgentId = actualAgentId || agentId;
      console.log('[A2A Proxy] Using tokenAgentId:', tokenAgentId, 'for OAuth token lookup');

      // Get OAuth token from database
      const tokenResult = await getValidOAuthToken(userId, { type: 'a2a', id: tokenAgentId }, oauthConfig);
      if (!tokenResult.success || !tokenResult.accessToken) {
        // Need OAuth authentication - include config so client can show auth modal
        console.log('[A2A Proxy] OAuth token not found, returning needsOAuth with config');
        return NextResponse.json({
          success: false,
          error: tokenResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerId: tokenAgentId, // Use the actual agent ID for token storage
          oauthServerType: 'a2a',
          // Include OAuth config for client to use (without secrets)
          oauthConfig: {
            authorization_endpoint: oauthConfig.authorization_endpoint,
            token_endpoint: oauthConfig.token_endpoint,
            scopes: oauthConfig.scopes,
            client_id: oauthConfig.client_id,
            use_dcr: oauthConfig.use_dcr,
            registration_endpoint: oauthConfig.registration_endpoint,
            // Don't expose client_secret to client - it will be used server-side during token exchange
          },
        });
      }
      // Always use "Bearer" (capitalized) regardless of what's stored in DB
      headers['Authorization'] = `Bearer ${tokenResult.accessToken}`;
    } else if (authType === 'bearer' && authConfig?.token) {
      headers['Authorization'] = `Bearer ${authConfig.token}`;
    } else if (authType === 'api_key' && authConfig?.key) {
      const headerName = authConfig.headerName || 'X-API-Key';
      headers[headerName] = authConfig.key;
    } else if (authType === 'basic' && authConfig?.username && authConfig?.password) {
      const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    console.log('[A2A Proxy] Request headers:', JSON.stringify(headers, null, 2));

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

    // Create A2A client using the SDK
    const interceptors = Object.keys(headers).length > 0 ? [new AuthInterceptor(headers)] : [];
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        clientConfig: { interceptors },
      })
    );

    console.log('[A2A Proxy] Creating A2A client for:', agentUrl);

    let client;
    try {
      // Try to get stored agent card from database first (avoids re-fetching from URL)
      let storedAgentCard = null;
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
          storedAgentCard = agent.agent_card;
          // Ensure the agent card has the URL set
          if (!storedAgentCard.url && agent.agent_url) {
            storedAgentCard.url = agent.agent_url;
          }
          console.log('[A2A Proxy] Using stored agent card from database');
        }
      }

      if (storedAgentCard) {
        // Use stored agent card - no network fetch needed
        client = await factory.createFromAgentCard(storedAgentCard);
      } else {
        // Fall back to fetching from URL (for agents without stored card)
        console.log('[A2A Proxy] No stored agent card, fetching from URL');
        client = await factory.createFromUrl(agentUrl);
      }
    } catch (err) {
      console.error('[A2A Proxy] Failed to create A2A client:', err);
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to connect to agent',
      }, { status: 500 });
    }

    // Build A2A message using SDK types with structured parts
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

    console.log('[A2A Proxy] Sending message with', messageParts.length, 'parts');

    let result: Message | { kind: 'task'; id: string; contextId?: string; status?: { state?: string }; artifacts?: Array<{ parts?: Array<{ kind?: string; text?: string }> }> };
    try {
      result = await client.sendMessage(sendParams, {
        signal: AbortSignal.timeout(180000), // 3 minutes timeout
      });
    } catch (err) {
      console.error('[A2A Proxy] A2A request failed:', err);

      // Check for auth failures
      const errorMessage = err instanceof Error ? err.message : 'Request failed';
      if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Unauthorized')) {
        if (authType === 'oauth2' && agentId) {
          return NextResponse.json({
            success: false,
            error: `Authentication failed: ${errorMessage}`,
            needsOAuth: true,
            oauthServerId: agentId,
            oauthServerType: 'a2a',
          });
        }
      }

      return NextResponse.json({
        success: false,
        error: errorMessage,
      }, { status: 500 });
    }

    console.log('[A2A Proxy] Raw response:', JSON.stringify(result, null, 2));

    // Extract content from response
    let content = '';
    let responseContextId: string | undefined;
    let taskState: string | undefined;

    // Helper to extract text from parts array
    const extractTextFromParts = (parts: Array<{ kind?: string; text?: string }>) => {
      let text = '';
      for (const part of parts) {
        if (part.kind === 'text' && part.text) {
          text += part.text;
        }
      }
      return text;
    };

    if (result.kind === 'message') {
      // Direct message response
      const message = result as Message;
      responseContextId = message.contextId;
      if (message.parts) {
        content = extractTextFromParts(message.parts);
      }
    } else if (result.kind === 'task') {
      // Task response
      const task = result as { kind: 'task'; id: string; contextId?: string; status?: { state?: string }; artifacts?: Array<{ parts?: Array<{ kind?: string; text?: string }> }> };
      responseContextId = task.contextId || task.id;
      taskState = task.status?.state;

      // Extract content from task artifacts
      if (task.artifacts && task.artifacts.length > 0) {
        for (const artifact of task.artifacts) {
          if (artifact.parts) {
            content += extractTextFromParts(artifact.parts);
          }
        }
      }
    }

    console.log('[A2A Proxy] Extracted content:', content || '(empty)');
    console.log('[A2A Proxy] Context ID:', responseContextId, 'State:', taskState);

    // Estimate tokens based on query and context data
    const ragText = ragData ? ragData.map(r => r.content).join(' ') : '';
    const historyText = historyData ? historyData.map(h => h.summary).join(' ') : '';
    const personaText = personaPrompts ? personaPrompts.map(p => p.prompt).join(' ') : '';
    const inputText = ragText + ' ' + historyText + ' ' + personaText + ' ' + query;
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(content.length / 4);

    return NextResponse.json({
      success: true,
      content: content || 'No response from agent',
      inputTokens,
      outputTokens,
      contextId: responseContextId,
      taskState,
    });
  } catch (error) {
    console.error('A2A proxy error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    }, { status: 500 });
  }
}
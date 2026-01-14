/**
 * POST /api/a2a/proxy
 *
 * Proxies A2A requests to external agents to avoid CORS issues.
 * The browser calls this endpoint, which then forwards the request to the external agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as http from 'http';
import { getValidOAuthToken } from '@/src/lib/oauth-token-manager';
import { supabase } from '@/src/lib/supabase';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Make HTTP/1.1 request using native Node.js http/https modules
 * This avoids HTTP/2 protocol issues with some servers (like Adobe)
 */
function makeHttp1Request(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string; timeout: number }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: {
        ...options.headers,
        'Content-Length': Buffer.byteLength(options.body),
      },
      timeout: options.timeout,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') {
            responseHeaders[key] = value;
          } else if (Array.isArray(value)) {
            responseHeaders[key] = value.join(', ');
          }
        }
        resolve({
          status: res.statusCode || 500,
          headers: responseHeaders,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(options.body);
    req.end();
  });
}

interface A2AProxyRequest {
  agentUrl: string;
  agentId?: string; // A2A agent ID for OAuth token lookup
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompts?: string[]; // Personality system prompts
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
    const { agentUrl, agentId, messages, systemPrompts, authType, authConfig, headers: customHeaders, contextId } = body;

    if (!agentUrl) {
      return NextResponse.json({ error: 'agentUrl is required' }, { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'messages are required' }, { status: 400 });
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

    // Build message parts - include system prompts if provided
    const messageParts: Array<{ type: string; text: string }> = [];

    // Add system prompts (personalities) first
    if (systemPrompts && systemPrompts.length > 0) {
      for (const prompt of systemPrompts) {
        messageParts.push({ type: 'text', text: `[System]: ${prompt}` });
      }
    }

    // Add the user message
    messageParts.push({
      type: 'text',
      text: messages[messages.length - 1]?.content || '',
    });

    // A2A protocol request format
    // - id (JSON-RPC id): unique for each request
    // - params.message.messageId: unique UUID for each message
    // - params.message.contextId: reused for conversation continuity
    const jsonRpcId = uuidv4();
    const messageId = uuidv4();
    const requestBody: {
      jsonrpc: string;
      method: string;
      id: string;
      params: {
        message: {
          messageId: string;
          role: string;
          parts: Array<{ type: string; text: string }>;
          contextId?: string;
        };
      };
    } = {
      jsonrpc: '2.0',
      method: 'message/send',
      id: jsonRpcId,
      params: {
        message: {
          messageId,
          role: 'user',
          parts: messageParts,
        },
      },
    };

    // Add contextId if provided for conversation continuity
    if (contextId) {
      requestBody.params.message.contextId = contextId;
    }

    // Log outgoing request
    console.log('[A2A Proxy] Sending request to:', agentUrl);
    console.log('[A2A Proxy] Request body:', JSON.stringify(requestBody, null, 2));

    // Make the request using HTTP/1.1 (native Node.js http/https modules)
    // This avoids HTTP/2 protocol issues with some servers (like Adobe)
    const requestBodyStr = JSON.stringify(requestBody);
    let httpResponse: { status: number; headers: Record<string, string>; body: string };

    try {
      httpResponse = await makeHttp1Request(agentUrl, {
        method: 'POST',
        headers,
        body: requestBodyStr,
        timeout: 180000, // 3 minutes
      });
    } catch (err) {
      console.error('[A2A Proxy] HTTP/1.1 request failed:', err);
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : 'Request failed',
      }, { status: 500 });
    }

    console.log('[A2A Proxy] Response status:', httpResponse.status);

    if (httpResponse.status >= 400) {
      console.error('[A2A Proxy] Error response status:', httpResponse.status);
      console.error('[A2A Proxy] Error response headers:', JSON.stringify(httpResponse.headers, null, 2));
      console.error('[A2A Proxy] Error response body:', httpResponse.body);

      // Try to parse as JSON for more details
      try {
        const errorJson = JSON.parse(httpResponse.body);
        console.error('[A2A Proxy] Error response JSON:', JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, already logged as text
      }

      // Check for auth failures - return needsOAuth if OAuth is configured
      if ((httpResponse.status === 401 || httpResponse.status === 403) && authType === 'oauth2' && agentId) {
        return NextResponse.json({
          success: false,
          error: `Authentication failed (${httpResponse.status})`,
          needsOAuth: true,
          oauthServerId: agentId,
          oauthServerType: 'a2a',
        });
      }

      return NextResponse.json({
        success: false,
        error: `Agent returned ${httpResponse.status}: ${httpResponse.body}`,
      });
    }

    let data;
    try {
      data = JSON.parse(httpResponse.body);
    } catch {
      console.error('[A2A Proxy] Failed to parse response as JSON:', httpResponse.body);
      return NextResponse.json({
        success: false,
        error: 'Agent returned invalid JSON response',
      });
    }
    console.log('[A2A Proxy] Raw response:', JSON.stringify(data, null, 2));

    // Parse A2A response format
    if (data.error) {
      console.error('[A2A Proxy] Agent error:', data.error);
      return NextResponse.json({
        success: false,
        error: data.error.message || 'Agent returned an error',
      });
    }

    // Extract text content from A2A response
    let content = '';
    const result = data.result;

    // Extract contextId from A2A response for conversation continuity
    // A2A protocol returns contextId in the response which should be passed back in subsequent requests
    const responseContextId = result?.contextId || result?.context_id || result?.id;
    const taskState = result?.status?.state || result?.state;

    console.log('[A2A Proxy] Parsing result:', JSON.stringify(result, null, 2));
    console.log('[A2A Proxy] Context ID:', responseContextId, 'State:', taskState);

    // Helper to extract text from parts array (supports both type:"text" and kind:"text")
    const extractTextFromParts = (parts: Array<{ type?: string; kind?: string; text?: string }>) => {
      let text = '';
      for (const part of parts) {
        if ((part.type === 'text' || part.kind === 'text') && part.text) {
          text += part.text;
        }
      }
      return text;
    };

    // Try different response formats
    if (result?.parts && Array.isArray(result.parts)) {
      // Direct parts array (Adobe A2A format: result.parts with kind:"text")
      console.log('[A2A Proxy] Found parts in result.parts');
      content = extractTextFromParts(result.parts);
    } else if (result?.status?.message?.parts) {
      console.log('[A2A Proxy] Found parts in result.status.message.parts');
      content = extractTextFromParts(result.status.message.parts);
    } else if (result?.message?.parts) {
      console.log('[A2A Proxy] Found parts in result.message.parts');
      content = extractTextFromParts(result.message.parts);
    } else if (typeof result === 'string') {
      console.log('[A2A Proxy] Result is string');
      content = result;
    } else if (result?.content) {
      console.log('[A2A Proxy] Found result.content');
      content = result.content;
    } else if (result?.text) {
      console.log('[A2A Proxy] Found result.text');
      content = result.text;
    } else {
      console.log('[A2A Proxy] Could not extract content from response structure');
      console.log('[A2A Proxy] Available keys in result:', result ? Object.keys(result) : 'result is null/undefined');
    }

    console.log('[A2A Proxy] Extracted content:', content || '(empty)');

    // Estimate tokens - only count current message, not full history
    const systemPromptText = systemPrompts ? systemPrompts.join(' ') : '';
    const currentMessage = messages[messages.length - 1]?.content || '';
    const inputText = systemPromptText + ' ' + currentMessage;
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(content.length / 4);

    return NextResponse.json({
      success: true,
      content: content || 'No response from agent',
      inputTokens,
      outputTokens,
      contextId: responseContextId, // Return contextId for conversation continuity
      taskState, // Return task state (e.g., 'input_required', 'completed')
    });
  } catch (error) {
    console.error('A2A proxy error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    }, { status: 500 });
  }
}
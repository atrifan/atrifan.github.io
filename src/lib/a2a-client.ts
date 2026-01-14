/**
 * A2A (Agent-to-Agent) Client
 * 
 * Simple client for communicating with external A2A agents.
 * Sends messages to agent endpoints and receives text responses.
 */

export interface A2AMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface A2AResponse {
  success: boolean;
  content?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  contextId?: string; // A2A protocol task ID for conversation continuity
  taskState?: string; // A2A task state (e.g., 'input_required', 'completed')
  // OAuth authentication required
  needsOAuth?: boolean;
  oauthServerId?: string;
  oauthServerType?: string;
  // OAuth config returned from server when auth is needed
  oauthConfig?: {
    authorization_endpoint: string;
    token_endpoint: string;
    scopes: string;
    client_id: string;
    use_dcr?: boolean;
    registration_endpoint?: string;
  };
}

export interface A2AClientConfig {
  agentUrl: string;
  agentId?: string; // A2A agent ID for OAuth token lookup
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  systemPrompts?: string[]; // Personality system prompts
  contextId?: string; // A2A protocol context ID for conversation continuity
}

/**
 * Send a message to an A2A agent and get a response.
 * Uses a server-side proxy to avoid CORS issues.
 */
export async function sendA2AMessage(
  config: A2AClientConfig,
  messages: A2AMessage[]
): Promise<A2AResponse> {
  // 3 minute timeout for UI to proxy
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    // Use server-side proxy to avoid CORS issues
    const response = await fetch('/api/a2a/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentUrl: config.agentUrl,
        agentId: config.agentId,
        messages,
        systemPrompts: config.systemPrompts,
        authType: config.authType,
        authConfig: config.authConfig,
        headers: config.headers,
        contextId: config.contextId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Proxy error ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out after 3 minutes',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    };
  }
}


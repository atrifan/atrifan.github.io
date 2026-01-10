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
}

export interface A2AClientConfig {
  agentUrl: string;
  authType?: 'none' | 'api_key' | 'bearer' | 'basic';
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
  try {
    // Use server-side proxy to avoid CORS issues
    const response = await fetch('/api/a2a/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentUrl: config.agentUrl,
        messages,
        systemPrompts: config.systemPrompts,
        authType: config.authType,
        authConfig: config.authConfig,
        headers: config.headers,
        contextId: config.contextId,
      }),
    });

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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    };
  }
}


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
}

export interface A2AClientConfig {
  agentUrl: string;
  authType?: 'none' | 'api_key' | 'bearer' | 'basic';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Send a message to an A2A agent and get a response
 */
export async function sendA2AMessage(
  config: A2AClientConfig,
  messages: A2AMessage[]
): Promise<A2AResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    // Add authentication headers based on auth type
    if (config.authType === 'bearer' && config.authConfig?.token) {
      headers['Authorization'] = `Bearer ${config.authConfig.token}`;
    } else if (config.authType === 'api_key' && config.authConfig?.key) {
      const headerName = config.authConfig.headerName || 'X-API-Key';
      headers[headerName] = config.authConfig.key;
    } else if (config.authType === 'basic' && config.authConfig?.username && config.authConfig?.password) {
      const credentials = btoa(`${config.authConfig.username}:${config.authConfig.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // A2A protocol request format
    const requestBody = {
      jsonrpc: '2.0',
      method: 'tasks/send',
      id: Date.now().toString(),
      params: {
        id: `task-${Date.now()}`,
        message: {
          role: 'user',
          parts: [
            {
              type: 'text',
              text: messages[messages.length - 1]?.content || '',
            },
          ],
        },
        // Include conversation history if available
        ...(messages.length > 1 && {
          sessionId: `session-${Date.now()}`,
        }),
      },
    };

    const response = await fetch(config.agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Agent returned ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();

    // Parse A2A response format
    if (data.error) {
      return {
        success: false,
        error: data.error.message || 'Agent returned an error',
      };
    }

    // Extract text content from A2A response
    let content = '';
    const result = data.result;
    
    if (result?.status?.message?.parts) {
      // Standard A2A response format
      for (const part of result.status.message.parts) {
        if (part.type === 'text') {
          content += part.text;
        }
      }
    } else if (result?.message?.parts) {
      // Alternative format
      for (const part of result.message.parts) {
        if (part.type === 'text') {
          content += part.text;
        }
      }
    } else if (typeof result === 'string') {
      // Simple string response
      content = result;
    } else if (result?.content) {
      // Content field
      content = result.content;
    }

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const inputText = messages.map(m => m.content).join(' ');
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(content.length / 4);

    return {
      success: true,
      content: content || 'No response from agent',
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    };
  }
}


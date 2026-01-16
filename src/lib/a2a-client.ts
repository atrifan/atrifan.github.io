/**
 * A2A (Agent-to-Agent) Client
 *
 * Simple client for communicating with external A2A agents.
 * Sends messages to agent endpoints and receives text responses.
 * Supports streaming with reasoning events.
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

/**
 * Reasoning event from A2A agent
 */
export interface A2AReasoningEvent {
  id: string;
  reasoningType: 'thinking' | 'action';
  title: string;
  text: string;
  timestamp: Date;
}

/**
 * Streaming event callbacks
 */
export interface A2AStreamCallbacks {
  onReasoning?: (event: A2AReasoningEvent) => void;
  onContent?: (text: string, append: boolean) => void;
  onStatus?: (taskId: string, state: string, final?: boolean) => void;
  onError?: (error: string) => void;
}

export interface A2AClientConfig {
  agentUrl: string;
  agentId?: string; // A2A agent ID for OAuth token lookup
  authType?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  systemPrompts?: string[]; // Personality system prompts
  contextId?: string; // A2A protocol context ID for conversation continuity
  signal?: AbortSignal; // External abort signal for cancellation
}

/**
 * Send a message to an A2A agent and get a response.
 * Uses a server-side proxy to avoid CORS issues.
 *
 * @param config - Configuration including agent URL and optional abort signal
 * @param messages - Array of messages to send
 * @throws {Error} Throws AbortError if the request is cancelled via the signal
 */
export async function sendA2AMessage(
  config: A2AClientConfig,
  messages: A2AMessage[]
): Promise<A2AResponse> {
  // 3 minute timeout for UI to proxy
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 180000);

  // If an external signal is provided, listen for its abort and propagate it
  let externalAborted = false;
  const onExternalAbort = () => {
    externalAborted = true;
    timeoutController.abort();
  };
  if (config.signal) {
    if (config.signal.aborted) {
      // Already aborted before we started
      clearTimeout(timeoutId);
      const error = new Error('Request was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    config.signal.addEventListener('abort', onExternalAbort);
  }

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
      signal: timeoutController.signal,
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
      // If this was triggered by external signal, re-throw as AbortError
      if (externalAborted) {
        const abortError = new Error('Request was cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }
      // Otherwise it was a timeout
      return {
        success: false,
        error: 'Request timed out after 3 minutes',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    };
  } finally {
    // Clean up the external abort listener
    if (config.signal) {
      config.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Send a message to an A2A agent with streaming support.
 * Uses SSE to receive real-time updates including reasoning events.
 *
 * @param config - Configuration including agent URL and optional abort signal
 * @param messages - Array of messages to send
 * @param callbacks - Callbacks for streaming events
 * @returns Promise resolving to final A2AResponse
 */
export async function sendA2AMessageStream(
  config: A2AClientConfig,
  messages: A2AMessage[],
  callbacks: A2AStreamCallbacks
): Promise<A2AResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 180000);

  let externalAborted = false;
  const onExternalAbort = () => {
    externalAborted = true;
    timeoutController.abort();
  };
  if (config.signal) {
    if (config.signal.aborted) {
      clearTimeout(timeoutId);
      const error = new Error('Request was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    config.signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const response = await fetch('/api/a2a/proxy/stream', {
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
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Proxy error ${response.status}: ${errorText}`,
      };
    }

    if (!response.body) {
      return {
        success: false,
        error: 'No response body',
      };
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: A2AResponse = { success: false, error: 'Stream ended unexpectedly' };
    let reasoningCounter = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        try {
          const event = JSON.parse(line.slice(6));

          switch (event.type) {
            case 'reasoning':
              if (callbacks.onReasoning) {
                callbacks.onReasoning({
                  id: `reasoning-${++reasoningCounter}`,
                  reasoningType: event.data.reasoningType || 'thinking',
                  title: event.data.title || 'Reasoning',
                  text: event.data.text || '',
                  timestamp: new Date(),
                });
              }
              break;

            case 'content':
              if (callbacks.onContent) {
                callbacks.onContent(event.data.text || '', event.data.append ?? true);
              }
              break;

            case 'status':
              if (callbacks.onStatus) {
                callbacks.onStatus(event.data.taskId, event.data.state, event.data.final);
              }
              break;

            case 'error':
              if (callbacks.onError) {
                callbacks.onError(event.data.error || 'Unknown error');
              }
              // Check for OAuth requirement
              if (event.data.needsOAuth) {
                finalResponse = {
                  success: false,
                  error: event.data.error || 'OAuth required',
                  needsOAuth: true,
                  oauthServerId: event.data.oauthServerId,
                  oauthServerType: event.data.oauthServerType,
                  oauthConfig: event.data.oauthConfig,
                };
              } else {
                finalResponse = {
                  success: false,
                  error: event.data.error || 'Unknown error',
                };
              }
              break;

            case 'done':
              finalResponse = {
                success: event.data.success ?? true,
                content: event.data.content,
                inputTokens: event.data.inputTokens,
                outputTokens: event.data.outputTokens,
                contextId: event.data.contextId,
                taskState: event.data.taskState,
              };
              break;
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }

    return finalResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalAborted) {
        const abortError = new Error('Request was cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }
      return {
        success: false,
        error: 'Request timed out after 3 minutes',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with agent',
    };
  } finally {
    if (config.signal) {
      config.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

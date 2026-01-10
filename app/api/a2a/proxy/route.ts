/**
 * POST /api/a2a/proxy
 * 
 * Proxies A2A requests to external agents to avoid CORS issues.
 * The browser calls this endpoint, which then forwards the request to the external agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

interface A2AProxyRequest {
  agentUrl: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompts?: string[]; // Personality system prompts
  authType?: 'none' | 'api_key' | 'bearer' | 'basic';
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
    const { agentUrl, messages, systemPrompts, authType, authConfig, headers: customHeaders, contextId } = body;

    if (!agentUrl) {
      return NextResponse.json({ error: 'agentUrl is required' }, { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'messages are required' }, { status: 400 });
    }

    // Build headers for the external request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // Add authentication headers based on auth type
    if (authType === 'bearer' && authConfig?.token) {
      headers['Authorization'] = `Bearer ${authConfig.token}`;
    } else if (authType === 'api_key' && authConfig?.key) {
      const headerName = authConfig.headerName || 'X-API-Key';
      headers[headerName] = authConfig.key;
    } else if (authType === 'basic' && authConfig?.username && authConfig?.password) {
      const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

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
    // - params.contextId: reused for conversation continuity
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestBody: {
      jsonrpc: string;
      method: string;
      id: string;
      params: {
        contextId?: string;
        message: {
          role: string;
          parts: Array<{ type: string; text: string }>;
        };
      };
    } = {
      jsonrpc: '2.0',
      method: 'tasks/send',
      id: messageId,
      params: {
        message: {
          role: 'user',
          parts: messageParts,
        },
      },
    };

    // Add contextId if provided for conversation continuity
    if (contextId) {
      requestBody.params.contextId = contextId;
    }

    // Log outgoing request
    console.log('[A2A Proxy] Sending request to:', agentUrl);
    console.log('[A2A Proxy] Request body:', JSON.stringify(requestBody, null, 2));

    // Make the request to the external agent
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log('[A2A Proxy] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[A2A Proxy] Error response status:', response.status);
      console.error('[A2A Proxy] Error response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
      console.error('[A2A Proxy] Error response body:', errorText);

      // Try to parse as JSON for more details
      try {
        const errorJson = JSON.parse(errorText);
        console.error('[A2A Proxy] Error response JSON:', JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, already logged as text
      }

      return NextResponse.json({
        success: false,
        error: `Agent returned ${response.status}: ${errorText}`,
      });
    }

    const data = await response.json();
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

    // Estimate tokens - include system prompts in input calculation
    const systemPromptText = systemPrompts ? systemPrompts.join(' ') : '';
    const inputText = systemPromptText + ' ' + messages.map(m => m.content).join(' ');
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


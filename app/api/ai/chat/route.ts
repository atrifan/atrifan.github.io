import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { AI_MODELS, TOKEN_QUOTAS } from '@/src/config/ai-tokens.config';
import { aggregateMCPTools, type MCPConnectorConfig } from '@/src/lib/mcp-tool-aggregator';

// Dynamic route - don't prerender
export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Calculate cost for a request
function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) return 0;
  return (inputTokens * model.inputCostPer1M / 1_000_000) + (outputTokens * model.outputCostPer1M / 1_000_000);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    console.log('Supabase client:', supabase ? 'connected' : 'NOT CONNECTED - check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    const tier = request.headers.get('x-user-tier') || 'free';
    const quota = TOKEN_QUOTAS[tier as keyof typeof TOKEN_QUOTAS];

    // Free tier cannot use AI
    if (tier === 'free') {
      return NextResponse.json({
        error: 'Upgrade required',
        reason: 'upgrade_required',
        message: 'Upgrade to Pro to use AI chat',
      }, { status: 403 });
    }

    const body = await request.json();
    const {
      messages,
      model: modelId,
      conversationId,
      systemPrompt,
      // Context tracking data
      ragData,
      historyData,
      personaData,
      ragTokens,
      historyTokens,
      recentHistoryTokens,
      personaTokens,
      // Model parameters (with defaults)
      maxOutputTokens = 512,
      temperature = 0.3,
      maxRetries = 5,
      // MCP connectors for tool aggregation
      connectors = [] as MCPConnectorConfig[],
      userApiKey = '',
      // Agentic loop settings
      maxSteps = 10,
    } = body;
    const userMessage = messages[messages.length - 1]?.content || '';

    // Validate model access
    if (!quota.models.includes(modelId)) {
      return NextResponse.json({
        error: 'Model not available',
        reason: 'model_not_available',
        message: `Model ${modelId} is not available on your plan`,
      }, { status: 403 });
    }

    // Check monthly quota if database is available
    if (supabase) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthlyUsage } = await supabase
        .from('ai_token_usage')
        .select('cost_usd')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

      const totalCost = monthlyUsage?.reduce(
        (sum, u) => sum + (parseFloat(String(u.cost_usd)) || 0), 0
      ) || 0;

      if (totalCost >= quota.aiCostBudget) {
        return NextResponse.json({
          error: 'Budget exceeded',
          reason: 'budget_exceeded',
          message: 'Monthly AI budget exceeded. Resets on the 1st.',
          usage: { totalCost, limit: quota.aiCostBudget },
        }, { status: 429 });
      }
    }

    // Get model info
    const modelInfo = AI_MODELS.find(m => m.id === modelId);
    if (!modelInfo) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    // Call AI using Vercel AI SDK with agentic loop
    let assistantMessage = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0 };
    let toolCallsInfo: Array<{ name: string; args: unknown; result: unknown }> = [];
    let mcpCleanup: (() => Promise<void>) | null = null;
    let oauthErrors: Array<{ connectorId: string; error: string; needsOAuth?: boolean; oauthServerId?: string }> = [];

    console.log('[Chat API] Request received:', {
      userId: userId.substring(0, 8) + '...',
      modelId,
      messageCount: messages.length,
      lastMessage: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''),
      connectorCount: connectors.length,
      connectors: connectors.map((c: MCPConnectorConfig) => ({
        id: c.id,
        type: c.connector_type,
        displayName: c.display_name,
        serverName: c.server_name,
      })),
      hasUserApiKey: !!userApiKey,
      userApiKeyPrefix: userApiKey ? userApiKey.substring(0, 8) + '...' : 'NONE',
      maxSteps,
    });

    try {
      // Build system prompt if provided
      const systemPromptText = systemPrompt || undefined;

      // Aggregate tools from MCP connectors if any are provided
      let tools: Record<string, unknown> | undefined;
      const mcpConnectors = (connectors as MCPConnectorConfig[]).filter(
        (c: MCPConnectorConfig) => c.connector_type === 'internal_mcp' || c.connector_type === 'external_mcp'
      );

      console.log('[Chat API] Filtered MCP connectors:', {
        total: connectors.length,
        mcpConnectors: mcpConnectors.length,
        filtered: mcpConnectors.map((c: MCPConnectorConfig) => c.display_name),
      });

      if (mcpConnectors.length > 0 && userApiKey) {
        const baseUrl = request.nextUrl.origin;
        console.log('[Chat API] Aggregating tools from MCP connectors, baseUrl:', baseUrl);
        const toolsResult = await aggregateMCPTools(mcpConnectors, userApiKey, userId, baseUrl);

        console.log('[Chat API] Tool aggregation result:', {
          toolCount: Object.keys(toolsResult.tools).length,
          toolNames: Object.keys(toolsResult.tools),
          errorCount: toolsResult.errors.length,
        });

        if (Object.keys(toolsResult.tools).length > 0) {
          tools = toolsResult.tools;
          mcpCleanup = toolsResult.cleanup;
        }

        // Collect OAuth errors to return to client
        oauthErrors = toolsResult.errors.filter(e => e.needsOAuth);

        if (toolsResult.errors.length > 0) {
          console.log('[Chat API] MCP connection errors:', toolsResult.errors);
        }
      } else {
        console.log('[Chat API] Skipping tool aggregation:', {
          reason: mcpConnectors.length === 0 ? 'No MCP connectors' : 'No userApiKey',
          mcpConnectorCount: mcpConnectors.length,
          hasUserApiKey: !!userApiKey,
        });
      }

      // Use agentic loop with maxSteps if tools are available
      const hasTools = tools && Object.keys(tools).length > 0;
      const toolNames = hasTools ? Object.keys(tools!) : [];
      console.log('[Chat API] Calling generateText:', {
        model: modelId,
        hasSystemPrompt: !!systemPromptText,
        systemPromptLength: systemPromptText?.length || 0,
        messageCount: messages.length,
        hasTools,
        toolCount: toolNames.length,
        toolNames: toolNames,
        maxSteps: hasTools ? (maxSteps || 10) : 'N/A (no tools)',
        maxOutputTokens: maxOutputTokens || 512,
        temperature: temperature ?? 0.3,
      });

      const result = await generateText({
        model: modelId, // AI SDK v6 has built-in gateway support
        system: systemPromptText,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        maxOutputTokens: maxOutputTokens || 512,
        temperature: temperature ?? 0.3,
        maxRetries: maxRetries || 5,
        // Agentic loop configuration
        ...(hasTools ? {
          tools: tools as Parameters<typeof generateText>[0]['tools'],
          maxSteps: maxSteps || 10,
        } : {}),
      });

      console.log('[Chat API] generateText result:', {
        textLength: result.text?.length || 0,
        textPreview: result.text?.substring(0, 100) + (result.text?.length > 100 ? '...' : ''),
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        stepCount: result.steps?.length || 0,
        finishReason: result.finishReason,
      });

      assistantMessage = result.text;
      usage = {
        prompt_tokens: result.usage?.inputTokens || 0,
        completion_tokens: result.usage?.outputTokens || 0,
      };

      // Collect tool call information for response
      if (result.steps) {
        console.log('[Chat API] Processing steps:', result.steps.length);
        for (const step of result.steps) {
          if (step.toolCalls) {
            console.log('[Chat API] Step has tool calls:', step.toolCalls.length);
            for (const toolCall of step.toolCalls) {
              // Use type assertion to access properties (may be undefined for dynamic tools)
              const toolCallWithArgs = toolCall as { toolName: string; toolCallId: string; args?: unknown };
              const toolResult = step.toolResults?.find(r => r.toolCallId === toolCall.toolCallId);
              const toolResultWithResult = toolResult as { result?: unknown } | undefined;

              console.log('[Chat API] Tool call:', {
                name: toolCall.toolName,
                args: toolCallWithArgs.args,
                hasResult: !!toolResultWithResult?.result,
              });

              toolCallsInfo.push({
                name: toolCall.toolName,
                args: toolCallWithArgs.args,
                result: toolResultWithResult?.result,
              });
            }
          }
        }
      }

      console.log('[Chat API] Final tool calls info:', {
        count: toolCallsInfo.length,
        tools: toolCallsInfo.map(t => t.name),
      });
    } catch (error) {
      console.error('[Chat API] AI Gateway error:', error);
      // Cleanup MCP clients on error
      if (mcpCleanup) {
        await mcpCleanup();
      }
      return NextResponse.json({
        error: 'AI service error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 502 });
    } finally {
      // Always cleanup MCP clients
      if (mcpCleanup) {
        await mcpCleanup();
      }
    }

    // Record usage and save messages to database
    let activeConversationId = conversationId;
    const cost = calculateCost(modelId, usage.prompt_tokens, usage.completion_tokens);

    if (supabase) {
      // Record token usage
      const { error: usageError } = await supabase.from('ai_token_usage').insert({
        user_id: userId,
        model_id: modelId,
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        cost_usd: cost,
        message_type: 'chat',
        conversation_id: conversationId,
      });

      if (usageError) {
        console.error('Failed to record token usage:', usageError);
      } else {
        console.log('Token usage recorded:', { userId, modelId, input: usage.prompt_tokens, output: usage.completion_tokens, cost });
      }

      // Create or update conversation
      if (!conversationId) {
        // Create new conversation with title from first message
        const title = userMessage.length > 50
          ? userMessage.substring(0, 47) + '...'
          : userMessage;

        const { data: newConv } = await supabase
          .from('chat_conversations')
          .insert({
            user_id: userId,
            title,
            model_id: modelId,
          })
          .select()
          .single();

        activeConversationId = newConv?.id;
      }

      // Save messages to conversation
      if (activeConversationId) {
        // Save user message
        await supabase.from('chat_messages').insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: 'user',
          content: userMessage,
          input_tokens: usage.prompt_tokens,
          output_tokens: 0,
        });

        // Calculate cost for this message
        const messageCost = calculateCost(modelId, usage.prompt_tokens, usage.completion_tokens);

        // Save assistant message with context tracking data
        await supabase.from('chat_messages').insert({
          conversation_id: activeConversationId,
          user_id: userId,
          role: 'assistant',
          content: assistantMessage,
          model_id: modelId,
          input_tokens: 0,
          output_tokens: usage.completion_tokens,
          cost: messageCost,
          // Context tracking
          rag_data: ragData || null,
          history_data: historyData || null,
          persona_data: personaData || null,
          rag_tokens: ragTokens || 0,
          history_tokens: historyTokens || 0,
          recent_history_tokens: recentHistoryTokens || 0,
          persona_tokens: personaTokens || 0,
        });

        // Update conversation message count and tokens
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('message_count, total_tokens')
          .eq('id', activeConversationId)
          .single();

        await supabase
          .from('chat_conversations')
          .update({
            message_count: (conv?.message_count || 0) + 2,
            total_tokens: (conv?.total_tokens || 0) + usage.prompt_tokens + usage.completion_tokens,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeConversationId);
      }
    }

    return NextResponse.json({
      content: assistantMessage,
      model: modelId,
      conversationId: activeConversationId,
      usage: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        cost,
      },
      // Include tool calls info if any tools were used
      ...(toolCallsInfo.length > 0 ? { toolCalls: toolCallsInfo } : {}),
      // Include OAuth errors if any connectors need re-authentication
      ...(oauthErrors.length > 0 ? { oauthErrors } : {}),
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


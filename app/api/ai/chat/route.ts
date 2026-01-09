import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS, TOKEN_QUOTAS, THROTTLE_CONFIG } from '@/src/config/ai-tokens.config';

// Dynamic route - don't prerender
export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    const { messages, model: modelId, conversationId, systemPrompt } = body;
    const userMessage = messages[messages.length - 1]?.content || '';

    // Build messages array with optional system prompt
    const apiMessages = [];
    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt });
    }
    apiMessages.push(...messages);

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
        .select('input_tokens, output_tokens')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

      const totalTokens = monthlyUsage?.reduce(
        (sum, u) => sum + u.input_tokens + u.output_tokens, 0
      ) || 0;

      if (totalTokens >= quota.monthlyTokens) {
        return NextResponse.json({
          error: 'Quota exceeded',
          reason: 'quota_exceeded',
          message: 'Monthly token quota exceeded. Resets on the 1st.',
          usage: { totalTokens, limit: quota.monthlyTokens },
        }, { status: 429 });
      }
    }

    // Get model info
    const modelInfo = AI_MODELS.find(m => m.id === modelId);
    if (!modelInfo) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    // Call OpenRouter API
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://zip.run',
        'X-Title': 'ZIP.RUN AI Chat',
      },
      body: JSON.stringify({
        model: modelId,
        messages: apiMessages,
        max_tokens: 4096,
      }),
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json();
      console.error('OpenRouter error:', errorData);
      return NextResponse.json({ 
        error: 'AI service error', 
        details: errorData.error?.message || 'Unknown error' 
      }, { status: 502 });
    }

    const data = await openRouterResponse.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };

    // Record usage and save messages to database
    let activeConversationId = conversationId;

    if (supabase) {
      const cost = calculateCost(modelId, usage.prompt_tokens, usage.completion_tokens);

      // Record token usage
      await supabase.from('ai_token_usage').insert({
        user_id: userId,
        model_id: modelId,
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        cost_usd: cost,
        message_type: 'chat',
        conversation_id: conversationId,
      });

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
          role: 'user',
          content: userMessage,
          input_tokens: usage.prompt_tokens,
          output_tokens: 0,
        });

        // Save assistant message
        await supabase.from('chat_messages').insert({
          conversation_id: activeConversationId,
          role: 'assistant',
          content: assistantMessage,
          model_id: modelId,
          input_tokens: 0,
          output_tokens: usage.completion_tokens,
        });
      }
    }

    return NextResponse.json({
      content: assistantMessage,
      model: modelId,
      conversationId: activeConversationId,
      usage: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
      },
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


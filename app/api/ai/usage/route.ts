import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TOKEN_QUOTAS, THROTTLE_CONFIG } from '@/src/config/ai-tokens.config';

// Dynamic route - don't prerender
export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get current user's token usage
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get user's subscription tier from Clerk metadata or default to 'free'
    const tier = request.headers.get('x-user-tier') || 'free';
    const quota = TOKEN_QUOTAS[tier as keyof typeof TOKEN_QUOTAS];

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usage, error } = await supabase
      .from('ai_token_usage')
      .select('input_tokens, output_tokens, cost_usd, model_id')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      console.error('Error fetching usage:', error);
      return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
    }

    // Aggregate usage
    const totalInputTokens = usage?.reduce((sum, u) => sum + u.input_tokens, 0) || 0;
    const totalOutputTokens = usage?.reduce((sum, u) => sum + u.output_tokens, 0) || 0;
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCost = usage?.reduce((sum, u) => sum + parseFloat(u.cost_usd), 0) || 0;

    // Usage by model
    const usageByModel: Record<string, { input: number; output: number; cost: number }> = {};
    usage?.forEach(u => {
      if (!usageByModel[u.model_id]) {
        usageByModel[u.model_id] = { input: 0, output: 0, cost: 0 };
      }
      usageByModel[u.model_id].input += u.input_tokens;
      usageByModel[u.model_id].output += u.output_tokens;
      usageByModel[u.model_id].cost += parseFloat(u.cost_usd);
    });

    const response = {
      tier,
      quota: {
        monthlyTokens: quota?.monthlyTokens || 0,
        models: quota?.models || [],
        price: quota?.price || 0,
      },
      usage: {
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCost: totalCost.toFixed(4),
        requestCount: usage?.length || 0,
        byModel: usageByModel,
      },
      remaining: {
        tokens: Math.max(0, (quota?.monthlyTokens || 0) - totalTokens),
        percentage: quota?.monthlyTokens 
          ? Math.max(0, 100 - (totalTokens / quota.monthlyTokens) * 100)
          : 0,
      },
      throttle: THROTTLE_CONFIG[tier as keyof typeof THROTTLE_CONFIG] || THROTTLE_CONFIG.free,
      canUseAI: tier !== 'free' && totalTokens < (quota?.monthlyTokens || 0),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in usage API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Record token usage
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { modelId, inputTokens, outputTokens, costUsd, conversationId, messageType } = body;

    if (!modelId || inputTokens === undefined || outputTokens === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_token_usage')
      .insert({
        user_id: userId,
        model_id: modelId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd || 0,
        conversation_id: conversationId,
        message_type: messageType || 'chat',
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording usage:', error);
      return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, usage: data });
  } catch (error) {
    console.error('Error in usage POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


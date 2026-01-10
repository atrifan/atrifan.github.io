import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { THROTTLE_CONFIG, TOKEN_QUOTAS } from '@/src/config/ai-tokens.config';

// Dynamic route - don't prerender
export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Check rate limit before sending message
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

    const tier = request.headers.get('x-user-tier') || 'free';
    const throttle = THROTTLE_CONFIG[tier as keyof typeof THROTTLE_CONFIG];
    const quota = TOKEN_QUOTAS[tier as keyof typeof TOKEN_QUOTAS];

    // Free tier cannot use AI
    if (tier === 'free') {
      return NextResponse.json({
        allowed: false,
        reason: 'upgrade_required',
        message: 'Upgrade to Pro to use AI chat',
      });
    }

    // Check monthly token quota
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
        allowed: false,
        reason: 'budget_exceeded',
        message: 'Monthly AI budget exceeded. Resets on the 1st.',
        usage: { totalCost, limit: quota.aiCostBudget },
      });
    }

    // Check minute rate limit
    const minuteStart = new Date();
    minuteStart.setSeconds(0, 0);

    const { data: minuteRequests } = await supabase
      .from('ai_rate_limits')
      .select('request_count')
      .eq('user_id', userId)
      .eq('window_type', 'minute')
      .gte('window_start', minuteStart.toISOString())
      .single();

    if ((minuteRequests?.request_count || 0) >= throttle.requestsPerMinute) {
      return NextResponse.json({
        allowed: false,
        reason: 'rate_limited',
        message: `Rate limit: ${throttle.requestsPerMinute} requests/minute`,
        retryAfter: 60 - new Date().getSeconds(),
      });
    }

    // Check hourly rate limit
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const { data: hourRequests } = await supabase
      .from('ai_rate_limits')
      .select('request_count')
      .eq('user_id', userId)
      .eq('window_type', 'hour')
      .gte('window_start', hourStart.toISOString())
      .single();

    if ((hourRequests?.request_count || 0) >= throttle.requestsPerHour) {
      return NextResponse.json({
        allowed: false,
        reason: 'rate_limited',
        message: `Rate limit: ${throttle.requestsPerHour} requests/hour`,
        retryAfter: 3600 - (new Date().getMinutes() * 60 + new Date().getSeconds()),
      });
    }

    // Increment rate limit counters
    await supabase.from('ai_rate_limits').upsert({
      user_id: userId,
      window_start: minuteStart.toISOString(),
      window_type: 'minute',
      request_count: (minuteRequests?.request_count || 0) + 1,
    }, { onConflict: 'user_id,window_start,window_type' });

    await supabase.from('ai_rate_limits').upsert({
      user_id: userId,
      window_start: hourStart.toISOString(),
      window_type: 'hour',
      request_count: (hourRequests?.request_count || 0) + 1,
    }, { onConflict: 'user_id,window_start,window_type' });

    return NextResponse.json({
      allowed: true,
      remaining: {
        budget: quota.aiCostBudget - totalCost,
        minuteRequests: throttle.requestsPerMinute - (minuteRequests?.request_count || 0) - 1,
        hourRequests: throttle.requestsPerHour - (hourRequests?.request_count || 0) - 1,
      },
    });
  } catch (error) {
    console.error('Rate limit check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


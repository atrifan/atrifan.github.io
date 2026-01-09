import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { THROTTLE_CONFIG, TOKEN_QUOTAS } from '@/src/config/ai-tokens.config';

// Dynamic route - don't prerender
export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      .select('input_tokens, output_tokens')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const totalTokens = monthlyUsage?.reduce(
      (sum, u) => sum + u.input_tokens + u.output_tokens, 0
    ) || 0;

    if (totalTokens >= quota.monthlyTokens) {
      return NextResponse.json({
        allowed: false,
        reason: 'quota_exceeded',
        message: 'Monthly token quota exceeded. Resets on the 1st.',
        usage: { totalTokens, limit: quota.monthlyTokens },
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
        tokens: quota.monthlyTokens - totalTokens,
        minuteRequests: throttle.requestsPerMinute - (minuteRequests?.request_count || 0) - 1,
        hourRequests: throttle.requestsPerHour - (hourRequests?.request_count || 0) - 1,
      },
    });
  } catch (error) {
    console.error('Rate limit check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


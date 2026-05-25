import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    const [budgetResult, logsResult] = await Promise.all([
      supabase
        .from('user_budgets')
        .select('remaining_balance, status')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('paid_usage_analytics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    const remainingBalance = parseFloat(budgetResult.data?.remaining_balance || '0');
    const logs = logsResult.data || [];

    const totalSpent = logs.reduce(
      (sum, log) => sum + parseFloat(String(log.cost_deducted || '0')),
      0
    );

    const modelMap = new Map<string, { provider: string; model: string; totalCost: number; totalTokens: number; count: number }>();
    for (const log of logs) {
      const key = `${log.provider}/${log.model_name}`;
      const existing = modelMap.get(key) || {
        provider: log.provider || 'unknown',
        model: log.model_name || 'unknown',
        totalCost: 0,
        totalTokens: 0,
        count: 0,
      };
      existing.totalCost += parseFloat(String(log.cost_deducted || '0'));
      existing.totalTokens += parseInt(String(log.tokens_used || '0'), 10);
      existing.count += 1;
      modelMap.set(key, existing);
    }

    return NextResponse.json({
      remainingBalance,
      totalSpent,
      modelSummaries: Array.from(modelMap.values()),
      rawDeviceLogs: logs.map((l) => ({
        deviceSessionId: l.device_session_id,
        provider: l.provider,
        model: l.model_name,
        tokensUsed: l.tokens_used,
        costDeducted: l.cost_deducted,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error('[dashboard/paid-stats] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

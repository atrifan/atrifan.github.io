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

    const [budgetResult, logsResult, txResult, keysResult] = await Promise.all([
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
      supabase
        .from('balance_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('api_keys')
        .select('id, device_name')
        .eq('user_id', userId),
    ]);

    const remainingBalance = parseFloat(budgetResult.data?.remaining_balance || '0');
    const logs = logsResult.data || [];
    const transactions = txResult.data || [];
    const keys = keysResult.data || [];

    const keyNameMap = new Map<string, string>();
    for (const key of keys) {
      keyNameMap.set(key.id, key.device_name || 'Unknown Device');
    }

    const totalSpent = logs.reduce(
      (sum, log) => sum + parseFloat(String(log.cost_deducted || '0')),
      0
    );

    const totalDeposited = transactions
      .filter(tx => tx.type === 'deposit')
      .reduce((sum, tx) => sum + parseFloat(String(tx.amount || '0')), 0);

    const modelMap = new Map<string, { provider: string; model: string; totalCost: number; totalTokens: number; count: number }>();
    const deviceMap = new Map<string, { apiKeyId: string; deviceName: string; totalCost: number; totalTokens: number; count: number }>();
    const dailyMap = new Map<string, { date: string; cost: number; tokens: number; count: number }>();

    for (const log of logs) {
      const modelKey = `${log.provider}/${log.model_name}`;
      const existing = modelMap.get(modelKey) || {
        provider: log.provider || 'unknown',
        model: log.model_name || 'unknown',
        totalCost: 0,
        totalTokens: 0,
        count: 0,
      };
      existing.totalCost += parseFloat(String(log.cost_deducted || '0'));
      existing.totalTokens += parseInt(String(log.tokens_used || '0'), 10);
      existing.count += 1;
      modelMap.set(modelKey, existing);

      const deviceKey = log.api_key_id || log.device_session_id || 'unknown';
      const deviceExisting = deviceMap.get(deviceKey) || {
        apiKeyId: log.api_key_id || '',
        deviceName: log.api_key_id ? (keyNameMap.get(log.api_key_id) || 'Unknown Device') : (log.device_session_id ? `Session ${log.device_session_id.slice(0, 8)}` : 'Unknown'),
        totalCost: 0,
        totalTokens: 0,
        count: 0,
      };
      deviceExisting.totalCost += parseFloat(String(log.cost_deducted || '0'));
      deviceExisting.totalTokens += parseInt(String(log.tokens_used || '0'), 10);
      deviceExisting.count += 1;
      deviceMap.set(deviceKey, deviceExisting);

      const date = new Date(log.created_at).toISOString().split('T')[0];
      const dayExisting = dailyMap.get(date) || { date, cost: 0, tokens: 0, count: 0 };
      dayExisting.cost += parseFloat(String(log.cost_deducted || '0'));
      dayExisting.tokens += parseInt(String(log.tokens_used || '0'), 10);
      dayExisting.count += 1;
      dailyMap.set(date, dayExisting);
    }

    const dailySpending = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      remainingBalance,
      totalSpent,
      totalDeposited,
      modelSummaries: Array.from(modelMap.values()),
      deviceSummaries: Array.from(deviceMap.values()),
      purchaseHistory: transactions.map(tx => ({
        id: tx.id,
        amount: parseFloat(String(tx.amount || '0')),
        type: tx.type,
        description: tx.description,
        createdAt: tx.created_at,
      })),
      dailySpending,
      rawDeviceLogs: logs.map((l) => ({
        apiKeyId: l.api_key_id || null,
        deviceName: l.api_key_id ? (keyNameMap.get(l.api_key_id) || null) : null,
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

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface MonthSummary {
  year: number;
  month: number;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
}

// GET - Get available months with usage data (Pro+ only)
export async function GET() {
  try {
    const { userId, has } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Pro+ access
    const isPlus = has?.({ plan: 'plus' }) || has?.({ feature: 'plus_access' }) || false;
    const isPro = isPlus || has?.({ plan: 'pro' }) || has?.({ feature: 'pro_access' }) || false;
    
    if (!isPro) {
      return NextResponse.json({ error: 'Budget history requires Pro or Plus subscription' }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ 
        months: [],
        _note: 'Database not configured' 
      });
    }

    // Get all usage records grouped by month
    // We'll fetch all records and aggregate in JS since Supabase doesn't support date_trunc easily
    const { data: usage, error } = await supabase
      .from('ai_token_usage')
      .select('created_at, input_tokens, output_tokens, cost_usd')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching usage history:', error);
      return NextResponse.json({ error: 'Failed to fetch usage history' }, { status: 500 });
    }

    // Aggregate by month
    const monthMap = new Map<string, MonthSummary>();
    
    (usage || []).forEach((u: { created_at: string; input_tokens: number; output_tokens: number; cost_usd: number }) => {
      const date = new Date(u.created_at);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-indexed
      const key = `${year}-${month}`;
      
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          year,
          month,
          totalCost: 0,
          totalTokens: 0,
          requestCount: 0,
        });
      }
      
      const summary = monthMap.get(key)!;
      summary.totalCost += parseFloat(String(u.cost_usd)) || 0;
      summary.totalTokens += (u.input_tokens || 0) + (u.output_tokens || 0);
      summary.requestCount += 1;
    });

    // Convert to array and sort by date (newest first)
    const months = Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    // Get current month info
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return NextResponse.json({
      currentPeriod: {
        year: currentYear,
        month: currentMonth,
      },
      months,
      totalMonths: months.length,
    });
  } catch (error) {
    console.error('Error in budget history GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


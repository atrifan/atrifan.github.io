import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count: totalRequests } = await supabase
    .from('api_usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get today's count
  const { count: requestsToday } = await supabase
    .from('api_usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay);

  // Get this month's count
  const { count: requestsThisMonth } = await supabase
    .from('api_usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfMonth);

  // Get last request
  const { data: lastRequest } = await supabase
    .from('api_usage_log')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    totalRequests: totalRequests || 0,
    requestsToday: requestsToday || 0,
    requestsThisMonth: requestsThisMonth || 0,
    lastRequestAt: lastRequest?.created_at || null,
  });
}

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getDevicesWithHeartbeats, computeDeviceStatus } from '@/src/lib/supabase-services';

function getSupabase() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Observability feed for the control panel:
 *  - recent interaction timeline (api_usage_log)
 *  - event counts by type
 *  - per-device installed inventory (from heartbeats)
 *
 * GET /api/dashboard/activity
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const [{ data: timeline }, devices] = await Promise.all([
    supabase
      .from('api_usage_log')
      .select('event_type, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    getDevicesWithHeartbeats(userId).catch(() => []),
  ]);

  const event_counts: Record<string, number> = {};
  for (const row of timeline || []) {
    event_counts[row.event_type] = (event_counts[row.event_type] || 0) + 1;
  }

  const deviceInventory = (devices || []).map((d) => ({
    device_name: d.device_name,
    status: computeDeviceStatus(d.heartbeat),
    last_seen_at: d.heartbeat?.updated_at ?? null,
    skills_loaded: d.heartbeat?.skills_loaded ?? 0,
    mcp_servers_connected: d.heartbeat?.mcp_servers_connected ?? 0,
    schedules_count: d.heartbeat?.schedules_count ?? 0,
    active_tasks_count: d.heartbeat?.active_tasks_count ?? 0,
  }));

  return NextResponse.json({
    timeline: timeline || [],
    event_counts,
    devices: deviceInventory,
  });
}

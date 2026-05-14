import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getDevicesWithHeartbeats,
  computeDeviceStatus,
  DEVICE_LIMITS,
} from '@/src/lib/supabase-services';

function getUserPlanFromClaims(sessionClaims: Record<string, unknown> | null): string {
  if (!sessionClaims) return 'free';
  const plaClaim = sessionClaims.pla as string | undefined;
  if (plaClaim) {
    if (plaClaim.includes(':')) {
      const plan = plaClaim.split(':')[1];
      if (plan === 'pro' || plan === 'plus' || plan === 'free') return plan;
    }
    if (plaClaim === 'pro' || plaClaim === 'plus' || plaClaim === 'free') return plaClaim;
  }
  return 'free';
}

export async function GET() {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plan = getUserPlanFromClaims(sessionClaims as Record<string, unknown> | null);
    const devices = await getDevicesWithHeartbeats(userId);

    return NextResponse.json({
      devices: devices.map(d => ({
        id: d.id,
        device_name: d.device_name,
        api_key_suffix: d.api_key_suffix,
        plan: d.plan,
        provider: d.provider,
        is_active: d.is_active,
        created_at: d.created_at,
        last_used_at: d.last_used_at,
        status: computeDeviceStatus(d.heartbeat),
        last_seen_at: d.heartbeat?.updated_at || null,
        hostname: d.heartbeat?.hostname || null,
        platform: d.heartbeat?.platform || null,
        arch: d.heartbeat?.arch || null,
        model: d.heartbeat?.model || null,
        tokens_today_input: d.heartbeat?.tokens_today_input || 0,
        tokens_today_output: d.heartbeat?.tokens_today_output || 0,
        schedules_count: d.heartbeat?.schedules_count || 0,
        active_tasks_count: d.heartbeat?.active_tasks_count || 0,
        skills_loaded: d.heartbeat?.skills_loaded || 0,
      })),
      limit: DEVICE_LIMITS[plan] || 1,
      plan,
    });
  } catch (error) {
    console.error('Error listing devices:', error);
    return NextResponse.json({ error: 'Failed to list devices' }, { status: 500 });
  }
}

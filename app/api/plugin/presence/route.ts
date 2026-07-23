import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getApiKeysByUser, upsertDeviceHeartbeat } from '@/src/lib/supabase-services';

/**
 * Clerk-authenticated presence beacon.
 *
 * The in-browser extension bridge is tab-local: it proves a device is connected
 * in THIS browser, but that signal never reaches the server, so a phone / second
 * device (which can only read the server heartbeat) still sees the device as
 * offline. This route lets a page with a live bridge connection freshen the
 * device's server heartbeat on its behalf — proxying the local liveness signal
 * to the shared store so every surface reads "online".
 *
 * Ownership is enforced via Clerk: the caller may only touch a device
 * (api_key_id) that belongs to their own account. Optional `model` + `stats`
 * (read from the live bridge) seed/refresh the persisted active model and
 * telemetry so remote surfaces (a phone with no bridge) show real numbers, not
 * just a green dot.
 *
 *   POST /api/plugin/presence
 *   (Clerk session)
 *   { api_key_id: string, model?: string, stats?: {
 *       tokens_today_input?, tokens_today_output?, schedules_count?,
 *       active_tasks_count?, skills_loaded?, mcp_servers_connected?,
 *       platform?, arch? } }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const apiKeyId = body?.api_key_id as string | undefined;
  if (!apiKeyId) {
    return NextResponse.json({ error: 'api_key_id is required' }, { status: 400 });
  }

  // Only allow freshening a device the caller actually owns.
  const keys = await getApiKeysByUser(userId);
  const key = keys.find((k) => k.id === apiKeyId);
  if (!key) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const model = typeof body?.model === 'string' ? body.model : undefined;

  // Live telemetry from the bridge, so a phone (heartbeat-only) sees real numbers.
  const s = (body?.stats && typeof body.stats === 'object' ? body.stats : {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const stats = {
    tokens_today_input: num(s.tokens_today_input),
    tokens_today_output: num(s.tokens_today_output),
    schedules_count: num(s.schedules_count),
    active_tasks_count: num(s.active_tasks_count),
    skills_loaded: num(s.skills_loaded),
    mcp_servers_connected: num(s.mcp_servers_connected),
    platform: str(s.platform),
    arch: str(s.arch),
  };
  // Drop undefined so a partial beacon never zeroes out existing values.
  const cleaned = Object.fromEntries(Object.entries(stats).filter(([, v]) => v !== undefined));

  await upsertDeviceHeartbeat(key.id, userId, key.device_name, {
    ...(model ? { model } : {}),
    ...cleaned,
  });

  return NextResponse.json({ ok: true });
}

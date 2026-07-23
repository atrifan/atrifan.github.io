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
 * (api_key_id) that belongs to their own account. Optional `model` seeds/refreshes
 * the persisted active model so remote surfaces show the real one.
 *
 *   POST /api/plugin/presence
 *   (Clerk session)
 *   { api_key_id: string, model?: string }
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

  await upsertDeviceHeartbeat(key.id, userId, key.device_name, {
    ...(model ? { model } : {}),
  });

  return NextResponse.json({ ok: true });
}

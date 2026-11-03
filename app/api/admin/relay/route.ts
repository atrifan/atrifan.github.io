import { NextResponse } from 'next/server';
import { generateRelaySettings, relayStatus } from '@/src/lib/chat-v2/relay-settings';
import { configuredViewerOrigins } from '@/src/lib/chat-v2/http';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { forbidden, sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/relay (admins) → the relay status: where each value comes from, never the values. */
export async function GET(request: Request) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  if (!(await clerkAdmin(userId))) return forbidden();
  return NextResponse.json(await relayStatus(configuredViewerOrigins()), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/admin/relay (admins) → generates and stores all three values → `{ ok, expiresAt }`. */
export async function POST(request: Request) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  if (!(await clerkAdmin(userId))) return forbidden();
  try {
    const { expiresAt } = await generateRelaySettings(userId);
    return NextResponse.json({ ok: true, expiresAt });
  } catch (err) {
    return unavailable('admin/relay', err);
  }
}

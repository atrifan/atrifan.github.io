import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getNotifyStore } from '@/src/lib/notify/notify';
import { resolvePreferences } from '@/src/lib/notify/preferences';
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES, isNotificationType, type NotificationType } from '@/src/lib/notify/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/preferences
 *   → { preferences: [{ type, label, emailEnabled }] } for every notification type.
 * PUT /api/notifications/preferences  body { preferences: { [type]: boolean } } (partial)
 *   → the full list, same shape as GET.
 */

const putSchema = z.object({ preferences: z.record(z.string(), z.boolean()) }).strict();

async function list(userId: string) {
  const resolved = resolvePreferences(await getNotifyStore().getPreferences(userId));
  return NOTIFICATION_TYPES.map((type) => ({ type, label: NOTIFICATION_LABELS[type], emailEnabled: resolved[type] }));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ preferences: await list(userId) });
  } catch (err) {
    console.error('[notify] preferences GET failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body must be { preferences: { [type]: boolean } }' }, { status: 400 });
  }
  const unknown = Object.keys(parsed.data.preferences).filter((t) => !isNotificationType(t));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown notification type: ${unknown.join(', ')}` }, { status: 400 });
  }
  try {
    await getNotifyStore().setPreferences(userId, parsed.data.preferences as Partial<Record<NotificationType, boolean>>);
    return NextResponse.json({ preferences: await list(userId) });
  } catch (err) {
    console.error('[notify] preferences PUT failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}

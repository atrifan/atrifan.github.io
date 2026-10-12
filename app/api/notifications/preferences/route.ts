import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getInAppStore, getNotifyStore } from '@/src/lib/notify/notify';
import { groupTypes, isAdminOnlyGroup, isAdminOnlyType, PREFERENCE_GROUPS } from '@/src/lib/notify/preference-groups';
import { isAdminUserId } from '@/src/lib/admin';
import { resolveInAppPreferences, resolvePreferences } from '@/src/lib/notify/preferences';
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES, isNotificationType, type NotificationType } from '@/src/lib/notify/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/preferences
 *   → { preferences: [{ type, label, emailEnabled, inAppEnabled }], admin } for every notification type the
 *   user can receive: admin-only types (the "Admin" group) are listed for admins only (src/lib/admin.ts).
 * PUT /api/notifications/preferences  body { preferences?: { [type]: boolean }, inApp?: { [groupId]: boolean } }
 *   (partial; email per type, in-app per group of src/lib/notify/preference-groups.ts)
 *   → the full list, same shape as GET. A non-admin changing an admin-only type or group → 403.
 */

const putSchema = z
  .object({ preferences: z.record(z.string(), z.boolean()).optional(), inApp: z.record(z.string(), z.boolean()).optional() })
  .strict()
  .refine((b) => b.preferences !== undefined || b.inApp !== undefined);

/** In-app choices (same table, read over PostgREST); defaults if that read fails, so email settings still load. */
async function inAppChoices(userId: string) {
  try {
    return resolveInAppPreferences(await getInAppStore().getPreferences(userId));
  } catch (err) {
    console.error('[notify] in-app preferences read failed', err instanceof Error ? err.message : String(err));
    return resolveInAppPreferences([]);
  }
}

async function list(userId: string, admin: boolean) {
  const [resolved, inApp] = await Promise.all([getNotifyStore().getPreferences(userId).then(resolvePreferences), inAppChoices(userId)]);
  return NOTIFICATION_TYPES.filter((type) => admin || !isAdminOnlyType(type)).map((type) => ({
    type,
    label: NOTIFICATION_LABELS[type],
    emailEnabled: resolved[type],
    inAppEnabled: inApp[type],
  }));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = await isAdminUserId(userId);
    return NextResponse.json({ preferences: await list(userId, admin), admin });
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
    return NextResponse.json({ error: 'Body must be { preferences?: { [type]: boolean }, inApp?: { [group]: boolean } }' }, { status: 400 });
  }
  const email = parsed.data.preferences ?? {};
  const inApp = parsed.data.inApp ?? {};
  const unknown = Object.keys(email).filter((t) => !isNotificationType(t));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown notification type: ${unknown.join(', ')}` }, { status: 400 });
  }
  const unknownGroups = Object.keys(inApp).filter((g) => !PREFERENCE_GROUPS.some((x) => x.id === g));
  if (unknownGroups.length) {
    return NextResponse.json({ error: `Unknown notification group: ${unknownGroups.join(', ')}` }, { status: 400 });
  }
  const admin = await isAdminUserId(userId);
  if (!admin && (Object.keys(email).some(isAdminOnlyType) || Object.keys(inApp).some(isAdminOnlyGroup))) {
    return NextResponse.json({ error: 'admin_only', message: 'Only admins can change admin notifications.' }, { status: 403 });
  }
  try {
    if (Object.keys(email).length) await getNotifyStore().setPreferences(userId, email as Partial<Record<NotificationType, boolean>>);
    for (const [group, enabled] of Object.entries(inApp)) await getInAppStore().setInAppPreferences(userId, groupTypes(group), enabled);
    return NextResponse.json({ preferences: await list(userId, admin), admin });
  } catch (err) {
    console.error('[notify] preferences PUT failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}

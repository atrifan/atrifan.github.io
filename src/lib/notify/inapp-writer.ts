import { inAppDedupeKey, planInAppWrite } from './inapp.ts';
import type { InAppStore } from './inapp-store.ts';
import { gateInApp } from './preferences.ts';
import type { NotificationType, Payload } from './types.ts';

export type InAppResult =
  | { status: 'inserted'; id: string }
  | { status: 'bumped'; id: string }
  | { status: 'duplicate' }
  | { status: 'muted' }
  | { status: 'conflict' };

const ATTEMPTS = 3;

/**
 * Write one event to the in-app feed: respects the user's in-app switch, dedupes on the
 * in-app key and bumps aggregates. Concurrent writers can race on an aggregate; a lost
 * insert or bump re-reads and retries (optimistic, on the stored count), up to 3 times.
 */
export async function writeInApp<T extends NotificationType>(
  store: InAppStore,
  event: { userId: string; type: T; payload: Payload<T>; dedupeKey: string },
  now: Date = new Date(),
): Promise<InAppResult> {
  if (!gateInApp(await store.getPreferences(event.userId), event.type)) return { status: 'muted' };
  const dedupeKey = inAppDedupeKey(event.userId, event.type, event.payload as Record<string, unknown>, event.dedupeKey, now);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const existing = await store.findByDedupe(dedupeKey);
    const plan = planInAppWrite(existing, { ...event, dedupeKey }, now);
    if (plan.kind === 'skip') return { status: 'duplicate' };
    if (plan.kind === 'insert') {
      const inserted = await store.insert(plan.row, now.toISOString());
      if (inserted) return { status: 'inserted', id: inserted.id };
      continue;
    }
    if (await store.bump(plan.id, plan.expectedCount, plan.patch)) return { status: 'bumped', id: plan.id };
  }
  return { status: 'conflict' };
}

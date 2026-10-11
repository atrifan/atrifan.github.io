/**
 * Gigs emails through src/lib/notify. Sending is best effort: an email that can't be queued
 * never fails the action that triggered it.
 */
import { enqueue, type NotificationType, type PayloadInput } from '@/src/lib/notify';

export async function notifyUser<T extends NotificationType>(
  userId: string,
  type: T,
  payload: PayloadInput<T>,
  dedupeKey: string,
): Promise<void> {
  try {
    await enqueue(userId, type, payload, dedupeKey);
  } catch (err) {
    console.error(`[jobs] could not queue ${type} for ${dedupeKey}:`, err instanceof Error ? err.message : err);
  }
}

/** Short excerpt for an email quote. */
export function excerpt(text: string, max = 500): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

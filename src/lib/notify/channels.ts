import type { EnqueueResult, Notifier } from './notifier.ts';
import type { InAppStore } from './inapp-store.ts';
import { writeInApp, type InAppResult } from './inapp-writer.ts';
import { isNotificationType, parsePayload, type NotificationType, type PayloadInput } from './types.ts';

/**
 * The one entry point behind `enqueue()`: every event goes to both channels.
 *
 * - in-app: written first (src/lib/notify/inapp-writer.ts), unless the user switched it off;
 * - email: queued in the outbox and sent through the Notifier (src/lib/notify/notifier.ts),
 *   gated by contact and email preferences.
 *
 * The channels are independent: either can be unconfigured or down without affecting the
 * other or the caller. Programmer errors (unknown type, bad payload, empty key) still throw.
 */

export type EmailOutcome = EnqueueResult | { status: 'error'; id: null; error: string };
export type InAppOutcome = InAppResult | { status: 'error'; error: string };
export type ChannelsResult = EmailOutcome & { inApp: InAppOutcome };

export interface ChannelDeps {
  /** null when email isn't configured (no Resend key / outbox URL). */
  notifier: () => Notifier | null;
  /** null when the in-app store isn't configured. */
  inApp: () => InAppStore | null;
  now?: () => Date;
  log?: (message: string, ...rest: unknown[]) => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isProgrammerError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'ZodError' || err.message.startsWith('enqueue:'));
}

export function createEnqueue(deps: ChannelDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string, ...rest: unknown[]) => console.error(m, ...rest));

  return async function enqueue<T extends NotificationType>(userId: string, type: T, payload: PayloadInput<T>, dedupeKey: string): Promise<ChannelsResult> {
    if (!isNotificationType(type)) throw new Error(`enqueue: unknown notification type ${String(type)}`);
    if (!userId) throw new Error('enqueue: userId is required');
    if (!dedupeKey) throw new Error('enqueue: dedupeKey is required');
    const parsed = parsePayload(type, payload);

    let inApp: InAppOutcome;
    try {
      const store = deps.inApp();
      inApp = store ? await writeInApp(store, { userId, type, payload: parsed, dedupeKey }, now()) : { status: 'error', error: 'in-app notifications are not configured' };
    } catch (err) {
      log('[notify] in-app write failed', type, dedupeKey, message(err));
      inApp = { status: 'error', error: message(err) };
    }

    const notifier = deps.notifier();
    if (!notifier) return { status: 'error', id: null, error: 'notifications are not configured', inApp };
    try {
      return { ...(await notifier.enqueue(userId, type, payload, dedupeKey)), inApp };
    } catch (err) {
      if (isProgrammerError(err)) throw err;
      log('[notify] enqueue failed', type, dedupeKey, message(err));
      return { status: 'error', id: null, error: message(err), inApp };
    }
  };
}

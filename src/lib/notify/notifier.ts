import type { BackoffOptions } from './backoff.ts';
import { gateNotification, type SkipReason } from './preferences.ts';
import type { NotifyStore } from './store.ts';
import { renderEmail } from './templates/index.ts';
import { signUnsubscribeToken } from './token.ts';
import { SEND_BACKOFF, SEND_RETRIES, sendWithRetry, type EmailTransport } from './transport.ts';
import { isNotificationType, parsePayload, type NotificationRow, type NotificationType, type PayloadInput } from './types.ts';
import { appUrl } from './urls.ts';

export interface NotifierDeps {
  store: NotifyStore;
  transport: EmailTransport;
  from: string;
  unsubscribeSecret: string;
  /**
   * Keeps the send running after the response without blocking the caller (waitUntil in prod). The send
   * starts either way; without a hook (or when it throws) it just isn't tied to the request's lifetime.
   */
  schedule?: (work: Promise<unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
  /** Inline retries after the first send, for transient errors. Default 3. */
  sendRetries?: number;
  /** Waits between inline retries. Default 0.5s, 2s, 5s. */
  sendBackoff?: BackoffOptions;
  /** How long a claimed row is hidden from a second deliver(). */
  leaseMs?: number;
}

export type EnqueueResult =
  | { status: 'queued'; id: string }
  | { status: 'skipped'; id: string; reason: SkipReason }
  | { status: 'duplicate'; id: null };

export type DeliverResult = 'sent' | 'skipped' | 'failed' | 'not_claimed';

export interface Notifier {
  enqueue<T extends NotificationType>(
    userId: string,
    type: T,
    payload: PayloadInput<T>,
    dedupeKey: string,
  ): Promise<EnqueueResult>;
  deliver(id: string): Promise<DeliverResult>;
}

export function unsubscribeUrl(userId: string, type: NotificationType, secret: string): string {
  const token = signUnsubscribeToken({ userId, type }, secret);
  return appUrl('hub', `/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`);
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const {
    store,
    transport,
    from,
    unsubscribeSecret,
    schedule,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    sendRetries = SEND_RETRIES,
    sendBackoff = SEND_BACKOFF,
    leaseMs = 120_000,
  } = deps;

  async function send(row: NotificationRow): Promise<DeliverResult> {
    try {
      if (!isNotificationType(row.type)) {
        await store.markFailed(row.id, `unknown type ${String(row.type)}`);
        return 'failed';
      }
      const [contact, prefs] = await Promise.all([store.getContact(row.userId), store.getPreferences(row.userId)]);
      const gate = gateNotification(contact, prefs, row.type);
      if (!gate.send || !contact?.email) {
        await store.markSkipped(row.id, gate.send ? 'no_email' : gate.reason);
        return 'skipped';
      }
      const unsub = unsubscribeUrl(row.userId, row.type, unsubscribeSecret);
      const email = renderEmail(row.type, parsePayload(row.type, row.payload), {
        recipientName: contact.name,
        unsubscribeUrl: unsub,
        preferencesUrl: appUrl('hub', '/profile'),
      });
      const result = await sendWithRetry(
        transport,
        {
          from,
          to: contact.email as string,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          idempotencyKey: row.id,
        },
        { retries: sendRetries, backoff: sendBackoff, sleep },
      );
      await store.markSent(row.id, result.id);
      return 'sent';
    } catch (err) {
      // Inline retries are the only retries: nothing polls the outbox, so a row that didn't go out is failed.
      await store.markFailed(row.id, errorMessage(err));
      return 'failed';
    }
  }

  async function deliver(id: string): Promise<DeliverResult> {
    const row = await store.claimById(id, leaseMs);
    return row ? send(row) : 'not_claimed';
  }

  return {
    async enqueue(userId, type, payload, dedupeKey) {
      if (!userId) throw new Error('enqueue: userId is required');
      if (!dedupeKey) throw new Error('enqueue: dedupeKey is required');
      if (!isNotificationType(type)) throw new Error(`enqueue: unknown notification type ${String(type)}`);
      const parsed = parsePayload(type, payload) as Record<string, unknown>;

      const [contact, prefs] = await Promise.all([store.getContact(userId), store.getPreferences(userId)]);
      const gate = gateNotification(contact, prefs, type);
      const row = await store.insertNotification({
        userId,
        type,
        payload: parsed,
        dedupeKey,
        status: gate.send ? 'queued' : 'skipped',
        lastError: gate.send ? null : gate.reason,
      });
      if (!row) return { status: 'duplicate', id: null };
      if (!gate.send) return { status: 'skipped', id: row.id, reason: gate.reason };

      // Send now, in this request. The promise runs whether or not the hook takes it.
      const work = deliver(row.id).catch((err) => console.error('[notify] deliver failed', row.id, errorMessage(err)));
      try {
        schedule?.(work);
      } catch (err) {
        console.warn('[notify] schedule failed; sending without waitUntil', errorMessage(err));
      }
      return { status: 'queued', id: row.id };
    },

    deliver,
  };
}

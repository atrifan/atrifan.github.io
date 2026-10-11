import { backoffDelay, withRetry, type BackoffOptions } from './backoff.ts';
import { gateNotification, type SkipReason } from './preferences.ts';
import type { NotifyStore } from './store.ts';
import { renderEmail } from './templates/index.ts';
import { signUnsubscribeToken } from './token.ts';
import { isRetryableError, type EmailTransport } from './transport.ts';
import { isNotificationType, parsePayload, type NotificationRow, type NotificationType, type PayloadInput } from './types.ts';
import { appUrl } from './urls.ts';

export interface NotifierDeps {
  store: NotifyStore;
  transport: EmailTransport;
  from: string;
  unsubscribeSecret: string;
  /** Runs delivery after enqueue without blocking the caller (waitUntil in prod). */
  schedule?: (work: Promise<unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Total delivery attempts across in-process and cron runs before a row is `failed`. */
  maxAttempts?: number;
  /** Quick in-process retries per attempt for transient errors. */
  sendRetries?: number;
  sendBackoff?: BackoffOptions;
  /** Delay before the cron picks a failed attempt up again. */
  outboxBackoff?: BackoffOptions;
  /** How long a claimed row is hidden from other workers. */
  leaseMs?: number;
}

export type EnqueueResult =
  | { status: 'queued'; id: string }
  | { status: 'skipped'; id: string; reason: SkipReason }
  | { status: 'duplicate'; id: null };

export type DeliverResult = 'sent' | 'skipped' | 'retry' | 'failed' | 'not_claimed';

export interface DispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retry: number;
  failed: number;
}

export interface Notifier {
  enqueue<T extends NotificationType>(
    userId: string,
    type: T,
    payload: PayloadInput<T>,
    dedupeKey: string,
  ): Promise<EnqueueResult>;
  deliver(id: string): Promise<DeliverResult>;
  dispatch(limit?: number): Promise<DispatchSummary>;
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
    now = () => new Date(),
    maxAttempts = 5,
    sendRetries = 2,
    sendBackoff = { baseMs: 500, factor: 2, maxMs: 4000 },
    outboxBackoff = { baseMs: 60_000, factor: 5, maxMs: 6 * 3_600_000 },
    leaseMs = 120_000,
  } = deps;

  async function send(row: NotificationRow): Promise<DeliverResult> {
    try {
      if (!isNotificationType(row.type)) {
        await store.markFailed(row.id, `unknown type ${String(row.type)}`, null);
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
      const result = await withRetry(
        () =>
          transport.send({
            from,
            to: contact.email as string,
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            idempotencyKey: row.id,
          }),
        { retries: sendRetries, backoff: sendBackoff, sleep, isRetryable: isRetryableError },
      );
      await store.markSent(row.id, result.id);
      return 'sent';
    } catch (err) {
      const terminal = !isRetryableError(err) || row.attempts >= maxAttempts;
      const retryAt = terminal ? null : new Date(now().getTime() + backoffDelay(row.attempts, outboxBackoff));
      await store.markFailed(row.id, errorMessage(err), retryAt);
      return terminal ? 'failed' : 'retry';
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

      if (schedule) {
        const work = deliver(row.id).catch((err) => console.error('[notify] deliver failed', row.id, errorMessage(err)));
        try {
          schedule(work);
        } catch (err) {
          console.warn('[notify] schedule failed; the cron will deliver', errorMessage(err));
        }
      }
      return { status: 'queued', id: row.id };
    },

    deliver,

    async dispatch(limit = 50) {
      const rows = await store.claimDue(limit, leaseMs);
      const summary: DispatchSummary = { claimed: rows.length, sent: 0, skipped: 0, retry: 0, failed: 0 };
      for (const row of rows) {
        const outcome = await send(row);
        if (outcome !== 'not_claimed') summary[outcome] += 1;
      }
      return summary;
    },
  };
}

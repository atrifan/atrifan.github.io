import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, type NotifierDeps } from '../../../src/lib/notify/notifier.ts';
import { MemoryNotifyStore } from '../../../src/lib/notify/memory-store.ts';
import { MemoryTransport, TransportError } from '../../../src/lib/notify/transport.ts';
import { verifyUnsubscribeToken } from '../../../src/lib/notify/token.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

const SECRET = 'unit-secret-0123456789abcdef0123456789';

function setup(overrides: Partial<NotifierDeps> = {}) {
  let clock = Date.parse('2026-10-11T12:00:00Z');
  const store = new MemoryNotifyStore(() => clock);
  const transport = new MemoryTransport();
  const scheduled: Promise<unknown>[] = [];
  const sleeps: number[] = [];
  const notifier = createNotifier({
    store,
    transport,
    from: 'Tulzo <notifications@tulzo.online>',
    unsubscribeSecret: SECRET,
    schedule: (p) => void scheduled.push(p),
    sleep: async (ms) => void sleeps.push(ms),
    now: () => new Date(clock),
    maxAttempts: 3,
    sendRetries: 2,
    sendBackoff: { baseMs: 10, factor: 2, maxMs: 100 },
    outboxBackoff: { baseMs: 60_000, factor: 5, maxMs: 3_600_000 },
    leaseMs: 120_000,
    ...overrides,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { store, transport, scheduled, sleeps, notifier, advance };
}

async function withContact(s: ReturnType<typeof setup>, userId = 'u1') {
  await s.store.upsertContact({ userId, email: `${userId}@example.com`, name: 'Ana', locale: null, emailVerified: true });
}

test('enqueue for a subscribed contact queues and schedules immediate delivery', async () => {
  const s = setup();
  await withContact(s);
  const result = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  assert.equal(result.status, 'queued');
  assert.equal(s.scheduled.length, 1);
  await Promise.all(s.scheduled);
  assert.equal(s.transport.sent.length, 1);
  const row = s.store.rows[0];
  assert.equal(row.status, 'sent');
  assert.equal(row.providerMessageId, 'mem_1');
  assert.ok(row.sentAt);
});

test('the sent message carries recipient, subject and RFC 8058 unsubscribe headers', async () => {
  const s = setup();
  await withContact(s);
  await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  await Promise.all(s.scheduled);
  const msg = s.transport.sent[0];
  assert.equal(msg.to, 'u1@example.com');
  assert.equal(msg.from, 'Tulzo <notifications@tulzo.online>');
  assert.ok(msg.subject.length > 0);
  assert.equal(msg.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const match = /^<(https:\/\/[^>]+\/api\/notifications\/unsubscribe\?token=([^>]+))>$/.exec(msg.headers['List-Unsubscribe']);
  assert.ok(match, msg.headers['List-Unsubscribe']);
  assert.deepEqual(verifyUnsubscribeToken(decodeURIComponent(match[2]), SECRET), { userId: 'u1', type: 'bid_received' });
  assert.ok(msg.html.includes(match[1].replace(/&/g, '&amp;')), 'html links the same unsubscribe url');
  assert.equal(msg.idempotencyKey, s.store.rows[0].id);
});

test('an unsubscribed type is recorded as skipped and nothing is sent', async () => {
  const s = setup();
  await withContact(s);
  await s.store.setPreferences('u1', { bid_received: false });
  const result = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  assert.deepEqual(result, { status: 'skipped', id: s.store.rows[0].id, reason: 'unsubscribed' });
  assert.equal(s.store.rows[0].status, 'skipped');
  assert.equal(s.scheduled.length, 0);
  await s.notifier.dispatch();
  assert.equal(s.transport.sent.length, 0);
});

test('a user with no contact is skipped', async () => {
  const s = setup();
  const result = await s.notifier.enqueue('ghost', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.equal(result.status, 'skipped');
  assert.equal(result.status === 'skipped' && result.reason, 'no_contact');
});

test('the same dedupe key never enqueues twice', async () => {
  const s = setup();
  await withContact(s);
  const first = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  const second = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  assert.equal(first.status, 'queued');
  assert.deepEqual(second, { status: 'duplicate', id: null });
  assert.equal(s.store.rows.length, 1);
  assert.equal(s.scheduled.length, 1);
  await Promise.all(s.scheduled);
  await s.notifier.dispatch();
  assert.equal(s.transport.sent.length, 1);
});

test('dedupe also applies to skipped rows', async () => {
  const s = setup();
  await withContact(s);
  await s.store.setPreferences('u1', { bid_received: false });
  await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  await s.store.setPreferences('u1', { bid_received: true });
  const again = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  assert.equal(again.status, 'duplicate');
});

test('an invalid payload throws and stores nothing', async () => {
  const s = setup();
  await withContact(s);
  await assert.rejects(
    // @ts-expect-error deliberately wrong payload
    s.notifier.enqueue('u1', 'bid_received', { jobId: 'j' }, 'bid:bad'),
  );
  await assert.rejects(s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, ''));
  assert.equal(s.store.rows.length, 0);
});

test('transient send failures are retried in-process with backoff', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(new TransportError('503', true, 503), new TransportError('429', true, 429));
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  assert.equal(s.transport.sent.length, 1);
  assert.deepEqual(s.sleeps, [10, 20]);
  assert.equal(s.store.rows[0].status, 'sent');
});

test('when in-process retries run out the row is rescheduled, then sent by a later dispatch', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(...[1, 2, 3].map(() => new TransportError('503', true, 503)));
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  const row = s.store.rows[0];
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
  assert.match(row.lastError ?? '', /503/);

  // Not due yet: the first outbox backoff is one minute.
  assert.equal((await s.notifier.dispatch()).claimed, 0);
  s.advance(60_000);
  const summary = await s.notifier.dispatch();
  assert.deepEqual(summary, { claimed: 1, sent: 1, skipped: 0, retry: 0, failed: 0 });
  assert.equal(row.status, 'sent');
  assert.equal(row.attempts, 2);
});

test('outbox backoff grows between dispatch attempts and the row fails after maxAttempts', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(...Array.from({ length: 9 }, () => new TransportError('503', true, 503)));
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  const row = s.store.rows[0];
  assert.equal(row.status, 'queued');

  s.advance(60_000);
  assert.equal((await s.notifier.dispatch()).retry, 1);
  assert.equal(row.attempts, 2);
  // Second outbox delay is 5 minutes, so 4 minutes later it is still not due.
  s.advance(4 * 60_000);
  assert.equal((await s.notifier.dispatch()).claimed, 0);
  s.advance(60_000);
  const last = await s.notifier.dispatch();
  assert.equal(last.failed, 1);
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 3);
  s.advance(10 * 3_600_000);
  assert.equal((await s.notifier.dispatch()).claimed, 0);
});

test('a non-retryable provider error fails the row at once without retries', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(new TransportError('422 invalid from', false, 422));
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  assert.equal(s.store.rows[0].status, 'failed');
  assert.deepEqual(s.sleeps, []);
  assert.match(s.store.rows[0].lastError ?? '', /422/);
});

test('a user who unsubscribes before delivery is skipped at send time', async () => {
  const s = setup({ schedule: undefined });
  await withContact(s);
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await s.store.setPreferences('u1', { job_posted: false });
  const summary = await s.notifier.dispatch();
  assert.equal(summary.skipped, 1);
  assert.equal(s.store.rows[0].status, 'skipped');
  assert.equal(s.transport.sent.length, 0);
});

test('a leased row is not delivered twice by an overlapping dispatch', async () => {
  const s = setup({ schedule: undefined });
  await withContact(s);
  const r = await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.ok(r.id);
  const [a, b] = await Promise.all([s.notifier.deliver(r.id), s.notifier.dispatch()]);
  assert.equal(a, 'sent');
  assert.equal(b.claimed, 0);
  assert.equal(s.transport.sent.length, 1);
  assert.equal(await s.notifier.deliver(r.id), 'not_claimed');
});

test('dispatch respects the limit', async () => {
  const s = setup({ schedule: undefined });
  await withContact(s);
  for (let i = 0; i < 5; i++) await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, `job:${i}`);
  assert.equal((await s.notifier.dispatch(2)).sent, 2);
  assert.equal((await s.notifier.dispatch(10)).sent, 3);
});

test('a schedule hook that throws does not fail enqueue', async () => {
  const s = setup({
    schedule: () => {
      throw new Error('no request context');
    },
  });
  await withContact(s);
  const r = await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.equal(r.status, 'queued');
});

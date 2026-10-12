import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, type NotifierDeps } from '../../../src/lib/notify/notifier.ts';
import { MemoryNotifyStore } from '../../../src/lib/notify/memory-store.ts';
import { MemoryTransport, TransportError } from '../../../src/lib/notify/transport.ts';
import { verifyUnsubscribeToken } from '../../../src/lib/notify/token.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

const SECRET = 'unit-secret-0123456789abcdef0123456789';

function setup(overrides: Partial<NotifierDeps> = {}) {
  const clock = Date.parse('2026-10-11T12:00:00Z');
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
    leaseMs: 120_000,
    ...overrides,
  });
  return { store, transport, scheduled, sleeps, notifier };
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

const transient = () => new TransportError('503 unavailable', true, 503);

test('transient send failures are retried inline after 0.5s, 2s and 5s, then sent once', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(transient(), new TransportError('429', true, 429), transient());
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  assert.equal(s.transport.sent.length, 1);
  assert.deepEqual(s.sleeps, [500, 2000, 5000]);
  assert.equal(s.store.rows[0].status, 'sent');
  assert.equal(s.store.rows[0].attempts, 1);
});

test('when every inline attempt fails the row ends failed with last_error, not queued for a poller', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(transient(), transient(), transient(), transient(), transient());
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  const row = s.store.rows[0];
  assert.equal(s.transport.sent.length, 0);
  assert.deepEqual(s.sleeps, [500, 2000, 5000]);
  assert.equal(row.status, 'failed');
  assert.match(row.lastError ?? '', /503 unavailable/);
  assert.equal(await s.notifier.deliver(row.id), 'not_claimed');
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

test('every inline retry reuses the row id as the idempotency key', async () => {
  const s = setup();
  await withContact(s);
  const attempts: (string | undefined)[] = [];
  const send = s.transport.send.bind(s.transport);
  s.transport.send = async (m) => {
    attempts.push(m.idempotencyKey);
    return send(m);
  };
  s.transport.failNext(transient(), transient());
  const r = await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await Promise.all(s.scheduled);
  assert.deepEqual(attempts, [r.id, r.id, r.id]);
});

test('a repeat of the same action while a send is retrying is a duplicate and sends nothing more', async () => {
  const s = setup();
  await withContact(s);
  s.transport.failNext(transient());
  const first = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  const again = await s.notifier.enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:b1');
  await Promise.all(s.scheduled);
  assert.equal(first.status, 'queued');
  assert.deepEqual(again, { status: 'duplicate', id: null });
  assert.equal(s.transport.sent.length, 1);
});

test('a row is delivered once even if delivery is started twice', async () => {
  const s = setup();
  await withContact(s);
  const r = await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.ok(r.id);
  const [scheduled, extra] = await Promise.all([Promise.all(s.scheduled), s.notifier.deliver(r.id)]);
  assert.equal(scheduled.length, 1);
  assert.equal(extra, 'not_claimed');
  assert.equal(s.transport.sent.length, 1);
});

test('without a schedule hook the email still goes out right away', async () => {
  const s = setup({ schedule: undefined });
  await withContact(s);
  await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  await waitFor(() => s.store.rows[0]?.status === 'sent');
  assert.equal(s.transport.sent.length, 1);
});

test('a schedule hook that throws does not fail enqueue, and the email still goes out', async () => {
  const s = setup({
    schedule: () => {
      throw new Error('no request context');
    },
  });
  await withContact(s);
  const r = await s.notifier.enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.equal(r.status, 'queued');
  await waitFor(() => s.store.rows[0]?.status === 'sent');
  assert.equal(s.transport.sent.length, 1);
});

test('the notifier has no outbox drain any more', () => {
  const s = setup();
  assert.equal('dispatch' in s.notifier, false);
});

async function waitFor(done: () => boolean, ms = 1000): Promise<void> {
  const until = Date.now() + ms;
  while (!done()) {
    if (Date.now() > until) assert.fail('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

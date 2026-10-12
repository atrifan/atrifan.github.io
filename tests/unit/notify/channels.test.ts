import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnqueue } from '../../../src/lib/notify/channels.ts';
import { MemoryInAppStore } from '../../../src/lib/notify/inapp-memory-store.ts';
import { MemoryNotifyStore } from '../../../src/lib/notify/memory-store.ts';
import { createNotifier } from '../../../src/lib/notify/notifier.ts';
import { MemoryTransport } from '../../../src/lib/notify/transport.ts';
import { SAMPLE_PAYLOADS } from './samples.ts';

function setup() {
  const store = new MemoryNotifyStore();
  const inApp = new MemoryInAppStore();
  const transport = new MemoryTransport();
  const notifier = createNotifier({ store, transport, from: 'Tulzo <n@tulzo.test>', unsubscribeSecret: 'x'.repeat(32), sleep: async () => undefined });
  const logs: string[] = [];
  const deps = { notifier: () => notifier, inApp: () => inApp, now: () => new Date('2026-10-12T10:00:00Z'), log: (m: string) => void logs.push(m) };
  return { store, inApp, transport, deps, logs };
}

test('one enqueue writes the in-app item and the email outbox row', async () => {
  const s = setup();
  await s.store.upsertContact({ userId: 'u1', email: 'u1@x.test', name: 'U', locale: null, emailVerified: true });
  const r = await createEnqueue(s.deps)('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:1');
  assert.equal(r.status, 'queued');
  assert.equal(r.inApp.status, 'inserted');
  assert.equal(s.store.rows.length, 1);
  assert.equal(s.inApp.rows.length, 1);
  assert.equal(s.inApp.rows[0].userId, 'u1');
});

test('in-app is written even when email is skipped (no contact) or not configured', async () => {
  const s = setup();
  const skipped = await createEnqueue(s.deps)('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.inApp.status, 'inserted');
  const noEmail = await createEnqueue({ ...s.deps, notifier: () => null })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:2');
  assert.equal(noEmail.status, 'error');
  assert.equal(noEmail.inApp.status, 'inserted');
  assert.equal(s.inApp.rows.length, 2);
});

test('an in-app failure is logged and never stops the email', async () => {
  const s = setup();
  await s.store.upsertContact({ userId: 'u1', email: 'u1@x.test', name: 'U', locale: null, emailVerified: true });
  const broken = { ...s.inApp, getPreferences: async () => { throw new Error('db down'); } } as unknown as MemoryInAppStore;
  const r = await createEnqueue({ ...s.deps, inApp: () => broken })('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:1');
  assert.equal(r.status, 'queued');
  assert.deepEqual(r.inApp, { status: 'error', error: 'db down' });
  assert.ok(s.logs.some((l) => l.includes('in-app write failed')));
  const unconfigured = await createEnqueue({ ...s.deps, inApp: () => null })('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:2');
  assert.equal(unconfigured.inApp.status, 'error');
});

test('an outbox failure is logged and reported, the in-app item stays', async () => {
  const s = setup();
  const failing = { enqueue: async () => { throw new Error('pg down'); }, deliver: async () => 'failed' as const, dispatch: async () => ({ claimed: 0, sent: 0, skipped: 0, retry: 0, failed: 0 }) };
  const r = await createEnqueue({ ...s.deps, notifier: () => failing })('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:1');
  assert.deepEqual({ status: r.status, error: (r as { error?: string }).error }, { status: 'error', error: 'pg down' });
  assert.equal(r.inApp.status, 'inserted');
  assert.ok(s.logs.some((l) => l.includes('enqueue failed')));
});

test('package installs: in-app aggregates per hour, and no email by default', async () => {
  const s = setup();
  await s.store.upsertContact({ userId: 'pub', email: 'p@x.test', name: 'P', locale: null, emailVerified: true });
  const enqueue = createEnqueue(s.deps);
  for (let i = 0; i < 4; i++) await enqueue('pub', 'package_installed', SAMPLE_PAYLOADS.package_installed, `package_installed:fx:${i}`);
  assert.equal(s.inApp.rows.length, 1);
  assert.equal(s.inApp.rows[0].count, 4);
  assert.ok(s.store.rows.every((r) => r.status === 'skipped' && r.lastError === 'unsubscribed'));
  assert.equal(s.transport.sent.length, 0);
});

test('respects the in-app switch and the email switch independently', async () => {
  const s = setup();
  await s.store.upsertContact({ userId: 'u1', email: 'u1@x.test', name: 'U', locale: null, emailVerified: true });
  await s.inApp.setInAppPreferences('u1', ['bid_received'], false);
  await s.store.setPreferences('u1', { job_posted: false });
  const enqueue = createEnqueue(s.deps);
  const bid = await enqueue('u1', 'bid_received', SAMPLE_PAYLOADS.bid_received, 'bid:1');
  assert.equal(bid.inApp.status, 'muted');
  assert.equal(bid.status, 'queued');
  const job = await enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'job:1');
  assert.equal(job.inApp.status, 'inserted');
  assert.equal(job.status, 'skipped');
});

test('programmer errors still throw and write nothing', async () => {
  const s = setup();
  const enqueue = createEnqueue(s.deps);
  await assert.rejects(enqueue('u1', 'nope' as never, {} as never, 'k'), /unknown notification type/);
  await assert.rejects(enqueue('', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'k'), /userId is required/);
  await assert.rejects(enqueue('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, ''), /dedupeKey is required/);
  await assert.rejects(enqueue('u1', 'bid_received', { jobId: 'j' } as never, 'k'));
  assert.equal(s.inApp.rows.length, 0);
  assert.equal(s.store.rows.length, 0);
});

const throwingNotifier = (err: unknown) => ({
  enqueue: async () => {
    throw err;
  },
  deliver: async () => 'failed' as const,
  dispatch: async () => ({ claimed: 0, sent: 0, skipped: 0, retry: 0, failed: 0 }),
});

test('a programmer error raised inside the email notifier is rethrown, anything else is reported', async () => {
  const s = setup();
  const zod = Object.assign(new Error('bad payload'), { name: 'ZodError' });
  await assert.rejects(createEnqueue({ ...s.deps, notifier: () => throwingNotifier(zod) })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'a'), /bad payload/);
  await assert.rejects(createEnqueue({ ...s.deps, notifier: () => throwingNotifier(new Error('enqueue: nope')) })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'b'), /enqueue: nope/);
  const other = await createEnqueue({ ...s.deps, notifier: () => throwingNotifier(new Error('xenqueue: not ours')) })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'c');
  assert.deepEqual({ status: other.status, error: (other as { error?: string }).error }, { status: 'error', error: 'xenqueue: not ours' });
  const r = await createEnqueue({ ...s.deps, notifier: () => throwingNotifier('boom') })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'd');
  assert.equal((r as { error?: string }).error, 'boom');
});

test('without email configured the result says so; without in-app configured too', async () => {
  const s = setup();
  const r = await createEnqueue({ ...s.deps, notifier: () => null, inApp: () => null })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'k');
  assert.deepEqual(r, { status: 'error', id: null, error: 'notifications are not configured', inApp: { status: 'error', error: 'in-app notifications are not configured' } });
});

test('defaults: the real clock stamps in-app rows and failures go to console.error', async () => {
  const s = setup();
  const { now: _now, log: _log, ...deps } = s.deps;
  const started = Date.now();
  await createEnqueue(deps)('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'k');
  const stamped = Date.parse(s.inApp.rows[0].createdAt);
  assert.ok(stamped >= started - 1000 && stamped <= Date.now() + 1000);
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const broken = { ...s.inApp, getPreferences: async () => { throw new Error('db down'); } } as unknown as MemoryInAppStore;
    await createEnqueue({ ...deps, inApp: () => broken })('u1', 'job_posted', SAMPLE_PAYLOADS.job_posted, 'k2');
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((a) => a[0] === '[notify] in-app write failed' && a.includes('k2') && a.includes('db down')));
});

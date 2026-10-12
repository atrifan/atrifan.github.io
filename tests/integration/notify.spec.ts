/**
 * Integration tests for email notifications against a real Postgres, in a throwaway schema.
 *
 * Run: npm run test:integration:notify
 * Needs STORAGE_POSTGRES_URL_NON_POOLING (.env.local). Creates `test_notify_<random>`, applies
 * supabase/migrations/20261102_notifications.sql inside it, and drops it afterwards.
 * Email goes through an in-memory transport; nothing is sent.
 */
import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Webhook } from 'svix';
import { NextRequest } from 'next/server';
import { createNotifier } from '../../src/lib/notify/notifier';
import { PgNotifyStore } from '../../src/lib/notify/pg-store';
import { MemoryTransport } from '../../src/lib/notify/transport';
import { signUnsubscribeToken } from '../../src/lib/notify/token';

const DB_URL = process.env.STORAGE_POSTGRES_URL_NON_POOLING;
const SCHEMA = `test_notify_${randomBytes(4).toString('hex')}`;
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('base64')}`;
const UNSUB_SECRET = randomBytes(32).toString('hex');

test.describe.configure({ mode: 'serial' });
test.skip(!DB_URL, 'STORAGE_POSTGRES_URL_NON_POOLING not set');

let pool: Pool;
let store: PgNotifyStore;

function pgUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  return u.toString();
}

test.beforeAll(async () => {
  pool = new Pool({ connectionString: pgUrl(DB_URL as string), ssl: { rejectUnauthorized: false }, max: 4 });
  const migration = readFileSync(join(__dirname, '../../supabase/migrations/20261102_notifications.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(`create schema "${SCHEMA}"`);
    await client.query(`set search_path to "${SCHEMA}"`);
    await client.query(migration);
    await client.query('reset search_path');
  } finally {
    client.release();
  }
  store = new PgNotifyStore(pool, SCHEMA);

  // The routes read these at import/call time.
  process.env.STORAGE_POSTGRES_URL_NON_POOLING = DB_URL;
  process.env.NOTIFY_DB_SCHEMA = SCHEMA;
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NOTIFY_UNSUBSCRIBE_SECRET = UNSUB_SECRET;
});

test.afterAll(async () => {
  if (!pool) return;
  await pool.query(`drop schema if exists "${SCHEMA}" cascade`);
  await pool.end();
});

function makeNotifier(transport = new MemoryTransport()) {
  const scheduled: Promise<unknown>[] = [];
  const notifier = createNotifier({
    store,
    transport,
    from: 'Tulzo <notifications@tulzo.online>',
    unsubscribeSecret: UNSUB_SECRET,
    schedule: (p) => void scheduled.push(p),
    sleep: async () => undefined,
  });
  return { notifier, transport, scheduled };
}

async function addContact(userId: string) {
  await store.upsertContact({ userId, email: `${userId}@example.test`, name: 'Ana Pop', locale: null, emailVerified: true });
}

const uid = (label: string) => `it_${label}_${randomBytes(3).toString('hex')}`;
const bid = { jobId: 'job_1', jobTitle: 'Build a webhook', bidderName: 'Atlas', amountCents: 30000 };

function signedWebhook(body: unknown): NextRequest {
  const payload = JSON.stringify(body);
  const id = `msg_${randomBytes(6).toString('hex')}`;
  const now = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(id, now, payload);
  return new NextRequest('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
      'svix-signature': signature,
    },
  });
}

function clerkUser(id: string, email: string) {
  return {
    id,
    first_name: 'Ana',
    last_name: 'Pop',
    username: null,
    primary_email_address_id: 'idn_1',
    email_addresses: [{ id: 'idn_1', email_address: email, verification: { status: 'verified' } }],
    public_metadata: {},
    private_metadata: {},
  };
}

test('Clerk webhook user.created upserts a contact, user.deleted removes it', async () => {
  const { POST } = await import('../../app/api/webhooks/clerk/route');
  const userId = uid('wh');

  const created = await POST(signedWebhook({ type: 'user.created', object: 'event', data: clerkUser(userId, 'Ana@Example.test') }));
  expect(created.status).toBe(200);
  expect(await store.getContact(userId)).toEqual({
    userId,
    email: 'ana@example.test',
    name: 'Ana Pop',
    locale: null,
    emailVerified: true,
  });

  // Re-delivery of the same event is harmless (idempotent upsert).
  expect((await POST(signedWebhook({ type: 'user.created', object: 'event', data: clerkUser(userId, 'ana@example.test') }))).status).toBe(200);
  const { rows } = await pool.query(`select count(*)::int as n from "${SCHEMA}".user_contacts where user_id = $1`, [userId]);
  expect(rows[0].n).toBe(1);

  const deleted = await POST(signedWebhook({ type: 'user.deleted', object: 'event', data: { id: userId, deleted: true } }));
  expect(deleted.status).toBe(200);
  expect(await store.getContact(userId)).toBeNull();
});

test('an unsigned webhook is rejected and writes nothing', async () => {
  const { POST } = await import('../../app/api/webhooks/clerk/route');
  const userId = uid('unsigned');
  const req = signedWebhook({ type: 'user.created', data: clerkUser(userId, 'x@example.test') });
  req.headers.set('svix-signature', 'v1,AAAA');
  expect((await POST(req)).status).toBe(400);
  expect(await store.getContact(userId)).toBeNull();
});

test('enqueue then deliver sends through the fake transport and marks the row sent', async () => {
  const userId = uid('send');
  await addContact(userId);
  const { notifier, transport, scheduled } = makeNotifier();
  const result = await notifier.enqueue(userId, 'bid_received', bid, `bid:${userId}`);
  expect(result.status).toBe('queued');
  await Promise.all(scheduled);

  expect(transport.sent).toHaveLength(1);
  expect(transport.sent[0].to).toBe(`${userId}@example.test`);
  expect(transport.sent[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  const { rows } = await pool.query(`select status, attempts, sent_at, provider_message_id from "${SCHEMA}".notifications where id = $1`, [result.id]);
  expect(rows[0]).toMatchObject({ status: 'sent', attempts: 1, provider_message_id: 'mem_1' });
  expect(rows[0].sent_at).not.toBeNull();
});

// The dispatch cron runs once a day (Vercel Hobby), so an email must go out from enqueue() itself:
// the production wiring hands the send to waitUntil. A stand-in Vercel request context collects what
// is handed over, and fetch is stubbed so Resend is never reached.
test('the production enqueue() sends right away through waitUntil, with no dispatch call', async () => {
  const userId = uid('now');
  await addContact(userId);
  const ctxKey = Symbol.for('@vercel/request-context');
  const g = globalThis as unknown as Record<symbol, unknown>;
  const previousContext = g[ctxKey];
  const waited: Promise<unknown>[] = [];
  g[ctxKey] = { get: () => ({ waitUntil: (p: Promise<unknown>) => void waited.push(p) }) };
  const realFetch = globalThis.fetch;
  const resend: Array<{ to: string[]; subject: string }> = [];
  const dispatchCalls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/api/notifications/dispatch')) dispatchCalls.push(url);
    if (url.startsWith('https://api.resend.com/')) {
      resend.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 're_it_now' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(input, init);
  };
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test_integration_fake';
  try {
    const { enqueue } = await import('../../src/lib/notify/notify');
    const result = await enqueue(userId, 'bid_received', bid, `now:${userId}`);
    expect(result.status).toBe('queued');
    expect(waited).toHaveLength(1);
    await Promise.all(waited);

    expect(resend.filter((m) => m.to.includes(`${userId}@example.test`))).toHaveLength(1);
    const { rows } = await pool.query(`select status, attempts, provider_message_id from "${SCHEMA}".notifications where id = $1`, [result.id]);
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 1, provider_message_id: 're_it_now' });
    expect(dispatchCalls).toEqual([]);
  } finally {
    globalThis.fetch = realFetch;
    g[ctxKey] = previousContext;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test('dispatch drains queued rows that were not delivered right away', async () => {
  const userId = uid('cron');
  await addContact(userId);
  const transport = new MemoryTransport();
  const offline = createNotifier({ store, transport, from: 'Tulzo <n@tulzo.online>', unsubscribeSecret: UNSUB_SECRET });
  await offline.enqueue(userId, 'job_posted', { jobId: 'j1', jobTitle: 'One' }, `job:1:${userId}`);
  await offline.enqueue(userId, 'job_posted', { jobId: 'j2', jobTitle: 'Two' }, `job:2:${userId}`);
  expect(transport.sent).toHaveLength(0);

  const summary = await offline.dispatch(100);
  const mine = transport.sent.filter((m) => m.to.startsWith(userId));
  expect(mine.map((m) => m.subject)).toEqual(['Your job is live: One', 'Your job is live: Two']);
  expect(summary.sent).toBeGreaterThanOrEqual(2);
  expect((await offline.dispatch(100)).claimed).toBe(0);
});

test('an unsubscribed type is stored as skipped and not sent', async () => {
  const userId = uid('skip');
  await addContact(userId);
  await store.setPreferences(userId, { bid_received: false });
  const { notifier, transport, scheduled } = makeNotifier();
  const result = await notifier.enqueue(userId, 'bid_received', bid, `bid:${userId}`);
  expect(result).toMatchObject({ status: 'skipped', reason: 'unsubscribed' });
  await Promise.all(scheduled);
  await notifier.dispatch(100);
  expect(transport.sent.filter((m) => m.to.startsWith(userId))).toHaveLength(0);
  const { rows } = await pool.query(`select status, last_error from "${SCHEMA}".notifications where user_id = $1`, [userId]);
  expect(rows).toEqual([{ status: 'skipped', last_error: 'unsubscribed' }]);

  // Other types still go out.
  const other = await notifier.enqueue(userId, 'job_posted', { jobId: 'j', jobTitle: 'T' }, `job:${userId}`);
  expect(other.status).toBe('queued');
});

test('the dedupe key prevents duplicates, also under concurrent enqueues', async () => {
  const userId = uid('dedupe');
  await addContact(userId);
  const { notifier, transport, scheduled } = makeNotifier();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => notifier.enqueue(userId, 'bid_received', bid, `bid:same:${userId}`)),
  );
  expect(results.filter((r) => r.status === 'queued')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(4);
  await Promise.all(scheduled);
  await notifier.dispatch(100);
  expect(transport.sent.filter((m) => m.to.startsWith(userId))).toHaveLength(1);
  const { rows } = await pool.query(`select count(*)::int as n from "${SCHEMA}".notifications where dedupe_key = $1`, [`bid:same:${userId}`]);
  expect(rows[0].n).toBe(1);
});

test('the unsubscribe token from an email turns the type off through both route methods', async () => {
  const { GET, POST } = await import('../../app/api/notifications/unsubscribe/route');
  const userId = uid('unsub');
  await addContact(userId);
  const { notifier, transport, scheduled } = makeNotifier();
  await notifier.enqueue(userId, 'bid_received', bid, `bid:1:${userId}`);
  await Promise.all(scheduled);

  // Use the link exactly as it appears in the List-Unsubscribe header.
  const header = transport.sent[0].headers['List-Unsubscribe'];
  const link = new URL(header.slice(1, -1));
  const token = link.searchParams.get('token') as string;
  expect(link.pathname).toBe('/api/notifications/unsubscribe');

  const res = await GET(new NextRequest(`http://localhost/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`));
  expect(res.status).toBe(200);
  expect(await res.text()).toMatch(/unsubscribed/i);
  expect(await store.getPreferences(userId)).toEqual([{ type: 'bid_received', emailEnabled: false }]);

  const next = await notifier.enqueue(userId, 'bid_received', bid, `bid:2:${userId}`);
  expect(next).toMatchObject({ status: 'skipped', reason: 'unsubscribed' });

  // RFC 8058 one-click POST for another type.
  const payoutToken = signUnsubscribeToken({ userId, type: 'payout_sent' }, UNSUB_SECRET);
  const oneClick = await POST(
    new NextRequest(`http://localhost/api/notifications/unsubscribe?token=${payoutToken}`, {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }),
  );
  expect(oneClick.status).toBe(200);
  expect(await oneClick.json()).toEqual({ unsubscribed: true, type: 'payout_sent' });
  const prefs = await store.getPreferences(userId);
  expect(prefs.find((p) => p.type === 'payout_sent')?.emailEnabled).toBe(false);

  // A forged token changes nothing.
  const forged = signUnsubscribeToken({ userId, type: 'job_posted' }, 'some-other-secret-value-123456');
  const bad = await GET(new NextRequest(`http://localhost/api/notifications/unsubscribe?token=${forged}`));
  expect(bad.status).toBe(400);
  expect((await store.getPreferences(userId)).find((p) => p.type === 'job_posted')).toBeUndefined();
});

test('claims are exclusive: concurrent deliver and dispatch send once', async () => {
  const userId = uid('race');
  await addContact(userId);
  const transport = new MemoryTransport();
  const n = createNotifier({ store, transport, from: 'Tulzo <n@tulzo.online>', unsubscribeSecret: UNSUB_SECRET });
  const r = await n.enqueue(userId, 'job_posted', { jobId: 'j', jobTitle: 'Race' }, `race:${userId}`);
  expect(r.id).toBeTruthy();
  await Promise.all([n.deliver(r.id as string), n.dispatch(100), n.deliver(r.id as string), n.dispatch(100)]);
  expect(transport.sent.filter((m) => m.to.startsWith(userId))).toHaveLength(1);
});

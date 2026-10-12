/**
 * Notification centre and activity views against the throwaway Postgres + PostgREST
 * (npm run test:integration): enqueue writes the in-app item and the email outbox row, the
 * preferences of each channel apply, the feed/read/unread-count routes, gigs events from real
 * flows, and the activity services' totals on seeded data (admin route: 403 for non-admins).
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { installMocks, resetDb, sql, call, notifyState, requireTestDb, useFakeStripe, stopFakeStripe } from './helpers';

installMocks();

import { paidContract } from './room-helpers';
import { createEnqueue } from '../../src/lib/notify/channels';
import { createNotifier } from '../../src/lib/notify/notifier';
import { PgNotifyStore } from '../../src/lib/notify/pg-store';
import { SupabaseInAppStore } from '../../src/lib/notify/inapp-supabase-store';
import { MemoryTransport } from '../../src/lib/notify/transport';

const ADMIN = 'user_nc_admin';
const CUSTOMER = 'user_nc_customer';
const PROVIDER = 'user_nc_provider';
const OTHER = 'user_nc_other';
process.env.ADMIN_USER_IDS = ADMIN;

let pool: Pool;
let inApp: SupabaseInAppStore;
let outbox: PgNotifyStore;
let transport: MemoryTransport;

const routes = {
  feed: () => import('../../app/api/notifications/route'),
  read: () => import('../../app/api/notifications/read/route'),
  count: () => import('../../app/api/notifications/unread-count/route'),
  gigs: () => import('../../app/api/activity/gigs/route'),
  admin: () => import('../../app/api/admin/activity/route'),
  publisher: () => import('../../app/api/marketplace/publisher/activity/route'),
};

function enqueue() {
  const notifier = createNotifier({ store: outbox, transport, from: 'Tulzo <n@tulzo.test>', unsubscribeSecret: 'u'.repeat(32), sleep: async () => undefined });
  return createEnqueue({ notifier: () => notifier, inApp: () => inApp, log: () => undefined });
}

before(async () => {
  await resetDb();
  const { pgUrl, schema } = requireTestDb();
  pool = new Pool({ connectionString: pgUrl, max: 2 });
  outbox = new PgNotifyStore(pool, schema);
  inApp = new SupabaseInAppStore(createClient(process.env.STORAGE_SUPABASE_URL!, process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }));
});

beforeEach(async () => {
  transport = new MemoryTransport();
  await sql('TRUNCATE user_notifications, notifications, notification_preferences, user_contacts');
});

after(async () => {
  await stopFakeStripe();
  await pool.end();
  await resetDb();
});

async function contact(userId: string) {
  await outbox.upsertContact({ userId, email: `${userId}@example.test`, name: 'Cara', locale: null, emailVerified: true });
}

const bid = { jobId: 'job-1', jobTitle: 'CSV importer', bidderName: 'Atlas', amountCents: 30000, currency: 'eur' };

test('one enqueue writes the in-app item and the email outbox row (and sends the email)', async () => {
  await contact(CUSTOMER);
  const r = await enqueue()(CUSTOMER, 'bid_received', bid, 'bid_received:b1');
  assert.equal(r.status, 'queued');
  assert.equal(r.inApp.status, 'inserted');
  const [email] = await sql<{ status: string; type: string }>('SELECT status, type FROM notifications WHERE user_id = $1', [CUSTOMER]);
  assert.equal(email.type, 'bid_received');
  const items = await sql<{ title: string; surface: string; url: string; read_at: string | null; count: number }>('SELECT title, surface, url, read_at, count FROM user_notifications WHERE user_id = $1', [CUSTOMER]);
  assert.deepEqual(items, [{ title: 'New bid on CSV importer', surface: 'gigs', url: '/jobs/job-1', read_at: null, count: 1 }]);
  // a repeat of the same event writes nothing new on either channel
  const again = await enqueue()(CUSTOMER, 'bid_received', bid, 'bid_received:b1');
  assert.equal(again.status, 'duplicate');
  assert.equal(again.inApp.status, 'duplicate');
  assert.equal((await sql('SELECT 1 FROM user_notifications')).length, 1);
});

test('preferences: in-app off for a group mutes it, email off skips the email, in-app needs no contact', async () => {
  await contact(CUSTOMER);
  await inApp.setInAppPreferences(CUSTOMER, ['bid_received'], false);
  await outbox.setPreferences(CUSTOMER, { job_posted: false });
  // both switches live on the same rows without overwriting each other
  const prefs = await inApp.getPreferences(CUSTOMER);
  assert.deepEqual(prefs.find((p) => p.type === 'bid_received'), { type: 'bid_received', emailEnabled: null, inAppEnabled: false });

  const muted = await enqueue()(CUSTOMER, 'bid_received', bid, 'k1');
  assert.equal(muted.inApp.status, 'muted');
  assert.equal(muted.status, 'queued');
  const job = await enqueue()(CUSTOMER, 'job_posted', { jobId: 'j', jobTitle: 'T' }, 'k2');
  assert.equal(job.inApp.status, 'inserted');
  assert.equal(job.status, 'skipped');
  const noContact = await enqueue()(OTHER, 'job_posted', { jobId: 'j', jobTitle: 'T' }, 'k3');
  assert.equal(noContact.status, 'skipped');
  assert.equal(noContact.inApp.status, 'inserted');
});

test('package installs aggregate to one in-app item per package per hour; no email unless switched on', async () => {
  await contact(PROVIDER);
  const e = enqueue();
  for (let i = 0; i < 3; i++) await e(PROVIDER, 'package_installed', { packageId: 'fx', packageName: 'FX MCP' }, `inst:${i}`);
  const items = await sql<{ count: number; title: string }>('SELECT count, title FROM user_notifications WHERE user_id = $1', [PROVIDER]);
  assert.deepEqual(items, [{ count: 3, title: '3 new installs of FX MCP' }]);
  const emails = await sql<{ status: string; last_error: string }>('SELECT status, last_error FROM notifications WHERE user_id = $1', [PROVIDER]);
  assert.ok(emails.length === 3 && emails.every((m) => m.status === 'skipped' && m.last_error === 'unsubscribed'));
  assert.equal(transport.sent.length, 0);
});

test('feed routes: list, filters, cursor paging, unread count, mark read (ids and all), per-user isolation', async () => {
  const e = enqueue();
  for (let i = 1; i <= 3; i++) await e(CUSTOMER, 'job_posted', { jobId: `j${i}`, jobTitle: `Job ${i}` }, `jp:${i}`);
  await e(CUSTOMER, 'package_approved', { packageId: 'fx', packageName: 'FX' }, 'pa:1');
  await e(OTHER, 'job_posted', { jobId: 'x', jobTitle: 'Theirs' }, 'jp:other');

  const { GET } = await routes.feed();
  assert.equal((await call(GET as never, { url: '/api/notifications', user: null })).status, 401);
  assert.equal((await call(GET as never, { url: '/api/notifications?surface=moon', user: CUSTOMER })).status, 400);

  const all = await call(GET as never, { url: '/api/notifications', user: CUSTOMER });
  assert.equal(all.status, 200);
  assert.equal(all.body.items.length, 4);
  assert.equal(all.body.unreadCount, 4);
  assert.equal(all.body.items[0].title, 'FX is live in the marketplace');
  assert.ok(all.body.items.every((i: Record<string, unknown>) => !('userId' in i) && !('dedupeKey' in i)));

  // pages of 1 walk every item exactly once (microsecond timestamps in the cursor)
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const q: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page = await call(GET as never, { url: `/api/notifications?limit=1${q}`, user: CUSTOMER });
    assert.equal(page.status, 200);
    seen.push(...page.body.items.map((i: { id: string }) => i.id));
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, all.body.items.map((i: { id: string }) => i.id));

  const gigsOnly = await call(GET as never, { url: '/api/notifications?surface=marketplace', user: CUSTOMER });
  assert.deepEqual(gigsOnly.body.items.map((i: { type: string }) => i.type), ['package_approved']);

  const { POST } = await routes.read();
  const { GET: COUNT } = await routes.count();
  assert.equal((await call(POST as never, { method: 'POST', url: '/api/notifications/read', body: {}, user: CUSTOMER })).status, 400);
  // someone else's id changes nothing
  const theirs = (await sql<{ id: string }>('SELECT id FROM user_notifications WHERE user_id = $1', [OTHER]))[0].id;
  assert.deepEqual((await call(POST as never, { method: 'POST', url: '/api/notifications/read', body: { ids: [theirs] }, user: CUSTOMER })).body, { updated: 0, unreadCount: 4 });
  const one = await call(POST as never, { method: 'POST', url: '/api/notifications/read', body: { ids: [all.body.items[0].id, 'not-a-uuid'] }, user: CUSTOMER });
  assert.deepEqual(one.body, { updated: 1, unreadCount: 3 });
  assert.deepEqual((await call(COUNT as never, { url: '/api/notifications/unread-count', user: CUSTOMER })).body, { count: 3 });
  const unread = await call(GET as never, { url: '/api/notifications?unread=1', user: CUSTOMER });
  assert.equal(unread.body.items.length, 3);
  assert.deepEqual((await call(POST as never, { method: 'POST', url: '/api/notifications/read', body: { all: true }, user: CUSTOMER })).body, { updated: 3, unreadCount: 0 });
  assert.deepEqual((await call(COUNT as never, { url: '/api/notifications/unread-count', user: OTHER })).body, { count: 1 });
});

test('gigs flows enqueue bid_received, bid_accepted, payment_confirmed and contract_created; My activity totals match', async () => {
  await useFakeStripe();
  notifyState.sent.length = 0;
  const pc = await paidContract(CUSTOMER, PROVIDER, { priceCents: 30000 });
  const types = (user: string) => notifyState.sent.filter((n) => n.userId === user).map((n) => n.type).sort();
  assert.ok(types(CUSTOMER).includes('bid_received'));
  assert.ok(types(CUSTOMER).includes('payment_confirmed'));
  assert.deepEqual(types(PROVIDER), ['bid_accepted', 'contract_created']);
  assert.equal(notifyState.sent.find((n) => n.type === 'payment_confirmed')!.payload.amountCents, pc.customerTotalCents);

  const { GET } = await routes.gigs();
  assert.equal((await call(GET as never, { url: '/api/activity/gigs', user: null })).status, 401);
  const c = await call(GET as never, { url: '/api/activity/gigs', user: CUSTOMER });
  assert.equal(c.status, 200);
  assert.deepEqual(c.body.customer, { jobsPosted: 1, bidsReceived: 1, contracts: 1, deliveries: 0, paymentsCents: pc.customerTotalCents, commissionCents: pc.customerTotalCents - pc.priceCents });
  assert.deepEqual(c.body.ledger.map((e: { kind: string }) => e.kind).sort(), ['bid_received', 'contract', 'job_posted', 'payment']);
  const p = await call(GET as never, { url: '/api/activity/gigs', user: PROVIDER });
  assert.deepEqual(p.body.provider, { bidsPlaced: 1, contractsWon: 1, payoutsCents: 0, reviews: 0 });
  assert.deepEqual(p.body.customer.paymentsCents, 0);
});

test('admin activity: 401 signed out, 403 for non-admins, totals over seeded money rows, 400 on a bad range', async () => {
  const { GET } = await routes.admin();
  assert.equal((await call(GET as never, { url: '/api/admin/activity', user: null })).status, 401);
  assert.deepEqual(await call(GET as never, { url: '/api/admin/activity', user: CUSTOMER }), { status: 403, body: { error: 'forbidden' } });
  assert.equal((await call(GET as never, { url: '/api/admin/activity?from=2026-02-30', user: ADMIN })).status, 400);

  // The paid contract from the previous test: one payment. Add a payout, a refund and a dispute.
  const [pay] = await sql<{ id: string; contract_id: string; amount_cents: number }>('SELECT id, contract_id, amount_cents FROM payments');
  const [contract] = await sql<{ provider_user_id: string; customer_user_id: string }>('SELECT provider_user_id, customer_user_id FROM contracts WHERE id = $1', [pay.contract_id]);
  await sql(`INSERT INTO transfers (contract_id, payment_id, user_id, destination_account_id, amount_cents, status) VALUES ($1, $2, $3, 'acct_x', 30000, 'paid')`, [pay.contract_id, pay.id, contract.provider_user_id]);
  await sql(`INSERT INTO refunds (payment_id, contract_id, user_id, amount_cents, status) VALUES ($1, $2, $3, 1000, 'succeeded'), ($1, $2, $3, 500, 'failed')`, [pay.id, pay.contract_id, contract.customer_user_id]);
  await sql(
    `INSERT INTO disputes (contract_id, user_id, provider_user_id, opened_by_user_id, source, phase, category, reason)
     VALUES ($1, $2, $3, $2, 'customer', 'pre_accept', 'incomplete', 'Missing export')`,
    [pay.contract_id, contract.customer_user_id, contract.provider_user_id],
  );
  // marketplace: a package with two installs and a published version
  await sql(`INSERT INTO packages (id, name, description, type, latest_version, blob_url, owner_user_id, created_by, visibility) VALUES ('fx-nc', 'FX NC', 'd', 'mcp', '1.0.0', '', $1, $1, 'public')`, [PROVIDER]);
  await sql(`INSERT INTO package_versions (package_id, version, blob_url) VALUES ('fx-nc', '1.0.0', '')`);
  await sql(`INSERT INTO package_installs (package_id, user_id, version) VALUES ('fx-nc', $1, '1.0.0'), ('fx-nc', $2, '1.0.0')`, [CUSTOMER, OTHER]);

  const r = await call(GET as never, { url: '/api/admin/activity', user: ADMIN });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.totals, {
    installs: 2,
    publishes: 1,
    paymentsCount: 1,
    paymentsCents: pay.amount_cents,
    commissionCents: 4500,
    payoutsCount: 1,
    payoutsCents: 30000,
    refundsCount: 1,
    refundsCents: 1000,
    disputes: 1,
  });
  assert.equal(r.body.payments[0].jobTitle, 'Room job for integration tests');
  assert.equal(r.body.payments[0].feeCents, 4500);
  assert.equal(r.body.installs[0].packageName, 'FX NC');
  assert.ok(!JSON.stringify(r.body.installs).includes(CUSTOMER), 'installs stay anonymous');
  // a range before everything is empty
  const old = await call(GET as never, { url: '/api/admin/activity?from=2020-01-01&to=2020-01-31', user: ADMIN });
  assert.equal(old.body.totals.paymentsCount, 0);
  assert.equal(old.body.installs.length, 0);
});

test('publisher activity: counts per package and version for the owner only, never installer ids', async () => {
  const { GET } = await routes.publisher();
  assert.equal((await call(GET as never, { url: '/api/marketplace/publisher/activity', user: null })).status, 401);
  const r = await call(GET as never, { url: '/api/marketplace/publisher/activity', user: PROVIDER });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.totals, { all: 2, last7: 2, last30: 2 });
  assert.equal(r.body.daily.length, 30);
  assert.equal(r.body.daily[29].installs, 2);
  assert.equal(r.body.packages[0].total, 2);
  assert.deepEqual(r.body.packages[0].timeline.map((t: { version: string; installs: number }) => [t.version, t.installs]), [['1.0.0', 2]]);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(CUSTOMER) && !text.includes(OTHER));
  const none = await call(GET as never, { url: '/api/marketplace/publisher/activity', user: OTHER });
  assert.deepEqual(none.body.packages, []);
});

test('marketplace: an install notifies the owner (not when they install their own), moderation tells them the outcome', async () => {
  notifyState.sent.length = 0;
  const { recordInstall, moderatePackage } = await import('../../src/lib/marketplace-service');
  await recordInstall({ userId: CUSTOMER }, 'fx-nc', '1.0.0');
  await recordInstall({ userId: PROVIDER }, 'fx-nc', '1.0.0');
  const installs = notifyState.sent.filter((n) => n.type === 'package_installed');
  assert.equal(installs.length, 1);
  assert.equal(installs[0].userId, PROVIDER);
  assert.match(installs[0].dedupeKey, /^package_installed:fx-nc:\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
  assert.ok(!JSON.stringify(installs[0].payload).includes(CUSTOMER));

  await sql(`UPDATE packages SET visibility = 'pending' WHERE id = 'fx-nc'`);
  assert.deepEqual(await moderatePackage('fx-nc', 'private', ADMIN), { ok: true });
  await sql(`UPDATE packages SET visibility = 'pending', latest_version = '1.1.0' WHERE id = 'fx-nc'`);
  assert.deepEqual(await moderatePackage('fx-nc', 'public', ADMIN), { ok: true });
  // moving a public package again is not a review decision
  assert.deepEqual(await moderatePackage('fx-nc', 'private', ADMIN), { ok: true });
  assert.deepEqual(notifyState.sent.filter((n) => n.type.startsWith('package_') && n.type !== 'package_installed').map((n) => [n.type, n.userId]), [
    ['package_rejected', PROVIDER],
    ['package_approved', PROVIDER],
  ]);
});

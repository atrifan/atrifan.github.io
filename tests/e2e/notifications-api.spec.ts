import { expect, test, type APIRequestContext } from '@playwright/test';
import { GIGS_ENV_MISSING, auth, linkStripe, newApi, placeBid, publishJob, uid, uniqueWord } from '../support/gigs-ui';

/**
 * Real-DB contract for the in-app notification API and the gigs activity API. Runs under the gigs
 * runner only (`npm run test:e2e:gigs -- tests/e2e/notifications-api.spec.ts`): throwaway DB, fake
 * Stripe and the x-e2e-user identity header.
 *
 *   GET  /api/notifications?limit=&cursor=&unread=1&surface=&type= → { items, nextCursor, unreadCount }
 *   GET  /api/notifications/unread-count                        → { count }
 *   POST /api/notifications/read { ids } | { all: true }        → { updated, unreadCount } | 400
 *   GET  /api/activity/gigs                                     → { currency, customer, provider, ledger }
 */
test.skip(GIGS_ENV_MISSING, 'needs the gigs runner (JOBS_E2E_AUTH_SECRET, STRIPE_WEBHOOK_SECRET)');

interface Item {
  id: string;
  type: string;
  title: string;
  body: string | null;
  surface: string;
  url: string;
  count: number;
  readAt: string | null;
  createdAt: string;
}

interface ListBody {
  items: Item[];
  nextCursor: string | null;
  unreadCount: number;
}

const SURFACES = ['hub', 'ai', 'marketplace', 'gigs', 'chat'];

async function list(api: APIRequestContext, user: string, query = ''): Promise<ListBody> {
  const res = await api.get(`/api/notifications${query}`, { headers: auth(user) });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ListBody;
}

async function unreadCount(api: APIRequestContext, user: string): Promise<number> {
  const res = await api.get('/api/notifications/unread-count', { headers: auth(user) });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe('number');
  return body.count;
}

async function markRead(api: APIRequestContext, user: string, data: unknown) {
  return api.post('/api/notifications/read', { headers: auth(user), data });
}

test.describe.serial('notifications API (real DB)', () => {
  const CUSTOMER = uid('notif_customer');
  const PROVIDER = uid('notif_provider');
  const titleA = `Notif job ${uniqueWord('alpha')}`;
  const titleB = `Notif job ${uniqueWord('beta')}`;
  let api: APIRequestContext;
  let jobA: string;
  let jobB: string;
  /** The bid_received item for job A. */
  let itemA: Item;

  test.beforeAll(async ({ playwright }, testInfo) => {
    api = await newApi(playwright, testInfo);
    await linkStripe(api, PROVIDER);
    jobA = (await publishJob(api, CUSTOMER, { title: titleA, budget_min_cents: 20000, budget_max_cents: 40000 })).id;
    await placeBid(api, PROVIDER, jobA, { price_cents: 30000, eta_days: 5, plan: 'Build the importer and a README.' });
    jobB = (await publishJob(api, CUSTOMER, { title: titleB, budget_min_cents: 20000, budget_max_cents: 40000 })).id;
    await placeBid(api, PROVIDER, jobB, { price_cents: 25000, eta_days: 4, plan: 'Nightly backups with restore docs.' });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('unauthenticated: 401 { error: "unauthorized" } on every notification route', async () => {
    for (const res of [
      await api.get('/api/notifications'),
      await api.get('/api/notifications/unread-count'),
      await api.post('/api/notifications/read', { data: { all: true } }),
      await api.get('/api/activity/gigs'),
    ]) {
      expect(res.status(), res.url()).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  test('a bid creates an unread bid_received item for the customer, on gigs, linking to the job', async () => {
    await expect
      .poll(async () => (await list(api, CUSTOMER, '?limit=50')).items.some((i) => i.type === 'bid_received' && i.url.includes(jobA)), {
        timeout: 15_000,
      })
      .toBe(true);
    const body = await list(api, CUSTOMER, '?limit=50');
    expect(typeof body.unreadCount).toBe('number');
    expect(body.nextCursor === null || typeof body.nextCursor === 'string').toBe(true);
    for (const i of body.items) {
      expect(typeof i.id).toBe('string');
      expect(typeof i.type).toBe('string');
      expect(typeof i.title).toBe('string');
      expect(i.body === null || typeof i.body === 'string').toBe(true);
      expect(SURFACES).toContain(i.surface);
      expect(i.url.startsWith('/')).toBe(true);
      expect(Number.isInteger(i.count) && i.count >= 1).toBe(true);
      expect(i.readAt === null || !Number.isNaN(Date.parse(i.readAt))).toBe(true);
      expect(Number.isNaN(Date.parse(i.createdAt))).toBe(false);
    }
    const times = body.items.map((i) => Date.parse(i.createdAt));
    expect(times, 'newest first').toEqual([...times].sort((a, b) => b - a));
    itemA = body.items.find((i) => i.type === 'bid_received' && i.url.includes(jobA))!;
    expect(itemA.surface).toBe('gigs');
    expect(itemA.readAt).toBeNull();
    expect(body.items.some((i) => i.type === 'bid_received' && i.url.includes(jobB))).toBe(true);
  });

  test('unread-count ≥ 1 and matches the list unreadCount', async () => {
    const count = await unreadCount(api, CUSTOMER);
    expect(count).toBeGreaterThanOrEqual(1);
    expect((await list(api, CUSTOMER)).unreadCount).toBe(count);
  });

  test('filters: surface=gigs and type=bid_received include it; other surface/type exclude it', async () => {
    expect((await list(api, CUSTOMER, '?limit=50&surface=gigs')).items.map((i) => i.id)).toContain(itemA.id);
    expect((await list(api, CUSTOMER, '?limit=50&type=bid_received')).items.map((i) => i.id)).toContain(itemA.id);
    expect((await list(api, CUSTOMER, '?limit=50&unread=1')).items.map((i) => i.id)).toContain(itemA.id);
    const market = await list(api, CUSTOMER, '?limit=50&surface=marketplace');
    expect(market.items.map((i) => i.id)).not.toContain(itemA.id);
    for (const i of market.items) expect(i.surface).toBe('marketplace');
    const qa = await list(api, CUSTOMER, '?limit=50&type=qa_verdict');
    expect(qa.items.map((i) => i.id)).not.toContain(itemA.id);
    for (const i of qa.items) expect(i.type).toBe('qa_verdict');
  });

  test('the provider does not see the customer item and cannot mark it read', async () => {
    const theirs = await list(api, PROVIDER, '?limit=50');
    expect(theirs.items.map((i) => i.id)).not.toContain(itemA.id);
    const res = await markRead(api, PROVIDER, { ids: [itemA.id] });
    if (res.status() === 200) expect(((await res.json()) as { updated: number }).updated).toBe(0);
    const mine = await list(api, CUSTOMER, '?limit=50');
    expect(mine.items.find((i) => i.id === itemA.id)?.readAt).toBeNull();
  });

  test('limit=1 returns one item and a nextCursor; following it returns the next, older item', async () => {
    const first = await list(api, CUSTOMER, '?limit=1');
    expect(first.items).toHaveLength(1);
    expect(typeof first.nextCursor).toBe('string');
    const second = await list(api, CUSTOMER, `?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(Date.parse(second.items[0].createdAt)).toBeLessThanOrEqual(Date.parse(first.items[0].createdAt));
  });

  test('POST read {} → 400', async () => {
    const res = await markRead(api, CUSTOMER, {});
    expect(res.status()).toBe(400);
  });

  test('POST read { ids: [id] } sets readAt and drops the count by 1', async () => {
    const before = await unreadCount(api, CUSTOMER);
    const res = await markRead(api, CUSTOMER, { ids: [itemA.id] });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { updated: number; unreadCount: number };
    expect(body.updated).toBe(1);
    expect(body.unreadCount).toBe(before - 1);
    expect(await unreadCount(api, CUSTOMER)).toBe(before - 1);
    const item = (await list(api, CUSTOMER, '?limit=50')).items.find((i) => i.id === itemA.id);
    expect(item?.readAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(item!.readAt!))).toBe(false);
    expect((await list(api, CUSTOMER, '?limit=50&unread=1')).items.map((i) => i.id)).not.toContain(itemA.id);
  });

  test('POST read { all: true } → count 0 and unread=1 is empty', async () => {
    const res = await markRead(api, CUSTOMER, { all: true });
    expect(res.status(), await res.text()).toBe(200);
    expect(((await res.json()) as { unreadCount: number }).unreadCount).toBe(0);
    expect(await unreadCount(api, CUSTOMER)).toBe(0);
    const unread = await list(api, CUSTOMER, '?unread=1');
    expect(unread.items).toEqual([]);
    expect(unread.unreadCount).toBe(0);
  });

  test('GET /api/activity/gigs: customer has jobsPosted ≥ 1 and a job_posted ledger entry; provider bidsPlaced ≥ 1', async () => {
    const c = await api.get('/api/activity/gigs', { headers: auth(CUSTOMER) });
    expect(c.status(), await c.text()).toBe(200);
    const cb = (await c.json()) as {
      currency: string;
      customer: { jobsPosted: number };
      ledger: Array<{ kind: string; role: string; jobTitle: string; at: string }>;
    };
    expect(cb.currency).toBe('eur');
    expect(cb.customer.jobsPosted).toBeGreaterThanOrEqual(1);
    const posted = cb.ledger.find((e) => e.kind === 'job_posted' && e.jobTitle === titleA);
    expect(posted, 'job_posted entry for job A').toBeTruthy();
    expect(posted!.role).toBe('customer');
    const at = cb.ledger.map((e) => Date.parse(e.at));
    expect(at, 'ledger newest first').toEqual([...at].sort((a, b) => b - a));

    const p = await api.get('/api/activity/gigs', { headers: auth(PROVIDER) });
    expect(p.status(), await p.text()).toBe(200);
    const pb = (await p.json()) as { provider: { bidsPlaced: number }; ledger: Array<{ jobTitle: string }> };
    expect(pb.provider.bidsPlaced).toBeGreaterThanOrEqual(1);
  });
});

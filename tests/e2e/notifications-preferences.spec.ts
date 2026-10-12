import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

// Behavior-only contract tests for the Clerk-gated notification preferences API.
//
//   GET /api/notifications/preferences → 200 { preferences: [{ type, label, emailEnabled }] } | 401 { error }
//   PUT /api/notifications/preferences { preferences: { <type>: boolean } } → 200 (same shape) | 400 | 401
//
// Unauthenticated behavior is always tested. Signed-in behavior needs a saved
// Clerk session at E2E_CLERK_STORAGE_STATE and is skipped otherwise.

const URL_PATH = '/api/notifications/preferences';
const CLERK_STATE = process.env.E2E_CLERK_STORAGE_STATE;

const TYPES = [
  'job_posted',
  'bid_received',
  'bid_accepted',
  'contract_created',
  'payment_confirmed',
  'steering_awaiting_approval',
  'scope_change_awaiting_approval',
  'submission_received',
  'qa_verdict',
  'delivery_ready',
  'auto_accept_reminder',
  'dispute_opened',
  'dispute_resolved',
  'payout_sent',
  'review_received',
  'progress_update',
  'milestone_completed',
  'package_installed',
  'package_approved',
  'package_rejected',
  'submission_awaiting_qa',
] as const;

/** Types in the admin-only group: listed for admins only, refused for everyone else. */
const ADMIN_ONLY_TYPES: readonly string[] = ['submission_awaiting_qa'];

type Pref = { type: string; label: string; emailEnabled: boolean };

async function expectJsonError(res: APIResponse, status: number) {
  expect(res.status()).toBe(status);
  expect(res.headers()['content-type'] ?? '').toMatch(/application\/json/i);
  const body = await res.json();
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
}

async function expectPrefsShape(res: APIResponse): Promise<Map<string, boolean>> {
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { preferences: Pref[]; admin?: boolean };
  expect(Array.isArray(body.preferences)).toBe(true);
  const expected = TYPES.filter((t) => body.admin === true || !ADMIN_ONLY_TYPES.includes(t));
  expect(body.preferences).toHaveLength(expected.length);
  expect(body.preferences.map((p) => p.type).sort()).toEqual([...expected].sort());
  for (const p of body.preferences) {
    expect(typeof p.label).toBe('string');
    expect(p.label.trim().length).toBeGreaterThan(0);
    expect(typeof p.emailEnabled).toBe('boolean');
  }
  return new Map(body.preferences.map((p) => [p.type, p.emailEnabled]));
}

// ---------------------------------------------------------------------------
// Unauthenticated
// ---------------------------------------------------------------------------
test.describe('preferences without a session', () => {
  test('GET → 401 { error }', async ({ request }) => {
    await expectJsonError(await request.get(URL_PATH, { maxRedirects: 0 }), 401);
  });

  test('PUT with a valid body → 401 { error }', async ({ request }) => {
    const res = await request.put(URL_PATH, {
      data: { preferences: { bid_received: false } },
      maxRedirects: 0,
    });
    await expectJsonError(res, 401);
  });

  test('PUT with an invalid body → 401 { error } (auth before validation)', async ({ request }) => {
    const res = await request.put(URL_PATH, {
      data: { preferences: { not_a_type: 'nope' } },
      maxRedirects: 0,
    });
    await expectJsonError(res, 401);
  });

  test('PUT with invalid JSON → 401 { error }', async ({ request }) => {
    const res = await request.put(URL_PATH, {
      data: '{not json',
      headers: { 'content-type': 'application/json' },
      maxRedirects: 0,
    });
    await expectJsonError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// Signed in (Clerk storage state). Serial: these share one real user's prefs.
// ---------------------------------------------------------------------------
test.describe('preferences with a Clerk session', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: CLERK_STATE });

  test.beforeEach(() => {
    test.skip(!CLERK_STATE, 'requires E2E_CLERK_STORAGE_STATE (saved Clerk session)');
  });

  test('GET → 200 with exactly one entry per type the user can receive', async ({ request }) => {
    const prefs = await expectPrefsShape(await request.get(URL_PATH));
    expect(prefs.size).toBeGreaterThanOrEqual(TYPES.length - ADMIN_ONLY_TYPES.length);
  });

  test('PUT bid_received=false → 200, only that type changes, GET reflects it', async ({ request }) => {
    const before = await expectPrefsShape(await request.get(URL_PATH));
    try {
      const put = await request.put(URL_PATH, { data: { preferences: { bid_received: false } } });
      const afterPut = await expectPrefsShape(put);
      expect(afterPut.get('bid_received')).toBe(false);
      for (const t of TYPES) if (t !== 'bid_received') expect(afterPut.get(t)).toBe(before.get(t));

      const afterGet = await expectPrefsShape(await request.get(URL_PATH));
      expect(afterGet.get('bid_received')).toBe(false);
      for (const t of TYPES) if (t !== 'bid_received') expect(afterGet.get(t)).toBe(before.get(t));
    } finally {
      const restore = await request.put(URL_PATH, { data: { preferences: { bid_received: true } } });
      expect(restore.status()).toBe(200);
    }
    const restored = await expectPrefsShape(await request.get(URL_PATH));
    expect(restored.get('bid_received')).toBe(true);
  });

  for (const [name, data] of [
    ['unknown type key', { preferences: { not_a_real_type: false } }],
    ['unknown key alongside a valid one', { preferences: { bid_received: true, not_a_real_type: false } }],
    ['string value', { preferences: { bid_received: 'false' } }],
    ['numeric value', { preferences: { bid_received: 0 } }],
    ['null value', { preferences: { bid_received: null } }],
    ['missing preferences key', {}],
    ['preferences is not an object', { preferences: 'off' }],
  ] as const) {
    test(`PUT with ${name} → 400`, async ({ request }) => {
      const res = await request.put(URL_PATH, { data });
      expect(res.status()).toBe(400);
    });
  }

  test('PUT with invalid JSON → 400', async ({ request }) => {
    const res = await request.put(URL_PATH, {
      data: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Admin-only types (the "Admin" group): only admins see or change them
// ---------------------------------------------------------------------------
// The API calls run inside the signed-in page: a saved storage state carries a Clerk session token
// that expires after 60s, and only the browser's Clerk client refreshes it (a bare request context
// would get 401 once it is stale).
async function pageApi(page: Page, method: 'GET' | 'PUT', data?: unknown): Promise<{ status: number; body: { admin?: boolean; preferences: Pref[]; error?: string } }> {
  return page.evaluate(
    async ({ url, method, data }) => {
      const res = await fetch(url, {
        method,
        headers: data === undefined ? undefined : { 'content-type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { url: URL_PATH, method, data },
  );
}

async function signedInPage(page: Page): Promise<void> {
  await page.goto('/profile');
  await expect(page.getByRole('banner').getByRole('button', { name: /open user (button|menu)/i })).toBeVisible({ timeout: 30_000 });
}

test.describe('admin-only preferences, customer', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await signedInPage(page);
  });

  test('GET says admin: false and leaves the admin-only types out', async ({ page }) => {
    const { status, body } = await pageApi(page, 'GET');
    expect(status).toBe(200);
    expect(body.admin).toBe(false);
    const types = (body.preferences as Pref[]).map((p) => p.type);
    for (const t of ADMIN_ONLY_TYPES) expect(types).not.toContain(t);
    expect(types).toContain('bid_received');
  });

  for (const [name, data] of [
    ['an admin-only email type', { preferences: { submission_awaiting_qa: false } }],
    ['the admin in-app group', { inApp: { admin: false } }],
  ] as const) {
    test(`PUT with ${name} → 403 { error }`, async ({ page }) => {
      const { status, body } = await pageApi(page, 'PUT', data);
      expect(status).toBe(403);
      expect(typeof body.error).toBe('string');
    });
  }

  test('the profile page shows no "Admin" notification group', async ({ page }) => {
    await expect(page.getByText('Your job is posted').first()).toBeVisible();
    await expect(page.getByText('Submissions waiting in the QA queue')).toHaveCount(0);
    await expect(page.locator('#main').getByText(/^Admin$/)).toHaveCount(0);
  });
});

test.describe('admin-only preferences, admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await signedInPage(page);
  });

  test('GET says admin: true and lists the admin-only types', async ({ page }) => {
    const { status, body } = await pageApi(page, 'GET');
    expect(status).toBe(200);
    expect(body.admin).toBe(true);
    const types = (body.preferences as Pref[]).map((p) => p.type);
    for (const t of ADMIN_ONLY_TYPES) expect(types).toContain(t);
  });

  test('the profile page shows the "Admin" notification group', async ({ page }) => {
    await expect(page.locator('#main').getByText(/^Admin$/).first()).toBeVisible();
  });
});

import { test, expect, type APIResponse } from '@playwright/test';

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
] as const;

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
  const body = (await res.json()) as { preferences: Pref[] };
  expect(Array.isArray(body.preferences)).toBe(true);
  expect(body.preferences).toHaveLength(TYPES.length);
  expect(body.preferences.map((p) => p.type).sort()).toEqual([...TYPES].sort());
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

  test('GET → 200 with exactly one entry per type', async ({ request }) => {
    const prefs = await expectPrefsShape(await request.get(URL_PATH));
    expect(prefs.size).toBe(TYPES.length);
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

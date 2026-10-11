import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { expectNoAdSlots, fulfillJson, guardPage, signedInRequest } from './hub-helpers';

/** Admin QA review page `/admin/qa` and its API (UI mocked; API real). */

const SUB_ID = '11111111-1111-4111-8111-111111111111';

const ITEM = {
  submission_id: SUB_ID,
  contract_id: 'c1',
  job_id: 'j1',
  job_title: 'Fix the login bug',
  attempt: 2,
  status: 'awaiting_qa',
  submitted_at: '2026-10-10T09:00:00Z',
  repo_full_name: 'acme/app',
  commit_sha: 'abcdef1234567',
  provider: { user_id: 'u_p', name: 'Pat Provider', email: 'p@x.test', plan: 'pro' },
  customer: { user_id: 'u_c', name: 'Cara Customer', email: 'c@x.test', plan: 'free' },
  price_cents: 30000,
  commission_cents: 4500,
  commission_bps: 1500,
  customer_total_cents: 34500,
  currency: 'eur',
  checks: ['basic', 'code_review'],
};

const DETAIL = {
  submission: { id: SUB_ID, status: 'awaiting_qa', attempt: 2, repo_full_name: 'acme/app', commit_sha: 'abcdef1234567' },
  job: { id: 'j1', title: 'Fix the login bug', description: 'Login fails on Safari' },
  spec: { requirements: ['Login works on Safari'], acceptance_criteria: ['Test passes'] },
  contract_version: { price_cents: 30000, fee_cents: 4500, currency: 'eur' },
  parties: { provider: ITEM.provider, customer: ITEM.customer },
  qa: { checks: ['basic'], reserved_credits: 60, used_credits: 0, status: 'reserved' },
  previous_reviews: [],
};

const CREDENTIALS = {
  repo_full_name: 'acme/app',
  repo_url: 'https://github.com/acme/app',
  commit_sha: 'abcdef1234567',
  pat_token: 'github_pat_FAKE',
  pat_expires_at: null,
  review_key: {
    key: 'ak_review_FAKE',
    key_id: 'k1',
    expires_at: '2026-10-11T09:00:00Z',
    cap_credits: 60,
    used_credits: 0,
    chat_url: 'http://localhost/api/chat',
  },
};

const VERDICT_OK = { review: { id: 'r1' }, submission_status: 'rejected', contract_status: 'disputed', credits: {} };

interface AdminMocks {
  queueUrls: URL[];
  detailCalls: number;
  credentialCalls: number;
  verdictBodies: unknown[];
}

async function mockAdminApi(page: Page, items: unknown[] = [ITEM]): Promise<AdminMocks> {
  const m: AdminMocks = { queueUrls: [], detailCalls: 0, credentialCalls: 0, verdictBodies: [] };
  await page.route(
    (url) => url.pathname.startsWith('/api/admin/qa/'),
    (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/api/admin/qa/queue') {
        m.queueUrls.push(url);
        return fulfillJson(route, { items });
      }
      if (url.pathname === `/api/admin/qa/submissions/${SUB_ID}` && req.method() === 'GET') {
        m.detailCalls++;
        return fulfillJson(route, DETAIL);
      }
      if (url.pathname === `/api/admin/qa/submissions/${SUB_ID}/credentials` && req.method() === 'POST') {
        m.credentialCalls++;
        return fulfillJson(route, CREDENTIALS);
      }
      if (url.pathname === `/api/admin/qa/submissions/${SUB_ID}/verdict` && req.method() === 'POST') {
        m.verdictBodies.push(req.postDataJSON());
        return fulfillJson(route, VERDICT_OK);
      }
      return fulfillJson(route, { error: 'not mocked' }, 500);
    },
  );
  return m;
}

const queueTable = (page: Page) => page.getByRole('table', { name: 'QA queue' });

async function openReview(page: Page) {
  await page.goto('/admin/qa');
  await queueTable(page)
    .getByRole('row')
    .filter({ hasText: 'Fix the login bug' })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: /Fix the login bug/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('admin QA page, signed out', () => {
  test('redirects to sign-in', async ({ page }) => {
    await guardPage(page);
    await page.goto('/admin/qa');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  });
});

test.describe('admin QA page, customer', () => {
  test.use({ storageState: storageStatePath('customer') });
  test('is a 404 "Page not found"', async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await page.goto('/admin/qa');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  });
});

test.describe('admin QA page, admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  test('h1 "QA review", Status defaults to awaiting_qa and drives the queue request', async ({ page }) => {
    const m = await mockAdminApi(page);
    await page.goto('/admin/qa');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('QA review');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('awaiting_qa');
    await expect.poll(() => m.queueUrls.some((u) => u.searchParams.get('status') === 'awaiting_qa')).toBe(true);
  });

  test('queue table has the columns and the mocked row', async ({ page }) => {
    await mockAdminApi(page);
    await page.goto('/admin/qa');
    const table = queueTable(page);
    for (const h of ['Job', 'From → To', 'Price', 'Commission', 'Plans', 'Attempt']) {
      await expect(table.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
    }
    const row = table.getByRole('row').filter({ hasText: 'Fix the login bug' });
    await expect(row).toHaveCount(1);
    for (const t of ['Pat Provider', 'Cara Customer', '€300.00', '€45.00', 'pro', 'free', '2']) {
      await expect(row).toContainText(t);
    }
  });

  test('empty queue says "Nothing waiting for QA"', async ({ page }) => {
    await mockAdminApi(page, []);
    await page.goto('/admin/qa');
    await expect(page.getByText('Nothing waiting for QA')).toBeVisible();
  });

  test('changing Status to validated re-requests the queue', async ({ page }) => {
    const m = await mockAdminApi(page);
    await page.goto('/admin/qa');
    await expect(queueTable(page)).toBeVisible();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('validated');
    await expect.poll(() => m.queueUrls.some((u) => u.searchParams.get('status') === 'validated')).toBe(true);
  });

  test('Review opens a dialog with the job and spec', async ({ page }) => {
    const m = await mockAdminApi(page);
    const dialog = await openReview(page);
    await expect(dialog).toContainText('Login fails on Safari');
    await expect(dialog).toContainText('Login works on Safari');
    expect(m.detailCalls).toBeGreaterThan(0);
  });

  test('Reveal credentials asks first; Cancel sends nothing', async ({ page }) => {
    const m = await mockAdminApi(page);
    const dialog = await openReview(page);
    await dialog.getByRole('button', { name: 'Reveal credentials', exact: true }).click();
    await expect(page.getByText(/recorded in the audit log/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText(/recorded in the audit log/)).toBeHidden();
    expect(m.credentialCalls).toBe(0);
  });

  test('Reveal shows the PAT, review key and commit', async ({ page }) => {
    const m = await mockAdminApi(page);
    const dialog = await openReview(page);
    await dialog.getByRole('button', { name: 'Reveal credentials', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();
    for (const t of ['github_pat_FAKE', 'ak_review_FAKE', 'abcdef1234567']) {
      await expect(page.getByRole('dialog', { name: /Fix the login bug/ })).toContainText(t);
    }
    expect(m.credentialCalls).toBe(1);
  });

  test('verdict form: Rejected needs a reason, then posts it and shows "Verdict saved"', async ({ page }) => {
    const m = await mockAdminApi(page);
    const dialog = await openReview(page);
    const verdict = dialog.getByRole('radiogroup', { name: 'Verdict' });
    for (const r of ['Validated', 'Requires changes', 'Rejected']) {
      await expect(verdict.getByRole('radio', { name: r, exact: true })).toBeVisible();
    }
    await verdict.getByRole('radio', { name: 'Rejected', exact: true }).check();
    await dialog.getByRole('button', { name: 'Submit verdict', exact: true }).click();
    await expect(dialog.getByText(/A reason is required/)).toBeVisible();
    expect(m.verdictBodies).toHaveLength(0);

    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Tests fail');
    await dialog.getByRole('button', { name: 'Submit verdict', exact: true }).click();
    await expect(page.getByText(/Verdict saved/)).toBeVisible();
    expect(m.verdictBodies).toEqual([{ verdict: 'rejected', reason: 'Tests fail' }]);
  });

  test('dialog closes with Escape', async ({ page }) => {
    await mockAdminApi(page);
    const dialog = await openReview(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('dialog closes with the Close button', async ({ page }) => {
    await mockAdminApi(page);
    const dialog = await openReview(page);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('no ad slots and robots noindex', async ({ page }) => {
    await mockAdminApi(page);
    await page.goto('/admin/qa');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('QA review');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expectNoAdSlots(page);
  });
});

// ---------------------------------------------------------------------------
// API: real server, no mocks.
// ---------------------------------------------------------------------------

test.describe('admin QA API, signed out', () => {
  test('GET queue → 401', async ({ request }) => {
    expect((await request.get('/api/admin/qa/queue', { maxRedirects: 0 })).status()).toBe(401);
  });

  test('POST credentials → 401', async ({ request }) => {
    const res = await request.post(`/api/admin/qa/submissions/${randomUUID()}/credentials`, { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });
});

test.describe('admin QA API, customer', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(() => test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured'));

  test('queue, submission, credentials and verdict → 403', async ({ page }) => {
    const api = await signedInRequest(page);
    const id = randomUUID();
    expect((await api.get('/api/admin/qa/queue', { maxRedirects: 0 })).status()).toBe(403);
    expect((await api.get(`/api/admin/qa/submissions/${id}`, { maxRedirects: 0 })).status()).toBe(403);
    expect((await api.post(`/api/admin/qa/submissions/${id}/credentials`, { maxRedirects: 0 })).status()).toBe(403);
    expect(
      (await api.post(`/api/admin/qa/submissions/${id}/verdict`, { data: { verdict: 'validated' }, maxRedirects: 0 })).status(),
    ).toBe(403);
  });
});

test.describe('admin QA API, admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeEach(() => test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured'));

  test('GET queue → 200 { items: [] }', async ({ page }) => {
    const api = await signedInRequest(page);
    const res = await api.get('/api/admin/qa/queue', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('GET submission: bad id → 400, unknown uuid → 404', async ({ page }) => {
    const api = await signedInRequest(page);
    expect((await api.get('/api/admin/qa/submissions/not-a-uuid', { maxRedirects: 0 })).status()).toBe(400);
    expect((await api.get(`/api/admin/qa/submissions/${randomUUID()}`, { maxRedirects: 0 })).status()).toBe(404);
  });

  test('POST credentials and verdict for an unknown uuid → 404', async ({ page }) => {
    const api = await signedInRequest(page);
    expect((await api.post(`/api/admin/qa/submissions/${randomUUID()}/credentials`, { maxRedirects: 0 })).status()).toBe(404);
    expect(
      (
        await api.post(`/api/admin/qa/submissions/${randomUUID()}/verdict`, {
          data: { verdict: 'validated' },
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
  });
});

import { test, expect, type Locator, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { apiPath, fulfillJson, guardPage, recordRequests, waitForClerkUser } from './hub-helpers';
import { COMPLAINT_CATEGORIES, GOOD_FAITH_LABEL } from '../support/legal';

/**
 * The complaint / report form on /legal/complaints, with POST /api/legal/complaints mocked.
 * Behaviour only: fields, the illegal-content good-faith checkbox, the honeypot, client-side
 * validation, the success and rate-limit messages, and the signed-in prefill.
 */

const REF = 'TZ-7K3M-Q9PX';
const isComplaint = (u: string) => new URL(u).pathname === '/api/legal/complaints';

function complaintForm(page: Page): Locator {
  const heading = page.getByRole('heading', { name: 'Send a complaint or report', exact: true });
  return page.locator('section, form, [role="region"]').filter({ has: heading }).last();
}

async function open(page: Page): Promise<Locator> {
  await guardPage(page);
  await page.goto('/legal/complaints');
  const form = complaintForm(page);
  await expect(form).toBeVisible({ timeout: 30_000 });
  return form;
}

async function fillValid(form: Locator): Promise<void> {
  await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: 'Payment or refund' });
  await form.getByRole('textbox', { name: 'Your name', exact: true }).fill('Cara Customer');
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill('cara@example.test');
  await form.getByRole('textbox', { name: /^Related URL or contract ID/ }).fill('https://tulzo.online/gigs/contracts/abc');
  await form.getByRole('textbox', { name: 'Message', exact: true }).fill('My top-up was charged twice on 10 October.');
}

test.describe('complaints form (signed out)', () => {
  test('has the category select with all options and the other fields', async ({ page }) => {
    const form = await open(page);
    const category = form.getByRole('combobox', { name: 'Category', exact: true });
    await expect(category).toBeVisible();
    for (const label of COMPLAINT_CATEGORIES) {
      await expect(category.locator('option', { hasText: label }), label).toHaveCount(1);
    }
    await expect(form.getByRole('textbox', { name: 'Your name', exact: true })).toBeVisible();
    const email = form.getByRole('textbox', { name: 'Email', exact: true });
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');
    await expect(form.getByRole('textbox', { name: /^Related URL or contract ID/ })).toBeVisible();
    const message = form.getByRole('textbox', { name: 'Message', exact: true });
    await expect(message).toBeVisible();
    expect(await message.evaluate((el) => el.tagName)).toBe('TEXTAREA');
    await expect(form.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  });

  test('the good-faith checkbox appears only for "Illegal content notice"', async ({ page }) => {
    const form = await open(page);
    const category = form.getByRole('combobox', { name: 'Category', exact: true });
    const goodFaith = page.getByRole('checkbox', { name: GOOD_FAITH_LABEL, exact: true });
    await category.selectOption({ label: 'Payment or refund' });
    await expect(goodFaith).toHaveCount(0);
    await category.selectOption({ label: 'Illegal content notice' });
    await expect(goodFaith).toBeVisible();
    await expect(goodFaith).not.toBeChecked();
    await category.selectOption({ label: 'Other' });
    await expect(goodFaith).toHaveCount(0);
  });

  test('the "website" honeypot exists but is not visible and not in the accessibility tree', async ({ page }) => {
    const form = await open(page);
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveCount(1);
    // Hidden from people by any of the usual means on the input or an ancestor: display/visibility/
    // opacity, a 1px clipped box, a clip rect or clip-path, or positioned off-screen.
    const seen = await honeypot.evaluate((el) => {
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        if ((r.width <= 1 || r.height <= 1) && (n === el || s.overflow !== 'visible')) return false;
        if (s.clip && s.clip !== 'auto') return false;
        if (s.clipPath && s.clipPath !== 'none') return false;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= document.documentElement.scrollWidth) return false;
      }
      return true;
    });
    expect(seen, 'honeypot visible to a person').toBe(false);
    await expect(form.getByRole('textbox', { name: /website/i })).toHaveCount(0);
    // Exactly the four visible text fields are in the accessibility tree.
    await expect(form.getByRole('textbox')).toHaveCount(4);
  });

  test('submitting empty shows linked field errors and sends nothing', async ({ page }) => {
    const sent = recordRequests(page, '/api/legal/complaints');
    const form = await open(page);
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    for (const [field, error] of [
      ['Your name', 'Enter your name.'],
      ['Email', 'Enter a valid email address.'],
      ['Message', 'Write at least 10 characters.'],
    ] as const) {
      await expect(form.getByText(error, { exact: true }), error).toBeVisible();
      const input = form.getByRole('textbox', { name: field, exact: true });
      await expect(input, `${field} described by its error`).toHaveAccessibleDescription(new RegExp(error.replace('.', '\\.')));
      const ids = ((await input.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
      expect(ids.length, `${field} aria-describedby`).toBeGreaterThan(0);
      const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()));
      expect(texts.join(' ')).toContain(error);
    }
    await page.waitForTimeout(300);
    expect(sent).toHaveLength(0);
  });

  test('an invalid email and a short message are refused without a request', async ({ page }) => {
    const sent = recordRequests(page, '/api/legal/complaints');
    const form = await open(page);
    await fillValid(form);
    await form.getByRole('textbox', { name: 'Email', exact: true }).fill('not-an-email');
    await form.getByRole('textbox', { name: 'Message', exact: true }).fill('short');
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(form.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
    await expect(form.getByText('Write at least 10 characters.', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    expect(sent).toHaveLength(0);
  });

  test('on 201 a status thanks the user and shows the reference', async ({ page }) => {
    await page.route(apiPath('/api/legal/complaints'), (route) => fulfillJson(route, { ok: true, reference: REF }, 201));
    const form = await open(page);
    await fillValid(form);
    const [req] = await Promise.all([
      page.waitForRequest((r) => isComplaint(r.url())),
      form.getByRole('button', { name: 'Send', exact: true }).click(),
    ]);
    expect(req.method()).toBe('POST');
    expect(req.postDataJSON()).toMatchObject({
      category: 'payment_refund',
      name: 'Cara Customer',
      email: 'cara@example.test',
      related: 'https://tulzo.online/gigs/contracts/abc',
      message: 'My top-up was charged twice on 10 October.',
    });
    const status = page.getByRole('status').filter({ hasText: 'Thanks' });
    await expect(status).toBeVisible();
    await expect(status).toContainText(REF);
  });

  test('an illegal content notice sends good_faith: true once ticked', async ({ page }) => {
    await page.route(apiPath('/api/legal/complaints'), (route) => fulfillJson(route, { ok: true, reference: REF }, 201));
    const form = await open(page);
    await fillValid(form);
    await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: 'Illegal content notice' });
    await page.getByRole('checkbox', { name: GOOD_FAITH_LABEL, exact: true }).check();
    const [req] = await Promise.all([
      page.waitForRequest((r) => isComplaint(r.url())),
      form.getByRole('button', { name: 'Send', exact: true }).click(),
    ]);
    expect(req.postDataJSON()).toMatchObject({ category: 'illegal_content', good_faith: true });
    await expect(page.getByRole('status').filter({ hasText: REF })).toBeVisible();
  });

  test('on 429 an alert says "Too many messages"', async ({ page }) => {
    await page.route(apiPath('/api/legal/complaints'), (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '3600' }, body: JSON.stringify({ error: 'rate_limited' }) }),
    );
    const form = await open(page);
    await fillValid(form);
    await form.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many messages' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Thanks' })).toHaveCount(0);
  });
});

test.describe('complaints form (signed in customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(() => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
  });

  test('"Your name" and "Email" are prefilled', async ({ page }) => {
    const form = await open(page);
    await waitForClerkUser(page);
    await expect(form.getByRole('textbox', { name: 'Your name', exact: true })).not.toHaveValue('');
    await expect(form.getByRole('textbox', { name: 'Email', exact: true })).not.toHaveValue('');
  });
});

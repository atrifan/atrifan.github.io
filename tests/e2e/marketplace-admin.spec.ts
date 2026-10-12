import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Moderation contract: GET /marketplace/admin (marketplace admins only).
 * Isolation: only fx-pending-mcp is approved, and only packages this file publishes are deleted.
 */

const PENDING = 'Pending Weather MCP';
const statusNav = (page: Page, name: 'Pending' | 'Public' | 'Private') =>
  page.getByRole('link', { name, exact: true });
const article = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test.describe('signed out', () => {
  test('admin redirects to sign-in', async ({ page }) => {
    await page.goto('/marketplace/admin');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('customer', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });

  test('is told the page is for admins only', async ({ page }) => {
    await page.goto('/marketplace/admin');
    await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Approve ${PENDING}` })).toHaveCount(0);
  });
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });
  // The listing test reads fx-pending-mcp before the approve test changes it.
  test.describe.configure({ mode: 'default' });

  test('lists pending packages by default with moderation buttons', async ({ page }) => {
    await page.goto('/marketplace/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Moderation' })).toBeVisible();
    await expect(statusNav(page, 'Pending')).toHaveAttribute('aria-current', 'true');
    await expect(statusNav(page, 'Public')).not.toHaveAttribute('aria-current', 'true');
    const a = article(page, PENDING);
    await expect(a).toBeVisible();
    for (const verb of ['Approve', 'Hide', 'Delete']) {
      await expect(a.getByRole('button', { name: `${verb} ${PENDING}`, exact: true })).toBeVisible();
    }
    await expect(article(page, 'GitHub Tools')).toHaveCount(0);
  });

  test('Public and Private lists are reachable and marked current', async ({ page }) => {
    await page.goto('/marketplace/admin');
    await statusNav(page, 'Public').click();
    await expect(page).toHaveURL(/status=public/);
    await expect(statusNav(page, 'Public')).toHaveAttribute('aria-current', 'true');
    await expect(statusNav(page, 'Pending')).not.toHaveAttribute('aria-current', 'true');
    await expect(article(page, 'GitHub Tools')).toBeVisible();
    await expect(article(page, 'Hidden Skill')).toHaveCount(0);

    await statusNav(page, 'Private').click();
    await expect(page).toHaveURL(/status=private/);
    await expect(statusNav(page, 'Private')).toHaveAttribute('aria-current', 'true');
    const hidden = article(page, 'Hidden Skill');
    await expect(hidden).toBeVisible();
    await expect(hidden.getByRole('button', { name: 'Approve Hidden Skill', exact: true })).toBeVisible();
    await expect(hidden.getByRole('button', { name: 'Delete Hidden Skill', exact: true })).toBeVisible();
    await expect(article(page, 'GitHub Tools')).toHaveCount(0);
  });

  test('approving a pending package publishes it as verified', async ({ page }) => {
    await page.goto('/marketplace/admin');
    await article(page, PENDING).getByRole('button', { name: `Approve ${PENDING}`, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `Approved ${PENDING}` })).toBeVisible();
    await expect(article(page, PENDING)).toHaveCount(0);

    await page.goto('/marketplace?kind=mcp');
    const c = page.getByRole('article', { name: PENDING, exact: true });
    await expect(c).toBeVisible();
    await expect(c.getByText('Verified', { exact: true })).toBeVisible();
  });

  test('deleting asks for confirmation and removes the package everywhere', async ({ page }) => {
    const r = Math.random().toString(36).slice(2, 10);
    const id = `e2e-mp-${r}`;
    const name = `E2E Delete ${r}`;
    await page.goto('/marketplace/publish');
    await page.getByLabel('Package id', { exact: true }).fill(id);
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Short description', { exact: true }).fill('Published to be deleted by an e2e spec.');
    await page.getByLabel('Kind', { exact: true }).selectOption({ label: 'MCP server' });
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Other' });
    await page.getByLabel('Transport', { exact: true }).selectOption({ label: 'HTTP' });
    await page.getByLabel('Server URL', { exact: true }).fill(`https://mcp.example.com/${id}`);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'pending review' })).toBeVisible();

    await page.goto('/marketplace/admin');
    const a = article(page, name);
    await expect(a).toBeVisible();
    await a.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
    const confirm = page.getByRole('button', { name: `Confirm delete ${name}`, exact: true });
    await expect(confirm).toBeVisible();
    await expect(article(page, name)).toBeVisible();
    await confirm.click();
    await expect(article(page, name)).toHaveCount(0);

    for (const status of ['pending', 'public', 'private']) {
      await page.goto(`/marketplace/admin?status=${status}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Moderation' })).toBeVisible();
      await expect(article(page, name), status).toHaveCount(0);
    }
  });
});

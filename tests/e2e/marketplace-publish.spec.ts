import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Publish contract: GET /marketplace/publish (sign-in required, paid plan or admin to publish).
 * Packages published here get unique `e2e-mp-<random>` ids and are deleted through the admin
 * moderation page afterwards, so they never reach the a11y/visual phase.
 */

const CATEGORY_LABELS = ['Developer tools', 'Productivity', 'Communication', 'Data', 'Research', 'Design', 'Security', 'Other'];
const KIND_LABELS = ['MCP server', 'Skill', 'Plugin', 'A2A agent', 'Sub-agent', 'Workflow'];

const unique = () => Math.random().toString(36).slice(2, 10);
const publishButton = (page: Page) => page.getByRole('button', { name: 'Publish', exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const yourPackageRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test.describe('signed out', () => {
  test('publish redirects to sign-in', async ({ page }) => {
    await page.goto('/marketplace/publish');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('customer on the Free plan', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });

  test('is told publishing needs a paid plan and gets no Publish button', async ({ page }) => {
    await page.goto('/marketplace/publish');
    await expect(page.getByRole('heading', { level: 1, name: 'Publish a package' })).toBeVisible();
    await expect(page.getByText('Publishing needs a paid plan')).toBeVisible();
    await expect(page.getByRole('link', { name: 'See plans' })).toBeVisible();
    await expect(publishButton(page)).toHaveCount(0);
  });
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  /** Names published by this file, deleted in afterAll. */
  const published: string[] = [];

  test.afterAll(async ({ browser, baseURL }) => {
    if (published.length === 0) return;
    const context = await browser.newContext({ baseURL, storageState: storageStatePath('admin') });
    const page = await context.newPage();
    await blockThirdParty(page);
    await setupClerkTestingToken({ page });
    try {
      for (const name of published) {
        for (const status of ['pending', 'public', 'private']) {
          await page.goto(`/marketplace/admin?status=${status}`);
          const del = page.getByRole('button', { name: `Delete ${name}`, exact: true });
          if ((await del.count()) === 0) continue;
          await del.click();
          await page.getByRole('button', { name: `Confirm delete ${name}`, exact: true }).click();
          await expect(page.getByRole('article', { name, exact: true })).toHaveCount(0);
        }
      }
    } finally {
      await context.close();
    }
  });

  async function openPublish(page: Page) {
    await page.goto('/marketplace/publish');
    await expect(page.getByRole('heading', { level: 1, name: 'Publish a package' })).toBeVisible();
  }

  async function fillCommon(page: Page, id: string, name: string, kind: string) {
    await field(page, 'Package id').fill(id);
    await field(page, 'Name').fill(name);
    await field(page, 'Short description').fill(`An e2e test package (${id}).`);
    await field(page, 'Kind').selectOption({ label: kind });
    await field(page, 'Category').selectOption({ label: 'Developer tools' });
    await field(page, 'Tags').fill('e2e, test');
    await field(page, 'Full description (Markdown)').fill(`# ${name}\n\nPublished by an e2e spec.`);
  }

  async function publishMcp(page: Page): Promise<{ id: string; name: string }> {
    const r = unique();
    const id = `e2e-mp-${r}`;
    const name = `E2E MCP ${r}`;
    await openPublish(page);
    await fillCommon(page, id, name, 'MCP server');
    await field(page, 'Transport').selectOption({ label: 'HTTP' });
    await field(page, 'Server URL').fill(`https://mcp.example.com/${id}`);
    await field(page, 'Tools').fill('ping: Answer pong\necho: Echo the input');
    published.push(name);
    await publishButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'pending review' })).toBeVisible();
    return { id, name };
  }

  test('shows the publish form with every field', async ({ page }) => {
    await openPublish(page);
    for (const label of ['Package id', 'Name', 'Short description', 'Kind', 'Version', 'Category', 'Tags', 'Full description (Markdown)']) {
      await expect(field(page, label), label).toBeVisible();
    }
    await expect(field(page, 'Version')).toHaveValue('1.0.0');
    const kinds = (await field(page, 'Kind').locator('option').allTextContents()).map((t) => t.trim()).filter(Boolean);
    expect(kinds).toEqual(KIND_LABELS);
    const categories = (await field(page, 'Category').locator('option').allTextContents()).map((t) => t.trim());
    expect(categories.filter((c) => CATEGORY_LABELS.includes(c))).toEqual(CATEGORY_LABELS);
    expect(categories).not.toContain('All categories');
    await expect(field(page, 'Full description (Markdown)')).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(publishButton(page)).toBeVisible();
  });

  test('the form adapts to the kind', async ({ page }) => {
    await openPublish(page);
    const kind = field(page, 'Kind');

    await kind.selectOption({ label: 'MCP server' });
    const transport = field(page, 'Transport');
    await expect(transport).toBeVisible();
    const transports = (await transport.locator('option').allTextContents()).map((t) => t.trim());
    expect(transports).toEqual(['HTTP', 'SSE', 'stdio']);
    await expect(field(page, 'Tools')).toBeVisible();
    for (const t of ['HTTP', 'SSE']) {
      await transport.selectOption({ label: t });
      await expect(field(page, 'Server URL')).toBeVisible();
      await expect(field(page, 'Command')).toBeHidden();
    }
    await transport.selectOption({ label: 'stdio' });
    await expect(field(page, 'Command')).toBeVisible();
    await expect(field(page, 'Arguments')).toBeVisible();
    await expect(field(page, 'Server URL')).toBeHidden();

    await kind.selectOption({ label: 'A2A agent' });
    await expect(field(page, 'Agent card URL')).toBeVisible();
    await expect(field(page, 'Transport')).toBeHidden();

    for (const k of ['Skill', 'Plugin', 'Sub-agent', 'Workflow']) {
      await kind.selectOption({ label: k });
      const archive = page.getByLabel('Package archive (.zip)');
      await expect(archive, k).toBeVisible();
      await expect(archive).toHaveAttribute('type', 'file');
      await expect(field(page, 'Server URL')).toBeHidden();
      await expect(field(page, 'Agent card URL')).toBeHidden();
    }
  });

  test('publishing an MCP server puts it in review, not on the catalog', async ({ page }) => {
    const { name } = await publishMcp(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Your packages' })).toBeVisible();
    const row = yourPackageRow(page, name);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Pending');

    await page.goto(`/marketplace?q=${encodeURIComponent(name)}`);
    await expect(page.getByText('No packages match your filters')).toBeVisible();
  });

  test('an HTTP MCP server without a Server URL is rejected', async ({ page }) => {
    const r = unique();
    const name = `E2E MCP ${r}`;
    await openPublish(page);
    await fillCommon(page, `e2e-mp-${r}`, name, 'MCP server');
    await field(page, 'Transport').selectOption({ label: 'HTTP' });
    await field(page, 'Server URL').fill('');
    published.push(name);
    await publishButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
    await expect(yourPackageRow(page, name)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Your packages' })).toBeVisible();
    await expect(yourPackageRow(page, name)).toHaveCount(0);
  });

  test('publishing an A2A agent puts it in review', async ({ page }) => {
    const r = unique();
    const name = `E2E A2A ${r}`;
    await openPublish(page);
    await fillCommon(page, `e2e-mp-${r}`, name, 'A2A agent');
    await field(page, 'Agent card URL').fill(`https://agents.example.com/${r}/.well-known/agent-card.json`);
    published.push(name);
    await publishButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'pending review' })).toBeVisible();
    await expect(yourPackageRow(page, name)).toContainText('Pending');
  });

  test('New version prefills the package and updates its row', async ({ page }) => {
    const { id, name } = await publishMcp(page);
    await page.reload();
    await page.getByRole('button', { name: `New version of ${name}`, exact: true }).click();
    const idField = field(page, 'Package id');
    await expect(idField).toHaveValue(id);
    await expect(idField).not.toBeEditable();
    await expect(field(page, 'Name')).toHaveValue(name);

    await field(page, 'Version').fill('1.1.0');
    // Fill whatever a new version still needs; the contract only fixes id, name and version.
    const description = field(page, 'Short description');
    if ((await description.inputValue()) === '') await description.fill(`An e2e test package (${id}).`);
    const kind = field(page, 'Kind');
    if (await kind.isEnabled()) await kind.selectOption({ label: 'MCP server' });
    const url = field(page, 'Server URL');
    if ((await url.isVisible()) && (await url.inputValue()) === '') await url.fill(`https://mcp.example.com/${id}`);
    await publishButton(page).click();

    await expect(page.getByRole('status').filter({ hasText: 'pending review' })).toBeVisible();
    const row = yourPackageRow(page, name);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('1.1.0');
    await expect(row).toContainText('Pending');
  });

  test('shows publisher totals', async ({ page }) => {
    await openPublish(page);
    for (const label of ['Total installs', 'Ratings', 'Packages']) {
      await expect(page.getByText(label, { exact: true }).first(), label).toBeVisible();
    }
  });
});

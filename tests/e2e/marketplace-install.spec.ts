import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { bridgeCommands, card, installCount, mockBridge, type BridgeOptions } from '../support/marketplace-bridge';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Install flow: the catalog's Install buttons talk to the Tulzo assistant extension over
 * window.postMessage (mocked in tests/support/marketplace-bridge.ts).
 * Isolation: this file only installs fx-release-workflow, fx-travel-a2a, fx-slack-plugin and
 * fx-sample-alpha, and only asserts "+1 after my own install" (read before and after).
 */

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test.describe('signed out', () => {
  test('Install goes to the sign-in page', async ({ page }) => {
    await page.goto('/marketplace');
    await card(page, 'Release Workflow').getByRole('button', { name: 'Install Release Workflow' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('signed in', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });

  async function openCatalog(page: Page, options?: BridgeOptions, path = '/marketplace') {
    if (options) await mockBridge(page, options);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
  }

  test('without the extension, Install explains that the assistant is needed', async ({ page }) => {
    await openCatalog(page);
    await card(page, 'Release Workflow').getByRole('button', { name: 'Install Release Workflow' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Install needs the Tulzo assistant' })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('link', { name: 'Get the assistant' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('installs an archive package (workflow) and counts the install', async ({ page }) => {
    await openCatalog(page, {});
    const before = await installCount(card(page, 'Release Workflow'));
    await card(page, 'Release Workflow').getByRole('button', { name: 'Install Release Workflow' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Installed Release Workflow' })).toBeVisible();
    const sent = await bridgeCommands(page, 'INSTALL_PACKAGE');
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({ type: 'workflow', id: 'fx-release-workflow', sourceType: 'archive' });
    expect(String(sent[0].params?.source)).toMatch(/\.zip$/);

    const button = card(page, 'Release Workflow').getByRole('button', { name: /Installed/ });
    await expect(button).toHaveText(/^\s*Installed\s*$/);
    await expect(button).toBeDisabled();

    await page.reload();
    await expect.poll(() => installCount(card(page, 'Release Workflow'))).toBe(before + 1);
  });

  test('installs a plugin with type plugin', async ({ page }) => {
    await openCatalog(page, {});
    const before = await installCount(card(page, 'Slack Notifier'));
    await card(page, 'Slack Notifier').getByRole('button', { name: 'Install Slack Notifier' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Installed Slack Notifier' })).toBeVisible();
    const sent = await bridgeCommands(page, 'INSTALL_PACKAGE');
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({ type: 'plugin', id: 'fx-slack-plugin', sourceType: 'archive' });
    expect(String(sent[0].params?.source)).toMatch(/\.zip$/);
    await page.reload();
    await expect.poll(() => installCount(card(page, 'Slack Notifier'))).toBe(before + 1);
  });

  test('installs an A2A agent with A2A_ADD_AGENT', async ({ page }) => {
    await openCatalog(page, {});
    const before = await installCount(card(page, 'Travel Planner Agent'));
    await card(page, 'Travel Planner Agent').getByRole('button', { name: 'Install Travel Planner Agent' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Installed Travel Planner Agent' })).toBeVisible();
    const sent = await bridgeCommands(page, 'A2A_ADD_AGENT');
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({
      id: 'marketplace__fx-travel-a2a',
      name: 'Travel Planner Agent',
      cardUrl: 'https://agents.example.com/travel/.well-known/agent-card.json',
      source: 'marketplace',
      packageId: 'fx-travel-a2a',
    });
    expect(await bridgeCommands(page, 'INSTALL_PACKAGE')).toHaveLength(0);
    const button = card(page, 'Travel Planner Agent').getByRole('button', { name: /Installed/ });
    await expect(button).toBeDisabled();
    await page.reload();
    await expect.poll(() => installCount(card(page, 'Travel Planner Agent'))).toBe(before + 1);
  });

  test('a failed install shows the error and is not counted', async ({ page }) => {
    await openCatalog(page, { errors: { INSTALL_PACKAGE: 'disk full' } });
    const before = await installCount(card(page, 'Sample Alpha'));
    await card(page, 'Sample Alpha').getByRole('button', { name: 'Install Sample Alpha' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Install failed' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('disk full');
    await expect(card(page, 'Sample Alpha').getByRole('button', { name: 'Install Sample Alpha' })).toBeEnabled();
    await expect(page.getByRole('status').filter({ hasText: 'Installed Sample Alpha' })).toHaveCount(0);

    await page.reload();
    await expect(card(page, 'Sample Alpha')).toBeVisible();
    expect(await installCount(card(page, 'Sample Alpha'))).toBe(before);
  });

  const INSTALLED: BridgeOptions = {
    results: {
      LIST_INSTALLED: { ok: true, packages: [{ id: 'fx-pdf-skill', type: 'skill', version: '1.2.0' }] },
      MCP_LIST_SERVERS: { servers: [{ id: 'marketplace__fx-github-mcp', name: 'GitHub Tools', connected: true }] },
    },
  };

  test('Installed only shows exactly the packages the assistant has', async ({ page }) => {
    await openCatalog(page, INSTALLED, '/marketplace?installed=1');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(2);
    for (const name of ['GitHub Tools', 'PDF Summarizer']) {
      const button = card(page, name).getByRole('button', { name: /Installed/ });
      await expect(button).toBeVisible();
      await expect(button).toBeDisabled();
    }
  });

  test('installed packages read Installed in the full catalog too', async ({ page }) => {
    await openCatalog(page, INSTALLED);
    for (const name of ['GitHub Tools', 'PDF Summarizer']) {
      const button = card(page, name).getByRole('button', { name: /Installed/ });
      await expect(button).toBeVisible();
      await expect(button).toBeDisabled();
      await expect(card(page, name).getByRole('button', { name: `Install ${name}`, exact: true })).toHaveCount(0);
    }
    for (const name of ['Slack Notifier', 'Code Reviewer']) {
      await expect(card(page, name).getByRole('button', { name: `Install ${name}`, exact: true })).toBeEnabled();
    }
  });
});

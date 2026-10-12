import { test as base } from '@playwright/test';
import {
  AI_PAGES,
  DEVICE_NAME,
  NAV_LABELS,
  aiPage,
  expect,
  fakeDevice,
  openAi,
  signedIn,
  test,
} from '../support/ai-fixtures';
import type { BridgeCommand } from '../support/mock-bridge';

/**
 * ai. control panel: routing, navigation, page chrome, bridge status and the states
 * every device-backed page shares (not connected, loading, error + Retry, empty).
 * Page-specific behaviour lives in the other tests/e2e/ai-*.spec.ts files.
 */

test.describe('ai panel routing and chrome (signed in)', () => {
  signedIn();

  for (const p of AI_PAGES) {
    test(`${p.path}: title, h1, noindex, nav, no ads, not-connected status`, async ({ page }) => {
      await openAi(page, p.path);
      await expect(page).toHaveTitle(`${p.label} · AI · Tulzo`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('[data-ad-slot]')).toHaveCount(0);

      const nav = page.getByRole('navigation', { name: 'AI sections', exact: true });
      await expect(nav.getByRole('link')).toHaveText(NAV_LABELS);
      const current = nav.getByRole('link', { name: p.label, exact: true });
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);

      await expect(page.getByText('Extension not connected', { exact: true })).toHaveCount(1);
      await expect(page.getByText(/^Extension connected/)).toHaveCount(0);
    });

    test(`${p.path}: shows the connected bridge status once`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      await openAi(page, p.path);
      await expect(page.getByText(`Extension connected · ${DEVICE_NAME}`, { exact: true })).toHaveCount(1);
      await expect(page.getByText('Extension not connected', { exact: true })).toHaveCount(0);
    });
  }

  test('nav links go to each page', async ({ page }) => {
    await openAi(page, '/ai');
    const nav = page.getByRole('navigation', { name: 'AI sections', exact: true });
    for (const p of [...AI_PAGES.slice(1), AI_PAGES[0]]) {
      await nav.getByRole('link', { name: p.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${p.path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('h1')).toHaveText(p.h1);
      await expect(nav.getByRole('link', { name: p.label, exact: true })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('unknown /ai tab is a 404', async ({ page }) => {
    const res = await page.goto('/ai/not-a-tab');
    expect(res?.status()).toBe(404);
  });

  test('/dashboard redirects to /ai', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/ai$/);
    await expect(page.locator('h1')).toHaveText('Overview');
  });

  test('docs work without the extension', async ({ page }) => {
    await openAi(page, '/ai/docs');
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  });
});

base.describe('ai panel signed out', () => {
  base.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ['/ai', '/ai/secrets', '/ai/devices']) {
    base(`${path} sends a signed-out visitor to /sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }
});

// ---------------------------------------------------------------- shared device-backed states

interface DevicePage {
  name: string;
  /** The first list command; failing it shows the error, holding it shows "Loading…". */
  list: BridgeCommand;
  /** Every command sent on load (for the loading state, all are held). */
  load: BridgeCommand[];
  empty: string[];
}

const DEVICE_PAGES: DevicePage[] = [
  { name: 'logs', list: 'GET_LOGS', load: ['GET_LOGS'], empty: ['No device logs.'] },
  {
    name: 'packages',
    list: 'LIST_INSTALLED',
    load: ['LIST_INSTALLED', 'LIST_SKILLS'],
    empty: ['No packages installed.', 'No skills on this device.', 'No plugins on this device.'],
  },
  { name: 'mcp', list: 'MCP_LIST_SERVERS', load: ['MCP_LIST_SERVERS'], empty: ['No MCP servers yet.'] },
  { name: 'schedules', list: 'SCHEDULE_LIST', load: ['SCHEDULE_LIST'], empty: ['No schedules yet.'] },
  { name: 'secrets', list: 'SECRETS_LIST', load: ['SECRETS_LIST'], empty: ['No secrets yet.'] },
  { name: 'allowlist', list: 'WHITELIST_LIST', load: ['WHITELIST_LIST'], empty: ['No allowed sites yet.'] },
  { name: 'a2a', list: 'A2A_LIST_AGENTS', load: ['A2A_LIST_AGENTS'], empty: ['No A2A peers yet.'] },
  {
    name: 'fleet',
    list: 'LIST_FLEET',
    load: ['LIST_FLEET', 'LIST_QUEUE', 'DAEMON_BROWSER_STATUS'],
    empty: ['Nothing running right now.', 'The queue is empty.'],
  },
  { name: 'notifications', list: 'NOTIFICATION_GET_CONFIG', load: ['NOTIFICATION_GET_CONFIG'], empty: [] },
  {
    name: 'providers',
    list: 'GET_PROVIDERS',
    load: ['GET_PROVIDERS', 'GET_VERSION'],
    empty: ['No providers configured on this device.'],
  },
];

test.describe('device-backed pages share their states', () => {
  signedIn();

  for (const d of DEVICE_PAGES) {
    const p = aiPage(d.name);

    test(`${p.path}: not connected shows the install prompt and sends nothing`, async ({ page, bridge }) => {
      await bridge.install({ connected: false });
      await openAi(page, p.path);
      await expect(page.getByRole('heading', { name: 'Connect the extension', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'How to install', exact: true })).toHaveAttribute('href', '/ai/docs');
      // Give the page time to (wrongly) send something.
      await page.waitForTimeout(1500);
      expect(bridge.calls).toEqual([]);
    });

    test(`${p.path}: shows Loading… while the list is pending`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      for (const c of d.load) bridge.hold(c);
      await openAi(page, p.path);
      await expect(page.getByText('Loading…').first()).toBeVisible();
      for (const c of d.load) bridge.release(c);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Loading…')).toHaveCount(0);
    });

    test(`${p.path}: list error shows an alert and Retry resends`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      bridge.fail(d.list, 'Device not authorized');
      await openAi(page, p.path);
      await expect(page.getByRole('alert').filter({ hasText: 'Device not authorized' }).first()).toBeVisible();
      await expect(page.getByText(p.ready, { exact: true })).toHaveCount(0);
      const before = bridge.callsOf(d.list).length;
      bridge.recover(d.list);
      await page.getByRole('button', { name: 'Retry', exact: true }).first().click();
      await bridge.expectCount(d.list, before + 1);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: 'Device not authorized' })).toHaveCount(0);
    });

    if (d.empty.length) {
      test(`${p.path}: empty device shows the empty state`, async ({ page, bridge }) => {
        await bridge.install({ handlers: fakeDevice({ empty: true }) });
        await openAi(page, p.path);
        for (const e of d.empty) await expect(page.getByText(e, { exact: true })).toBeVisible();
      });
    }

    test(`${p.path}: populated device shows its data`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      await openAi(page, p.path);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Connect the extension' })).toHaveCount(0);
      for (const c of d.load) {
        await expect.poll(() => bridge.callsOf(c).length, { message: `${c} sent on load` }).toBeGreaterThan(0);
      }
    });
  }
});

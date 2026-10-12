import { existsSync, readFileSync } from 'node:fs';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

/**
 * The ai. control panel against the REAL Tex extension and a real (isolated) native host.
 *
 * Opt-in (project `live-extension`, see playwright.config.ts). It needs:
 * - AI_EXTENSION_DIR: an unpacked build of assistant/plugin whose manifest also matches
 *   `http://localhost/*` for the control-plane bridge (the shipped one only matches the tulzo domains);
 * - AI_EXTENSION_PROFILE: a Chromium user-data dir with NativeMessagingHosts/com.assistant.host.json
 *   pointing at a native host launcher that keeps all its state in a scratch directory;
 * - a signed-in Clerk session (the `setup` project) and the Tulzo dev server at PLAYWRIGHT_BASE_URL.
 *
 * Each section is driven through its UI and the device's answer must show up there: a round trip
 * page → content script → service worker → native host → back.
 */

const EXT = process.env.AI_EXTENSION_DIR ?? '';
const PROFILE = process.env.AI_EXTENSION_PROFILE ?? '';
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const ready = !!EXT && !!PROFILE && existsSync(EXT) && existsSync(PROFILE);

test.describe.configure({ mode: 'serial' });
test.skip(!ready, 'AI_EXTENSION_DIR / AI_EXTENSION_PROFILE not set');
test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');

let context: BrowserContext;
let page: Page;

const THIRD_PARTY = /(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/;

async function open(path: string, h1: string) {
  await page.goto(BASE + path);
  await expect(page.locator('h1')).toHaveText(h1, { timeout: 30_000 });
  await expect(page.getByText(/^Extension connected/)).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const state = JSON.parse(readFileSync(storageStatePath('customer'), 'utf8')) as { cookies: Parameters<BrowserContext['addCookies']>[0] };
  await context.addCookies(state.cookies);
  await context.route(THIRD_PARTY, (r) => r.abort('blockedbyclient'));
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  expect(worker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\/worker\.js$/);
  page = context.pages()[0] ?? (await context.newPage());

  // The real extension answers the page's discover, so the panel shows it as connected.
  await open('/ai', 'Overview');
  // Pair the device: the extension saves the key in the (isolated) native host; commands are refused until then.
  await page.evaluate(() => window.postMessage({ source: 'tulzo', action: 'activate_device', apiKey: 'tlz_live_e2e_key', deviceName: 'Live test device' }, '*'));
  await expect
    .poll(
      async () => {
        await page.goto(BASE + '/ai/secrets');
        await expect(page.locator('h1')).toHaveText('Secrets');
        const added = page.getByRole('heading', { name: 'Add a secret' });
        const alert = page.getByRole('alert');
        await expect(added.or(alert).first()).toBeVisible({ timeout: 20_000 });
        return added.isVisible();
      },
      { timeout: 90_000, intervals: [2000] },
    )
    .toBe(true);
});

test.afterAll(async () => {
  await context?.close();
});

test('Secrets: add, edit and remove round-trip through SECRETS_*', async () => {
  await open('/ai/secrets', 'Secrets');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('LIVE_TEST_TOKEN');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('from the live test');
  await page.getByLabel('Value', { exact: true }).fill('live-secret-value');
  await page.getByRole('button', { name: 'Add secret' }).click();
  await expect(page.getByText('LIVE_TEST_TOKEN', { exact: true })).toBeVisible();
  await expect(page.getByText('from the live test', { exact: true })).toBeVisible();
  await expect(page.getByText('live-secret-value')).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit LIVE_TEST_TOKEN' }).click();
  await page.getByRole('textbox', { name: 'Description for LIVE_TEST_TOKEN' }).fill('edited live');
  await page.getByRole('button', { name: 'Save LIVE_TEST_TOKEN' }).click();
  await expect(page.getByText('edited live', { exact: true })).toBeVisible();

  // The list comes from the device: reload and it is still there.
  await open('/ai/secrets', 'Secrets');
  await expect(page.getByText('LIVE_TEST_TOKEN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove LIVE_TEST_TOKEN' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByText('LIVE_TEST_TOKEN', { exact: true })).toHaveCount(0);
});

test('Allowlist: add and remove a host through WHITELIST_*', async () => {
  await open('/ai/allowlist', 'Site allowlist');
  await page.getByRole('textbox', { name: 'Host' }).fill(' Live-Test.Example.com ');
  await page.getByRole('button', { name: 'Allow site' }).click();
  await expect(page.getByText('live-test.example.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove live-test.example.com' }).click();
  await expect(page.getByText('live-test.example.com', { exact: true })).toHaveCount(0);
});

test('Schedules: add, pause, history, reload declared and remove', async () => {
  await open('/ai/schedules', 'Schedules');
  await page.getByRole('textbox', { name: 'Cron expression' }).fill('0 9 * * 1');
  await page.getByRole('textbox', { name: 'Prompt' }).fill('Live test schedule');
  await page.getByRole('button', { name: 'Add schedule' }).click();
  await expect(page.getByText('Live test schedule', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause schedule: Live test schedule' }).click();
  await expect(page.getByRole('button', { name: 'Resume schedule: Live test schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Run history: Live test schedule' }).click();
  await expect(page.getByText('No runs this month.')).toBeVisible();
  await page.getByRole('button', { name: 'Reload declared schedules' }).click();
  await expect(page.getByText(/^Reloaded: \d+ added, \d+ updated, \d+ removed$/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove schedule: Live test schedule' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByText('Live test schedule', { exact: true })).toHaveCount(0);
});

test('MCP servers: add, check sign-in, disable, reconnect, remove', async () => {
  await open('/ai/mcp', 'MCP servers');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Live MCP');
  await page.getByRole('textbox', { name: 'Server URL' }).fill('http://127.0.0.1:9/mcp');
  await page.getByRole('button', { name: 'Check sign-in' }).click();
  await expect(page.getByText('No sign-in found', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add server' }).click();
  await expect(page.getByText('Live MCP', { exact: true })).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByRole('switch', { name: 'Live MCP enabled' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked({ timeout: 30_000 });
  await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect Live MCP' }).click();
  await page.getByRole('button', { name: 'Remove Live MCP' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByText('Live MCP', { exact: true })).toHaveCount(0, { timeout: 30_000 });
});

test('A2A peers: preview error, add, disable, remove', async () => {
  await open('/ai/a2a', 'A2A peers');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Live peer');
  await page.getByRole('textbox', { name: 'Agent card URL' }).fill('http://127.0.0.1:9/agent.json');
  await page.getByRole('button', { name: 'Preview card' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add peer' }).click();
  await expect(page.getByText('Live peer', { exact: true })).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByRole('switch', { name: 'Live peer enabled' });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Remove Live peer' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByText('Live peer', { exact: true })).toHaveCount(0);
});

test('Packages and skills: the device lists what it has (LIST_INSTALLED, LIST_SKILLS)', async () => {
  await open('/ai/packages', 'Packages and skills');
  await expect(page.getByText('No packages installed.').or(page.getByRole('list', { name: 'Installed packages' }))).toBeVisible();
  await expect(page.getByText('No skills on this device.').or(page.getByRole('list', { name: 'Skills' }))).toBeVisible();
  await expect(page.getByText('No plugins on this device.').or(page.getByRole('list', { name: 'Plugins' }))).toBeVisible();
});

// Needs a skill named "Live skill" (with a settings_file) on the device, and optionally a user-installed
// "Live user skill"; the harness that prepares the isolated host provides them.
test('Skills: enable toggle, activation, settings and delete (SKILL_SET_*, GET/SET_SKILL_SETTINGS, DELETE_SKILL)', async () => {
  await open('/ai/packages', 'Packages and skills');
  const toggle = page.getByRole('switch', { name: 'Live skill enabled' });
  await expect(page.getByText('No skills on this device.').or(page.getByRole('list', { name: 'Skills' }))).toBeVisible();
  test.skip(!(await toggle.isVisible().catch(() => false)), 'no "Live skill" on this device');
  const was = (await toggle.getAttribute('aria-checked')) === 'true';
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(!was), { timeout: 30_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(was), { timeout: 30_000 });

  const activation = page.getByRole('combobox', { name: 'Activation for Live skill' });
  await activation.selectOption({ label: 'Always' });
  await expect(activation).toHaveValue('always', { timeout: 30_000 });
  await activation.selectOption({ label: 'Follow the skill file' });
  await expect(activation).toHaveValue('', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Settings for Live skill' }).click();
  const dialog = page.getByRole('dialog', { name: 'live-config.yaml' });
  const yaml = dialog.getByRole('textbox', { name: 'Settings (YAML)' });
  await expect(yaml).toHaveValue(/greeting:/);
  const mark = `run-${Date.now()}`;
  await yaml.fill(`greeting: ${mark}\n`);
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings for Live skill' }).click();
  await expect(page.getByRole('dialog', { name: 'live-config.yaml' }).getByRole('textbox', { name: 'Settings (YAML)' })).toHaveValue(new RegExp(mark));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const del = page.getByRole('button', { name: 'Delete Live user skill' });
  if (await del.isVisible().catch(() => false)) {
    await del.click();
    await page.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(page.getByRole('switch', { name: 'Live user skill enabled' })).toHaveCount(0, { timeout: 30_000 });
  }
});

test('Plugins: enable toggle (PLUGIN_SET_ENABLED)', async () => {
  await open('/ai/packages', 'Packages and skills');
  await expect(page.getByText('No plugins on this device.').or(page.getByRole('list', { name: 'Plugins' }))).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Live plugin enabled' });
  test.skip(!(await toggle.isVisible()), 'no "Live plugin" on this device');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
  await open('/ai/packages', 'Packages and skills');
  await expect(page.getByRole('switch', { name: 'Live plugin enabled' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Live plugin enabled' }).click();
  await expect(page.getByRole('switch', { name: 'Live plugin enabled' })).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
});

test('Headless browser: start and stop (DAEMON_BROWSER_START/STOP)', async () => {
  test.setTimeout(180_000);
  await open('/ai/fleet', 'Fleet');
  const start = page.getByRole('button', { name: 'Start browser' });
  const stop = page.getByRole('button', { name: 'Stop browser' });
  await expect(start.or(stop)).toBeVisible();
  if (await start.isVisible()) {
    await start.click();
    // Either the device started it, or it says why it could not: both are the device's answer, shown here.
    await expect(stop.or(page.locator('#main').getByRole('alert'))).toBeVisible({ timeout: 120_000 });
    const outcome = (await stop.isVisible()) ? 'started' : `refused: ${await page.locator('#main').getByRole('alert').innerText()}`;
    test.info().annotations.push({ type: 'browser-start', description: outcome });
    console.log(`[live] DAEMON_BROWSER_START ${outcome}`);
  }
  if (await stop.isVisible()) {
    await stop.click();
    await expect(start).toBeVisible({ timeout: 60_000 });
  }
});

test('Usage: device usage and every breakdown answer (GET_USAGE, GET_USAGE_BY_*)', async () => {
  await open('/ai/usage', 'Usage');
  const device = page.getByRole('region', { name: 'Device usage' });
  await expect(device.getByText(/^\$\d+\.\d\d$|^<\$0\.01$/).first()).toBeVisible();
  for (const kind of ['By conversation', 'By schedule', 'By agent', 'By month']) {
    await page.getByRole('button', { name: kind }).click();
    await expect(page.getByRole('button', { name: kind })).toHaveAttribute('aria-pressed', 'true');
    await expect(device.getByText('No usage recorded for this period.').or(device.getByRole('table'))).toBeVisible();
    await expect(device.getByRole('alert')).toHaveCount(0);
  }
});

test('Fleet: fleet, queue and headless browser status (LIST_FLEET, LIST_QUEUE, DAEMON_BROWSER_STATUS)', async () => {
  await open('/ai/fleet', 'Fleet');
  await expect(page.getByText(/^\d+ running · \d+ waiting · \d+ pending$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Start|Stop) browser$/ })).toBeVisible();
  await expect(page.locator('#main').getByRole('alert')).toHaveCount(0);
});

test('Notifications: change the sound setting and it persists (NOTIFICATION_GET/SET_CONFIG)', async () => {
  await open('/ai/notifications', 'Notifications');
  const sound = page.getByRole('switch', { name: 'Play a sound' });
  const before = (await sound.getAttribute('aria-checked')) === 'true';
  await sound.click();
  await page.getByRole('button', { name: 'Save notification settings' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await open('/ai/notifications', 'Notifications');
  await expect(page.getByRole('switch', { name: 'Play a sound' })).toHaveAttribute('aria-checked', String(!before));
});

test('Providers and version (GET_PROVIDERS, GET_VERSION)', async () => {
  await open('/ai/providers', 'Providers');
  await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText('No providers configured on this device.').or(page.getByRole('list', { name: 'Model providers' }))).toBeVisible();
});

test('Logs: device log entries (GET_LOGS)', async () => {
  await open('/ai/logs', 'Logs');
  await expect(page.getByRole('list', { name: 'Device log entries' }).or(page.getByText('No device logs.'))).toBeVisible();
  await expect(page.getByRole('region', { name: 'Device logs' }).getByRole('alert')).toHaveCount(0);
});

test('Overview: onboarding round trip (GET_ONBOARDING_STATE, SET_ONBOARDING_COMPLETED)', async () => {
  await open('/ai', 'Overview');
  await expect(page.getByRole('region', { name: 'This device' }).getByText('Monthly cost')).toBeVisible();
  const finish = page.getByRole('button', { name: 'Mark setup complete' });
  if (await finish.isVisible()) {
    await finish.click();
    await expect(page.getByText('Setup complete', { exact: true })).toBeVisible();
  }
  await open('/ai', 'Overview');
  await expect(page.getByRole('heading', { name: 'Finish setting up' })).toHaveCount(0);
});

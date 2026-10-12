import {
  GENERATED_KEY,
  NEVER_CONNECTED_DEVICE,
  expect,
  fakeDevice,
  openAi,
  signedIn,
  test,
  text,
} from '../support/ai-fixtures';

/** Overview, Devices and Usage: server-backed pages with connected-only device sections. */

test.describe('Overview /ai', () => {
  signedIn();

  test('shows plan, device count, request stats, activity and billing link', async ({ page }) => {
    await openAi(page, '/ai');
    await expect(text(page, 'Pro')).toBeVisible();
    await expect(text(page, '2 / 3')).toBeVisible();
    await expect(text(page, 'API requests today')).toBeVisible();
    await expect(text(page, '17')).toBeVisible();
    await expect(text(page, 'API requests this month')).toBeVisible();
    await expect(text(page, '345')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
    await expect(page.getByText(/^API request\b/)).toHaveCount(2);
    await expect(page.getByText(/^Key verified\b/)).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Credits and billing', exact: true })).toHaveAttribute('href', '/credits');
  });

  test('empty timeline says so', async ({ page, server }) => {
    server.state.activity = { timeline: [], event_counts: {} };
    await openAi(page, '/ai');
    await expect(text(page, 'No activity yet.')).toBeVisible();
  });

  test('not connected: no onboarding check, no device section', async ({ page, bridge }) => {
    await bridge.install({ connected: false });
    await openAi(page, '/ai');
    await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(bridge.calls).toEqual([]);
    await expect(page.getByRole('heading', { name: 'This device', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Finish setting up', exact: true })).toHaveCount(0);
  });

  test('connected, onboarding incomplete: Mark setup complete sends SET_ONBOARDING_COMPLETED', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice({ onboardingCompleted: false }) });
    await openAi(page, '/ai');
    await bridge.expectSent('GET_ONBOARDING_STATE', {});
    await expect(page.getByRole('heading', { name: 'Finish setting up', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark setup complete', exact: true }).click();
    await bridge.expectSent('SET_ONBOARDING_COMPLETED', { completed: true });
    await expect(text(page, 'Setup complete')).toBeVisible();
  });

  test('connected, onboarding complete: no setup prompt', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice({ onboardingCompleted: true }) });
    await openAi(page, '/ai');
    await bridge.expectSent('GET_ONBOARDING_STATE', {});
    await expect(page.getByRole('heading', { name: 'This device', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finish setting up', exact: true })).toHaveCount(0);
  });

  test('connected: This device shows monthly cost and active model', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai');
    await expect(page.getByRole('heading', { name: 'This device', exact: true })).toBeVisible();
    await expect(text(page, 'Monthly cost')).toBeVisible();
    await expect(text(page, '$12.34')).toBeVisible();
    await expect(text(page, 'Active model')).toBeVisible();
    await expect(text(page, 'claude-sonnet-5-5')).toBeVisible();
  });
});

test.describe('Devices /ai/devices', () => {
  signedIn();

  test('lists devices with key suffix and status', async ({ page, server }) => {
    server.state.devices.push({ ...NEVER_CONNECTED_DEVICE });
    await openAi(page, '/ai/devices');
    for (const [name, suffix, status] of [
      ['Work laptop', 'a1b2', 'Online'],
      ['Home desktop', 'c3d4', 'Offline'],
      ['Spare mini', 'e5f6', 'Never connected'],
    ]) {
      await expect(text(page, name)).toBeVisible();
      await expect(text(page, `Key ending ${suffix}`)).toBeVisible();
      await expect(text(page, status)).toBeVisible();
    }
  });

  test('Add device is disabled at the device limit', async ({ page, server }) => {
    server.state.devices.push({ ...NEVER_CONNECTED_DEVICE });
    await openAi(page, '/ai/devices');
    await expect(text(page, 'Spare mini')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add device', exact: true })).toBeDisabled();
  });

  test('Add device generates a key (not connected: no Send to extension)', async ({ page, server }) => {
    await openAi(page, '/ai/devices');
    await page.getByRole('button', { name: 'Add device', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add device' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Device name' }).fill('Travel tablet');
    await dialog.getByRole('button', { name: 'Generate key', exact: true }).click();
    await expect.poll(() => server.generated).toEqual([{ device_name: 'Travel tablet' }]);
    await expect(dialog.getByText(GENERATED_KEY).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy key', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send to extension', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('connected: Send to extension posts activate_device with the key', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/devices');
    await page.getByRole('button', { name: 'Add device', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add device' });
    await dialog.getByRole('textbox', { name: 'Device name' }).fill('Travel tablet');
    await dialog.getByRole('button', { name: 'Generate key', exact: true }).click();
    await dialog.getByRole('button', { name: 'Send to extension', exact: true }).click();
    await expect.poll(() => bridge.activations.map((a) => a.apiKey)).toEqual([GENERATED_KEY]);
  });

  test('device limit reached on generate shows an alert', async ({ page, server }) => {
    server.state.generateLimitReached = true;
    await openAi(page, '/ai/devices');
    await page.getByRole('button', { name: 'Add device', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add device' });
    await dialog.getByRole('textbox', { name: 'Device name' }).fill('One too many');
    await dialog.getByRole('button', { name: 'Generate key', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Device limit reached' })).toBeVisible();
  });

  test('Revoke then Confirm revoke deletes the key', async ({ page, server }) => {
    await openAi(page, '/ai/devices');
    await page.getByRole('button', { name: 'Revoke Work laptop', exact: true }).click();
    expect(server.deleted).toEqual([]);
    await page.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
    await expect.poll(() => server.deleted).toEqual([{ keyId: 'dev_1' }]);
    await expect(page.getByText('Work laptop', { exact: true })).toHaveCount(0);
    await expect(text(page, 'Home desktop')).toBeVisible();
  });

  test('no devices', async ({ page, server }) => {
    server.state.devices = [];
    await openAi(page, '/ai/devices');
    await expect(text(page, 'No devices yet.')).toBeVisible();
  });
});

test.describe('Usage /ai/usage', () => {
  signedIn();

  test('Tulzo API usage numbers and billing link; not connected prompt', async ({ page, bridge }) => {
    await bridge.install({ connected: false });
    await openAi(page, '/ai/usage');
    await expect(page.getByRole('heading', { name: 'Tulzo API usage', exact: true })).toBeVisible();
    for (const [label, value] of [['Total requests', '987'], ['Today', '17'], ['This month', '345']]) {
      await expect(text(page, label)).toBeVisible();
      await expect(text(page, value)).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Credits and billing', exact: true })).toHaveAttribute('href', '/credits');
    await expect(text(page, 'Connect the extension to see device usage.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect the extension', exact: true })).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(bridge.calls).toEqual([]);
  });

  test('connected: device usage this month and the conversation breakdown', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/usage');
    await expect(page.getByRole('heading', { name: 'Device usage', exact: true })).toBeVisible();
    await bridge.expectSent('GET_USAGE', {});
    await expect(text(page, '$12.34')).toBeVisible();
    await expect(page.getByRole('button', { name: 'By conversation', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['By schedule', 'By agent', 'By month']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2026-10');
    await bridge.expectSent('GET_USAGE_BY_SESSION', { month: '2026-10' });
    await expect(text(page, 'Planning chat')).toBeVisible();
    await expect(text(page, '$0.42')).toBeVisible();
    await expect(text(page, '7')).toBeVisible();
    await expect(text(page, 'Quick question')).toBeVisible();
    await expect(text(page, '<$0.01')).toBeVisible();
    await expect(text(page, 'Not attributed to a row: $11.92')).toBeVisible();
  });

  test('breakdown toggles send the right command', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/usage');
    await bridge.expectSent('GET_USAGE_BY_SESSION', { month: '2026-10' });

    await page.getByRole('button', { name: 'By schedule', exact: true }).click();
    await bridge.expectSent('GET_USAGE_BY_SCHEDULE', { month: '2026-10' });
    await expect(page.getByRole('button', { name: 'By schedule', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(text(page, 'Summarise my inbox')).toBeVisible();
    await expect(text(page, '$1.50')).toBeVisible();

    await page.getByRole('button', { name: 'By agent', exact: true }).click();
    await bridge.expectSent('GET_USAGE_BY_AGENT', { month: '2026-10' });
    await expect(text(page, 'researcher')).toBeVisible();
    await expect(text(page, '$2.25')).toBeVisible();

    await page.getByRole('button', { name: 'By month', exact: true }).click();
    await bridge.expectSent('GET_USAGE_BY_MONTH', { year: '2026' });
    await expect(page.getByLabel('Year', { exact: true })).toHaveValue('2026');
    await expect(text(page, '2026-09')).toBeVisible();
    await expect(text(page, '$30.50')).toBeVisible();
  });

  test('changing Month or Year re-sends with the new value', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/usage');
    await bridge.expectSent('GET_USAGE_BY_SESSION', { month: '2026-10' });
    await page.getByLabel('Month', { exact: true }).fill('2026-09');
    await bridge.expectSent('GET_USAGE_BY_SESSION', { month: '2026-09' });

    await page.getByRole('button', { name: 'By month', exact: true }).click();
    await bridge.expectSent('GET_USAGE_BY_MONTH', { year: '2026' });
    await page.getByLabel('Year', { exact: true }).fill('2025');
    await bridge.expectSent('GET_USAGE_BY_MONTH', { year: '2025' });
  });

  test('no rows for the period', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice({ empty: true }) });
    await openAi(page, '/ai/usage');
    await expect(text(page, 'No usage recorded for this period.')).toBeVisible();
    await expect(page.getByText(/^Not attributed to a row/)).toHaveCount(0);
  });
});

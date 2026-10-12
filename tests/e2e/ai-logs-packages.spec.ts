import { SKILL_SETTINGS, expect, fakeDevice, openAi, signedIn, test, text } from '../support/ai-fixtures';

test.describe('Logs /ai/logs', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/logs');
  });

  test('loads device logs with GET_LOGS {}', async ({ page, bridge }) => {
    await bridge.expectSent('GET_LOGS', {});
    for (const m of ['Daemon started', 'Token refresh took 4s', 'MCP server Filesystem exited']) {
      await expect(text(page, m)).toBeVisible();
    }
  });

  test('a date button loads that day', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: '2026-10-12', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '2026-10-11', exact: true }).click();
    await bridge.expectSent('GET_LOGS', { date: '2026-10-11' });
    await expect(text(page, 'Older log line')).toBeVisible();
    await expect(page.getByText('Daemon started', { exact: true })).toHaveCount(0);
  });

  test('level toggles filter the list', async ({ page }) => {
    for (const level of ['info', 'warn', 'error']) {
      await expect(page.getByRole('button', { name: level, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'warn', exact: true }).click();
    await expect(page.getByRole('button', { name: 'warn', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Token refresh took 4s', { exact: true })).toHaveCount(0);
    await expect(text(page, 'Daemon started')).toBeVisible();
    await expect(text(page, 'MCP server Filesystem exited')).toBeVisible();
  });

  test('search filters by message text', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Search logs' }).fill('filesystem');
    await expect(text(page, 'MCP server Filesystem exited')).toBeVisible();
    await expect(page.getByText('Daemon started', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Token refresh took 4s', { exact: true })).toHaveCount(0);
  });

  test('bridge messages section with Clear', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bridge messages', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bridge messages', exact: true })).toBeVisible();
  });
});

test.describe('Packages /ai/packages', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/packages');
    await expect(page.getByRole('heading', { name: 'Installed packages', exact: true })).toBeVisible();
  });

  test('lists packages, skills, plugins and the marketplace link', async ({ page }) => {
    await expect(text(page, 'research-pack')).toBeVisible();
    await expect(text(page, 'v1.2.0')).toBeVisible();
    await expect(text(page, 'pdf-tools')).toBeVisible();
    await expect(text(page, 'v0.3.1')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Web research enabled', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'PDF reader enabled', exact: true })).not.toBeChecked();
    await expect(page.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Research pack enabled', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Core tools enabled', exact: true })).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Browse the marketplace', exact: true })).toHaveAttribute('href', '/marketplace');
  });

  test('Update sends UPDATE_PACKAGE and shows the new version', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Update research-pack', exact: true }).click();
    await bridge.expectSent('UPDATE_PACKAGE', { id: 'research-pack' });
    await expect(text(page, 'v1.3.0')).toBeVisible();
  });

  test('Uninstall then Confirm uninstall sends UNINSTALL_PACKAGE', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Uninstall pdf-tools', exact: true }).click();
    expect(bridge.callsOf('UNINSTALL_PACKAGE')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm uninstall', exact: true }).click();
    await bridge.expectSent('UNINSTALL_PACKAGE', { id: 'pdf-tools' });
    await expect(page.getByText('pdf-tools', { exact: true })).toHaveCount(0);
  });

  test('skill switch sends SKILL_SET_ENABLED', async ({ page, bridge }) => {
    const sw = page.getByRole('switch', { name: 'Web research enabled', exact: true });
    await sw.click();
    await bridge.expectSent('SKILL_SET_ENABLED', { id: 'skill_web', enabled: false });
    await expect(sw).not.toBeChecked();
    const pdf = page.getByRole('switch', { name: 'PDF reader enabled', exact: true });
    await pdf.click();
    await bridge.expectSent('SKILL_SET_ENABLED', { id: 'skill_pdf', enabled: true });
    await expect(pdf).toBeChecked();
  });

  test('activation select sends SKILL_SET_ACTIVATION', async ({ page, bridge }) => {
    const web = page.getByRole('combobox', { name: 'Activation for Web research', exact: true });
    await expect(web.locator('option:checked')).toHaveText('Follow the skill file');
    await expect(
      page.getByRole('combobox', { name: 'Activation for PDF reader', exact: true }).locator('option:checked'),
    ).toHaveText('Always');
    await web.selectOption({ label: 'On demand' });
    await bridge.expectSent('SKILL_SET_ACTIVATION', { id: 'skill_web', choice: 'on-demand' });
    await expect(web.locator('option:checked')).toHaveText('On demand');
    await web.selectOption({ label: 'Always' });
    await bridge.expectSent('SKILL_SET_ACTIVATION', { id: 'skill_web', choice: 'always' });
    await web.selectOption({ label: 'Follow the skill file' });
    await bridge.expectSent('SKILL_SET_ACTIVATION', { id: 'skill_web', choice: null });
  });

  test('skill settings: load, save, and a failed save keeps the dialog', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: 'Settings for PDF reader', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings for Web research', exact: true }).click();
    await bridge.expectSent('GET_SKILL_SETTINGS', { skillId: 'skill_web' });
    const dialog = page.getByRole('dialog', { name: 'web-research.yaml' });
    await expect(dialog).toBeVisible();
    const yaml = dialog.getByRole('textbox', { name: 'Settings (YAML)' });
    await expect(yaml).toHaveValue(SKILL_SETTINGS);

    await yaml.fill('depth: [');
    await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
    await bridge.expectSent('SET_SKILL_SETTINGS', { skillId: 'skill_web', content: 'depth: [' });
    await expect(page.getByRole('alert').filter({ hasText: 'YAML parse error on line 1' })).toBeVisible();
    await expect(dialog).toBeVisible();

    await yaml.fill('depth: 5\n');
    await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
    await bridge.expectSent('SET_SKILL_SETTINGS', { skillId: 'skill_web', content: 'depth: 5\n' });
  });

  test('Delete skill only for deletable skills, after confirm', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: 'Delete PDF reader', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete Web research', exact: true }).click();
    expect(bridge.callsOf('DELETE_SKILL')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await bridge.expectSent('DELETE_SKILL', { id: 'skill_web' });
    await expect(page.getByRole('switch', { name: 'Web research enabled', exact: true })).toHaveCount(0);
  });

  test('auth connectors: state text, Sign out and Refresh', async ({ page, bridge }) => {
    await expect(text(page, 'Google')).toBeVisible();
    await expect(text(page, 'Signed in')).toBeVisible();
    await expect(text(page, 'Slack')).toBeVisible();
    await expect(text(page, 'Needs sign-in')).toBeVisible();
    await expect(text(page, 'Dropbox')).toBeVisible();
    await expect(text(page, 'Not signed in')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out Slack', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh Slack', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Refresh Google', exact: true }).click();
    await bridge.expectSent('CONNECTOR_REFRESH', { connectorId: 'google' });
    await page.getByRole('button', { name: 'Sign out Google', exact: true }).click();
    await bridge.expectSent('CONNECTOR_REVOKE', { connectorId: 'google' });
    await expect(page.getByRole('button', { name: 'Sign out Google', exact: true })).toHaveCount(0);
  });

  test('plugin switch and delete', async ({ page, bridge }) => {
    await page.getByRole('switch', { name: 'Research pack enabled', exact: true }).click();
    await bridge.expectSent('PLUGIN_SET_ENABLED', { id: 'plugin_research', enabled: false });
    await expect(page.getByRole('switch', { name: 'Research pack enabled', exact: true })).not.toBeChecked();

    await expect(page.getByRole('button', { name: 'Delete Core tools', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete Research pack', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await bridge.expectSent('DELETE_PLUGIN', { id: 'plugin_research' });
    await expect(page.getByRole('switch', { name: 'Research pack enabled', exact: true })).toHaveCount(0);
  });

  test('a failed change shows its error', async ({ page, bridge }) => {
    bridge.fail('UPDATE_PACKAGE', 'Registry unreachable');
    await page.getByRole('button', { name: 'Update research-pack', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Registry unreachable' })).toBeVisible();
  });
});

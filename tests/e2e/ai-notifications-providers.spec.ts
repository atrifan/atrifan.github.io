import { NOTIFICATION_CONFIG, expect, fakeDevice, openAi, signedIn, test, text } from '../support/ai-fixtures';

const EVENTS = [
  ['task_complete', 'Task complete'],
  ['error', 'Error'],
  ['auth_required', 'Sign-in required'],
  ['daily_summary', 'Daily summary'],
  ['background_done', 'Background task done'],
  ['agent_notify', 'Agent message'],
] as const;

const CHANNELS = [
  ['chrome', 'Chrome Notifications'],
  ['telegram', 'Telegram'],
] as const;

type Rules = Record<string, string[]>;
const sortedRules = (rules: Rules) =>
  Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, [...v].sort()]));

test.describe('Notifications /ai/notifications', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/notifications');
    await expect(page.getByRole('switch', { name: 'Chrome Notifications enabled', exact: true })).toBeVisible();
  });

  test('shows channels, rules and sound from the loaded config', async ({ page, bridge }) => {
    await bridge.expectSent('NOTIFICATION_GET_CONFIG', {});
    await expect(page.getByRole('switch', { name: 'Chrome Notifications enabled', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Telegram enabled', exact: true })).not.toBeChecked();
    for (const [event, label] of EVENTS) {
      await expect(text(page, label)).toBeVisible();
      for (const [channel, channelName] of CHANNELS) {
        const box = page.getByRole('checkbox', { name: `${label} via ${channelName}`, exact: true });
        const on = (NOTIFICATION_CONFIG.rules[event] as string[]).includes(channel);
        if (on) await expect(box).toBeChecked();
        else await expect(box).not.toBeChecked();
      }
    }
    await expect(page.getByRole('switch', { name: 'Play a sound', exact: true })).toBeChecked();
  });

  test('Save sends the full edited config', async ({ page, bridge }) => {
    await page.getByRole('switch', { name: 'Telegram enabled', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Daily summary via Telegram', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Task complete via Chrome Notifications', exact: true }).uncheck();
    await page.getByRole('switch', { name: 'Play a sound', exact: true }).click();
    await page.getByRole('button', { name: 'Save notification settings', exact: true }).click();

    await expect.poll(() => bridge.callsOf('NOTIFICATION_SET_CONFIG').length).toBe(1);
    const sent = bridge.lastParams('NOTIFICATION_SET_CONFIG') as {
      config: { channels: unknown; rules: Rules; soundEnabled: boolean };
    };
    expect(Object.keys(sent.config).sort()).toEqual(['channels', 'rules', 'soundEnabled']);
    expect(sent.config.channels).toEqual({ chrome: { enabled: true }, telegram: { enabled: true, chat_id: '12345' } });
    expect(sortedRules(sent.config.rules)).toEqual(
      sortedRules({
        task_complete: [],
        error: ['chrome', 'telegram'],
        auth_required: ['chrome'],
        daily_summary: ['telegram'],
        background_done: ['chrome'],
        agent_notify: ['telegram'],
      }),
    );
    expect(sent.config.soundEnabled).toBe(false);
    await expect(text(page, 'Saved')).toBeVisible();
  });

  test('a failed save shows its error', async ({ page, bridge }) => {
    bridge.fail('NOTIFICATION_SET_CONFIG', 'Telegram chat not found');
    await page.getByRole('button', { name: 'Save notification settings', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Telegram chat not found' })).toBeVisible();
  });
});

test.describe('Providers /ai/providers', () => {
  signedIn();

  test('lists providers, models, the active one and the version', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/providers');
    await bridge.expectSent('GET_PROVIDERS', {});
    await bridge.expectSent('GET_VERSION', {});
    await expect(text(page, /^anthropic$/i)).toBeVisible();
    await expect(text(page, 'claude-sonnet-5-5')).toBeVisible();
    await expect(text(page, /^openai$/i)).toBeVisible();
    await expect(text(page, 'gpt-6-mini')).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toHaveCount(1);
    await expect(text(page, 'Version 2.3.1')).toBeVisible();
    await expect(text(page, /darwin/)).toBeVisible();
  });
});

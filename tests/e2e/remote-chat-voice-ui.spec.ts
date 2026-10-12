import { test, expect, chatEnvReady } from '../fixtures/chat-page';
import { setDevicePresence } from '../fixtures/chat-fixtures';
import { blockThirdParty } from './surface-helpers';

/**
 * Remote chat voice UI and the live in-browser bridge, signed in as the E2E customer.
 *
 * Live microphone / speech synthesis can't be driven headlessly, so these assert the
 * observable affordances: the mic control, the speak-back toggle and its pressed
 * state. The bridge test simulates the extension's postMessage handshake: an assistant
 * running in this very browser is online even when its server heartbeat is stale.
 */
test.describe('remote chat voice UI and live bridge (/chat)', () => {
  test.skip(!chatEnvReady(), 'needs Clerk dev keys and Supabase service-role env');

  test('mic: a voice-input control exists in the composer', async ({ page, device }) => {
    await blockThirdParty(page);
    await page.goto(`/chat?device=${device.apiKeyId}`);
    await expect(page.getByRole('button', { name: /start voice input|stop listening/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('speak-back: the read-aloud toggle flips its pressed state', async ({ page, device }) => {
    await blockThirdParty(page);
    await page.goto(`/chat?device=${device.apiKeyId}`);
    const toggle = page.getByRole('button', { name: /read answers aloud/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await toggle.click();
    await expect(page.getByRole('button', { name: /mute spoken answers/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('presence: an assistant connected in this browser reads as online despite a stale heartbeat', async ({ page, device }) => {
    await setDevicePresence(device, 120);
    await page.route('**/api/plugin/devices', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.devices = (body.devices as Array<{ id: string }>).filter((d) => d.id === device.apiKeyId);
      await route.fulfill({ response: res, json: body });
    });
    await page.addInitScript((deviceName: string) => {
      window.addEventListener('message', (e: MessageEvent) => {
        const d = e.data;
        if (e.source !== window || !d || d.source !== 'tulzo') return;
        if (d.action === 'discover') {
          window.postMessage({ source: 'tex-extension', action: 'discover_ack', version: '1.0.0', capabilities: [], deviceName, activated: true }, '*');
        } else if (d.action === 'heartbeat') {
          window.postMessage({ source: 'tex-extension', action: 'heartbeat_ack' }, '*');
        } else if (d.action === 'command') {
          window.postMessage(
            { source: 'tex-extension', action: 'command_response', id: d.id, ok: true, result: { activeProvider: 'anthropic', providers: { anthropic: { models: { orchestrator: 'claude-opus-4-8' } } } } },
            '*',
          );
        }
      });
    }, device.deviceName);
    await blockThirdParty(page);
    await page.goto(`/chat?device=${device.apiKeyId}`);
    await expect(page.getByRole('status').filter({ hasText: 'Your assistant is online' })).toBeVisible({ timeout: 30_000 });
  });
});

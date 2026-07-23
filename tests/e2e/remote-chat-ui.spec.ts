import { test, expect } from '@playwright/test';

/**
 * Remote chat UI — Clerk-gated page at /chat.
 *
 * A full-featured, mobile-first chat GUI for driving a remote connected device.
 * These tests describe the OBSERVABLE CONTRACT only (roles, accessible names,
 * visible text) — never implementation details. They are expected to FAIL until
 * the page is fully built.
 *
 * The route is behind Clerk auth. Until Clerk test tokens are wired
 * (E2E_CLERK_STORAGE_STATE), every test here skips cleanly. This mirrors the
 * skip pattern used by the existing Clerk-gated specs.
 */
test.describe('remote chat UI (/chat)', () => {
  test.skip(!process.env.E2E_CLERK_STORAGE_STATE, 'requires Clerk test session (E2E_CLERK_STORAGE_STATE)');
  test.use({ storageState: process.env.E2E_CLERK_STORAGE_STATE });

  test('composer: typing + send clears the input and shows a user message bubble', async ({ page }) => {
    await page.goto('/chat');

    const composer = page.getByRole('textbox', { name: /message/i });
    await expect(composer).toBeVisible();

    const text = `hello from e2e ${Date.now()}`;
    await composer.fill(text);
    await composer.press('Enter');

    // Input is cleared after sending.
    await expect(composer).toHaveValue('');

    // The typed text appears in the conversation log as a user message.
    const log = page.getByRole('log');
    await expect(log.getByText(text, { exact: false })).toBeVisible();
  });

  test('attachments: an image-accepting upload affordance exists', async ({ page }) => {
    await page.goto('/chat');

    // A visible attach control (button/menuitem) with an "Attach"-like name,
    // or a bare "+" attach button.
    const attach = page
      .getByRole('button', { name: /attach|\+/i })
      .or(page.getByLabel(/attach/i));
    await expect(attach.first()).toBeVisible();

    // The key "upload an image" affordance: a file input accepting images.
    // It is typically visually hidden, so we assert on the attribute, not visibility.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput.first()).toBeAttached();
    const accept = await fileInput.first().getAttribute('accept');
    expect(accept).toBeTruthy();
    expect(accept || '').toContain('image/');
  });

  test('stop: the send affordance toggles to a Stop control while streaming', async ({ page }) => {
    await page.goto('/chat');

    const composer = page.getByRole('textbox', { name: /message/i });
    await expect(composer).toBeVisible();

    await composer.fill(`stream please ${Date.now()}`);

    // Send via an explicit control if present, otherwise Enter.
    const send = page.getByRole('button', { name: /^send$/i });
    if (await send.count()) {
      await send.first().click();
    } else {
      await composer.press('Enter');
    }

    // While the assistant is producing a reply, the pattern is a Stop control.
    // Kept resilient: any Stop-named control appearing after send satisfies this.
    const stop = page.getByRole('button', { name: /^stop$/i });
    await expect(stop.first()).toBeVisible();
  });

  test('rendering surfaces: empty-state prompt + a polite live log region', async ({ page }) => {
    await page.goto('/chat');

    // Before any message, an empty-state prompt is shown.
    await expect(
      page.getByText(/start (a )?conversation|how can i help|ask|type a message|send a message/i).first()
    ).toBeVisible();

    // The conversation region is an aria-live log.
    const log = page.getByRole('log');
    await expect(log).toBeVisible();
    const ariaLive = await log.getAttribute('aria-live');
    expect(ariaLive).toBeTruthy();
  });

  test('header/back: device picker heading when no device, back control when a chat is open', async ({ page }) => {
    // No ?device= → the device picker heading is shown.
    await page.goto('/chat');
    const picker = page.getByRole('heading', { name: /connected devices/i });
    await expect(picker).toBeVisible();

    // With a chat open (?device=), a Back control returns to device selection.
    await page.goto('/chat?device=e2e');
    const back = page.getByRole('button', { name: /back/i }).or(page.getByRole('link', { name: /back/i }));
    await expect(back.first()).toBeVisible();
  });

  test('picker: a refresh control re-reads device presence', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByRole('heading', { name: /connected devices/i })).toBeVisible();

    // A labelled refresh control triggers a fresh /api/plugin/devices read.
    const refresh = page.getByRole('button', { name: /refresh devices/i });
    await expect(refresh).toBeVisible();

    const req = page.waitForRequest((r) => r.url().includes('/api/plugin/devices'));
    await refresh.click();
    await req;
  });

  test('presence: a device connected in the same browser shows online via the live bridge', async ({ page }) => {
    // The page talks to the in-browser Horia assistant over a window.postMessage
    // handshake (extension-bridge). Simulate the extension: reply to the page's
    // `discover` (source:'tulzo') with a `discover_ack` (source:'tex-extension').
    // A device connected right here must read as online even if its server
    // heartbeat is stale — the user is "linked to Tulzo" in this very browser.
    await page.addInitScript(() => {
      window.addEventListener('message', (e: MessageEvent) => {
        const d = e.data;
        if (e.source !== window || !d || d.source !== 'tulzo') return;
        if (d.action === 'discover') {
          window.postMessage(
            { source: 'tex-extension', action: 'discover_ack', version: '1.0.0', capabilities: [], deviceName: 'e2e-device', activated: true },
            '*'
          );
        } else if (d.action === 'heartbeat') {
          window.postMessage({ source: 'tex-extension', action: 'heartbeat_ack' }, '*');
        } else if (d.action === 'command') {
          window.postMessage(
            { source: 'tex-extension', action: 'command_response', id: d.id, ok: true, result: { activeProvider: 'anthropic', providers: { anthropic: { models: { orchestrator: 'claude-opus-4-8' } } } } },
            '*'
          );
        }
      });
    });

    await page.goto('/chat');
    await expect(page.getByRole('heading', { name: /connected devices/i })).toBeVisible();

    // At least one device tile reflects an online state once the bridge connects.
    const onlineTile = page.locator('.rc-device.online');
    await expect(onlineTile.first()).toBeVisible();
  });
});

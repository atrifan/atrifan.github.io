import { test, expect } from '@playwright/test';

/**
 * Remote chat VOICE UI — Clerk-gated page at /chat with a device open.
 *
 * Behavior-only contract for the ported voice experience (speech-to-text mic
 * robot + text-to-speech speak-back + the listening orb). Live microphone /
 * speech-synthesis can't be driven headlessly, so these assert only the
 * observable affordances that don't need a live mic: the controls exist with
 * accessible names, the speak-back toggle flips its pressed state, and
 * Alt+Enter inserts a newline instead of sending.
 *
 * Same skip pattern as the other Clerk-gated specs: until E2E_CLERK_STORAGE_STATE
 * is wired, every test here skips cleanly.
 */
test.describe('remote chat voice UI (/chat)', () => {
  test.skip(!process.env.E2E_CLERK_STORAGE_STATE, 'requires Clerk test session (E2E_CLERK_STORAGE_STATE)');
  test.use({ storageState: process.env.E2E_CLERK_STORAGE_STATE });

  test('mic: a voice-input control exists in the composer', async ({ page }) => {
    // A supported browser exposes a mic button; Chromium (Playwright default)
    // supports SpeechRecognition, so the control should render.
    await page.goto('/chat?device=e2e');

    const mic = page.getByRole('button', { name: /start voice input|stop listening/i });
    await expect(mic.first()).toBeVisible();
  });

  test('speak-back: a read-aloud toggle exists and flips its pressed state', async ({ page }) => {
    await page.goto('/chat?device=e2e');

    // The toggle advertises reading answers aloud; default is off (not pressed).
    const toggle = page.getByRole('button', { name: /read answers aloud/i });
    await expect(toggle.first()).toBeVisible();
    await expect(toggle.first()).toHaveAttribute('aria-pressed', 'false');

    // Turning it on flips aria-pressed and the accessible name switches to "mute".
    await toggle.first().click();
    const muted = page.getByRole('button', { name: /mute spoken answers/i });
    await expect(muted.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('composer: Alt+Enter inserts a newline instead of sending', async ({ page }) => {
    await page.goto('/chat?device=e2e');

    const composer = page.getByRole('textbox', { name: /message/i });
    await expect(composer).toBeVisible();

    await composer.click();
    await composer.type('line one');
    await composer.press('Alt+Enter');
    await composer.type('line two');

    // Still in the composer (not sent) and now spans two lines.
    await expect(composer).toHaveValue('line one\nline two');
  });
});

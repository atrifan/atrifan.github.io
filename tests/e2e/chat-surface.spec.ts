import { test as base, expect } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';

/** Public /chat landing for signed-out visitors. The signed-in chat is covered by the live-relay v2 suite (tests/chat-attach). */

base.describe('chat surface (signed out)', () => {
  base.use({ storageState: { cookies: [], origins: [] } });

  base('GET /chat is the public landing: what remote chat is, sign in, get the assistant; indexable, no ads', async ({ page }) => {
    await blockThirdParty(page);
    const res = await page.goto('/chat', { timeout: 60_000 });
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Talk to your assistant from anywhere' })).toBeVisible();
    const signIn = page.locator('#main').getByRole('link', { name: 'Sign in to chat' });
    await expect(signIn).toHaveAttribute('href', /^\/sign-in\?redirect_url=%2Fchat$/);
    await expect(page.locator('#main').getByRole('link', { name: 'Get the assistant' })).toHaveAttribute('href', '/docs');
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/chat$/);
    await expect(page.locator('[data-ad-slot], .ad-banner, ins.adsbygoogle')).toHaveCount(0);
  });

  base('the landing\'s Sign in goes to the hub sign-in and comes back to /chat', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/chat', { timeout: 60_000 });
    await page.locator('#main').getByRole('link', { name: 'Sign in to chat' }).click();
    await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fchat/);
  });
});

import type { APIResponse, BrowserContext, Page } from '@playwright/test';

/** The exact body a surface returns for an API route it does not own. */
export async function isSurfaceNotFoundBody(res: APIResponse): Promise<boolean> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as unknown;
    return (
      typeof json === 'object' &&
      json !== null &&
      !Array.isArray(json) &&
      Object.keys(json).length === 1 &&
      (json as Record<string, unknown>).error === 'not_found'
    );
  } catch {
    return false;
  }
}

/**
 * Abort every request that leaves localhost (other surfaces on *.tulzo.test,
 * Clerk hosts, ad networks) so a test never follows a cross-surface redirect.
 */
export async function keepPageOnLocalhost(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => route.abort('blockedbyclient'),
  );
}

export const PRIMARY_NAV = ['AI', 'Marketplace', 'Gigs', 'Chat'] as const;

/** Consent banner, analytics and ad networks: tests never depend on them. Clerk stays allowed. */
export const THIRD_PARTY = /(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/;

export async function blockThirdParty(target: Page | BrowserContext): Promise<void> {
  await target.route(THIRD_PARTY, (route) => route.abort('blockedbyclient'));
}

/** An ad slot container; the AdSense <ins> also carries data-ad-slot and is not a slot. */
export const AD_SLOT = '[data-ad-slot]:not(ins)';

import { expect, type APIRequestContext, type Locator, type Page, type Request, type Route } from '@playwright/test';
import { AD_SLOT, blockThirdParty } from './surface-helpers';

/** Shared setup for the hub page specs (hub-*.spec.ts). Behaviour only: no implementation knowledge. */

export const STRIPE_HOSTS = /^https:\/\/(checkout|connect)\.stripe\.com\//;

export function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Matches a same-origin API path exactly (any query string). */
export const apiPath = (pathname: string) => (url: URL) => url.pathname === pathname;

/**
 * Third parties blocked, Stripe hosts stubbed, and the three Stripe-backed API
 * routes answered with harmless defaults so nothing can reach live Stripe.
 * Tests register their own handlers afterwards; later routes win.
 */
export async function guardPage(page: Page): Promise<void> {
  await blockThirdParty(page);
  await page.route(STRIPE_HOSTS, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stripe stub</title><h1>Stripe stub</h1>' }),
  );
  await page.route(apiPath('/api/connect/onboard'), (route) => fulfillJson(route, { error: 'not mocked' }, 500));
  await page.route(apiPath('/api/billing/checkout'), (route) => fulfillJson(route, { error: 'not mocked' }, 500));
  await page.route(apiPath('/api/connect/status'), (route) =>
    fulfillJson(route, {
      connected: false,
      account_id: null,
      connect_status: 'none',
      payouts_enabled: false,
      charges_enabled: false,
      details_submitted: false,
      country: null,
    }),
  );
}

/** Records every request whose pathname matches (any method). */
export function recordRequests(page: Page, pathname: string): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === pathname) seen.push(req);
  });
  return seen;
}

export const userButton = (scope: Page | Locator) => scope.getByRole('button', { name: /open user (button|menu)/i });

/** Waits until the Clerk client in the page has a signed-in user. */
export async function waitForClerkUser(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user, null, {
    timeout: 30_000,
  });
}

/** A request context carrying a fresh Clerk session: load a page so clerk-js refreshes __session first. */
export async function signedInRequest(page: Page): Promise<APIRequestContext> {
  await blockThirdParty(page);
  await page.goto('/');
  await waitForClerkUser(page);
  return page.request;
}

/** Innermost <section> (or region) that holds an h2 with this exact text. */
export function sectionByH2(page: Page, name: string): Locator {
  return page.locator(`xpath=//h2[normalize-space()=${JSON.stringify(name)}]/ancestor::*[self::section or @role="region"][1]`);
}

/** Scroll to the bottom so lazy ad slots get a chance to mount, then count them. */
export async function adSlots(page: Page): Promise<Locator> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  return page.locator(AD_SLOT);
}

export async function expectNoAdSlots(page: Page): Promise<void> {
  await expect(await adSlots(page)).toHaveCount(0);
}

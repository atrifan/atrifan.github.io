import { test, expect, type Page } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';

/**
 * TULZO_ROUTING=hybrid, path-mode hosts on vercel.app: signed out, /ai and /ai/<section> send the browser
 * toward a sign-in page (never a surface subdomain). The project's browser resolves only *.tulzo.test, so
 * this file maps the vercel.app hosts to the local server too (launchOptions must be file-level).
 * The rest of the host-routing contract is in host-routing.host-routing.spec.ts.
 */

const PORT = Number(process.env.PW_HOST_PORT) || 3003;
const HOSTS = ['tulzo.vercel.app', 'my-preview-abc.vercel.app'];

test.use({
  launchOptions: {
    args: [`--host-resolver-rules=MAP tulzo.test 127.0.0.1, MAP *.tulzo.test 127.0.0.1, MAP *.vercel.app 127.0.0.1`],
  },
});
test.describe.configure({ timeout: 120_000 });

/** With Clerk's development instance the sign-in redirect follows a handshake, so watch navigations. */
async function expectSentToSignIn(page: Page, host: string, path: string, signIn: RegExp): Promise<void> {
  await blockThirdParty(page);
  const navigations: string[] = [];
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations.push(req.url());
  });
  await page.goto(`http://${host}:${PORT}${path}`).catch(() => {});
  await expect
    .poll(() => navigations.find((u) => signIn.test(u)) ?? navigations.join('\n'), { timeout: 45_000 })
    .toMatch(signIn);
}

for (const host of HOSTS) {
  test.describe(`path-mode host ${host}`, () => {
    for (const path of ['/ai', '/ai/usage']) {
      test(`signed-out ${path} is sent toward a sign-in page`, async ({ page }) => {
        await expectSentToSignIn(page, host, path, /^https?:\/\/(?!(ai|marketplace|gigs|chat)\.)[^/]+\/sign-in/);
      });
    }
  });
}

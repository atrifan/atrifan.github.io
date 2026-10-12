import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local so API-key seeding (tests/fixtures/seed.ts) sees Supabase creds.
loadEnv({ path: '.env.local' });

/**
 * Playwright config for Tulzo.
 *
 * Projects
 * - chromium        tests/e2e/**  (desktop, path-prefix mode on :3000)
 * - light-desktop / light-mobile / dark-desktop / dark-mobile
 *                   tests/visual/** and tests/a11y/**, colorScheme light|dark at
 *                   1280x800 and 390x844
 * - surface-ai      tests/e2e/**\/*.surface-ai.spec.ts  on :3001 (TULZO_SURFACE=ai)
 * - surface-hub     tests/e2e/**\/*.surface-hub.spec.ts on :3002 (TULZO_SURFACE=hub)
 * - host-routing    tests/e2e/**\/*.host-routing.spec.ts on :3003 (TULZO_ROUTING=hybrid): the surface
 *                   comes from the Host header (tulzo.test, ai.tulzo.test, …, localhost)
 *
 * The surface servers run with NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test, so
 * cross-surface redirects point at https://<surface>.tulzo.test (asserted from
 * the Location header, never followed). Each uses its own NEXT_DIST_DIR so it
 * can run next to the main dev server.
 *
 * Locally the main server is `npm run dev` (reused if already running). In CI
 * it is `npm run start`, so run `npm run build` first.
 * PLAYWRIGHT_BASE_URL overrides the main server URL (then no server is started for it).
 */
// PW_PORT / PW_AI_PORT / PW_HUB_PORT / PW_HOST_PORT move the servers (e.g. parallel worktrees on one machine).
const PORT = Number(process.env.PW_PORT) || 3000;
const AI_PORT = Number(process.env.PW_AI_PORT) || 3001;
const HUB_PORT = Number(process.env.PW_HUB_PORT) || 3002;
const HOST_PORT = Number(process.env.PW_HOST_PORT) || 3003;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export const SURFACE_TEST_ROOT_DOMAIN = 'tulzo.test';

const surfaceServer = (surface: 'ai' | 'hub', port: number) => ({
  command: `npx next dev -p ${port}`,
  url: `http://localhost:${port}/robots.txt`,
  reuseExistingServer: !CI,
  timeout: 180_000,
  env: {
    TULZO_SURFACE: surface,
    // Single-surface test servers link to the other surfaces' subdomains.
    TULZO_LINKS: 'host',
    NEXT_PUBLIC_ROOT_DOMAIN: SURFACE_TEST_ROOT_DOMAIN,
    NEXT_DIST_DIR: `.next-surface-${surface}`,
    LEGAL_CONTACT_EMAIL: process.env.LEGAL_CONTACT_EMAIL || 'support@tulzo.online',
  },
});

// One deploy, surface per Host header (the hybrid mode the live `tulzo` project runs in).
const hostRoutingServer = {
  command: `npx next dev -p ${HOST_PORT}`,
  url: `http://localhost:${HOST_PORT}/robots.txt`,
  reuseExistingServer: !CI,
  timeout: 180_000,
  env: {
    TULZO_ROUTING: 'hybrid',
    TULZO_SURFACE: '',
    TULZO_LINKS: 'path',
    NEXT_PUBLIC_ROOT_DOMAIN: SURFACE_TEST_ROOT_DOMAIN,
    NEXT_DIST_DIR: '.next-host-routing',
    LEGAL_CONTACT_EMAIL: process.env.LEGAL_CONTACT_EMAIL || 'support@tulzo.online',
  },
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };
// Chromium with a phone viewport and touch; Playwright's iPhone presets need WebKit.
const mobile = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const themed = /(visual|a11y)\/.*\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests',
  // Only Playwright specs; tests/**/*.test.ts and *.vitest.ts belong to node:test and Vitest.
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/global-setup.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Signs in the Clerk E2E users once (tests/setup/auth.setup.spec.ts); signed-in
    // specs depend on it and use storageState from tests/fixtures/clerk-users.ts.
    { name: 'setup', testMatch: /setup\/auth\.setup\.spec\.ts$/, use: desktop },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /e2e\/.*\.spec\.ts$/,
      testIgnore: /\.(surface-(ai|hub)|host-routing)\.spec\.ts$/,
      use: desktop,
    },
    { name: 'light-desktop', dependencies: ['setup'], testMatch: themed, use: { ...desktop, colorScheme: 'light' } },
    { name: 'light-mobile', dependencies: ['setup'], testMatch: themed, use: { ...mobile, colorScheme: 'light' } },
    { name: 'dark-desktop', dependencies: ['setup'], testMatch: themed, use: { ...desktop, colorScheme: 'dark' } },
    { name: 'dark-mobile', dependencies: ['setup'], testMatch: themed, use: { ...mobile, colorScheme: 'dark' } },
    {
      // tests/integration/*.spec.ts (e.g. notify.spec.ts, `npm run test:integration:notify`).
      name: 'integration',
      testMatch: /integration\/.*\.spec\.ts$/,
      use: desktop,
    },
    {
      // tests/live/*.spec.ts: the ai. panel against the real Tex extension + native host. Opt-in: skipped
      // unless AI_EXTENSION_DIR and AI_EXTENSION_PROFILE are set (see the spec's header).
      name: 'live-extension',
      dependencies: ['setup'],
      testMatch: /live\/.*\.spec\.ts$/,
      timeout: 120_000,
      use: desktop,
    },
    {
      name: 'surface-ai',
      testMatch: /\.surface-ai\.spec\.ts$/,
      use: { ...desktop, baseURL: `http://localhost:${AI_PORT}` },
    },
    {
      name: 'surface-hub',
      testMatch: /\.surface-hub\.spec\.ts$/,
      use: { ...desktop, baseURL: `http://localhost:${HUB_PORT}` },
    },
    {
      // Browsers resolve the tulzo.test hosts to this machine, so pages load as ai.tulzo.test:<port> etc.
      name: 'host-routing',
      testMatch: /\.host-routing\.spec\.ts$/,
      use: {
        ...desktop,
        baseURL: `http://localhost:${HOST_PORT}`,
        launchOptions: { args: ['--host-resolver-rules=MAP tulzo.test 127.0.0.1, MAP *.tulzo.test 127.0.0.1'] },
      },
    },
  ],
  webServer: [
    ...(process.env.PLAYWRIGHT_BASE_URL
      ? []
      : [
          {
            command: CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
            url: baseURL,
            reuseExistingServer: !CI,
            timeout: 180_000,
            // The legal pages show the contact address only when it is configured.
            env: { LEGAL_CONTACT_EMAIL: process.env.LEGAL_CONTACT_EMAIL || 'support@tulzo.online' },
          },
        ]),
    // Against an external server (PLAYWRIGHT_BASE_URL, e.g. the gigs runner) the surface servers aren't started.
    ...(process.env.PLAYWRIGHT_BASE_URL ? [] : [surfaceServer('ai', AI_PORT), surfaceServer('hub', HUB_PORT), hostRoutingServer]),
  ],
});

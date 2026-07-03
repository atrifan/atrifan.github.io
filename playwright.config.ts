import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local so API-key seeding (tests/fixtures/seed.ts) sees Supabase creds.
loadEnv({ path: '.env.local' });

/**
 * Playwright config for Tulzo.
 *
 * - tests/e2e  — API/integration + UI end-to-end
 * - tests/a11y — accessibility scans (@axe-core/playwright)
 *
 * The dev server is started automatically unless one is already running.
 * Base URL can be overridden with PLAYWRIGHT_BASE_URL.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const port = Number(process.env.CHAT_RELAY_PORT ?? 3446);
const scratch = process.env.CHAT_RELAY_SCRATCH ?? '/private/var/folders/38/yd2nm8pj2zl6mpdr_z9ld_wh0000gp/T/opencode/decentralized-chat-backend/final-v2';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './chat-attach',
  testMatch: '**/live-relay-v2*.spec.ts',
  outputDir: path.join(scratch, 'playwright-results'),
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: path.join(scratch, 'playwright-results.json') }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'light-desktop',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'dark-desktop',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'light-mobile',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'dark-mobile',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npx tsx support/live-relay-v2-fixture.ts',
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { CHAT_RELAY_PORT: String(port), CHAT_ATTACH_PORT: String(port), CHAT_ATTACH_SCRATCH: scratch },
  },
});

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const port = Number(process.env.CHAT_RELAY_PORT ?? 3441);
const scratch = process.env.CHAT_RELAY_SCRATCH ?? '/private/var/folders/38/yd2nm8pj2zl6mpdr_z9ld_wh0000gp/T/opencode/ui-red';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './chat-attach',
  testMatch: '**/live-relay-v2*.spec.ts',
  outputDir: path.join(scratch, 'results'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: path.join(scratch, 'results.json') }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
    colorScheme: 'light',
    viewport: { width: 1280, height: 800 },
  },
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

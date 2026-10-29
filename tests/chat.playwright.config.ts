import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

/**
 * Isolated, secret-free browser harness for the chat UI. Does not import the root config, load
 * .env.local, run the Clerk/Supabase setup project or globalSetup. Every API call is answered by
 * the spec's fixtures; nothing reaches a real service.
 */
const port = Number(process.env.CHAT_ATTACH_PORT ?? 3417);
const scratch = process.env.CHAT_ATTACH_SCRATCH ?? path.join(os.tmpdir(), 'chat-attach');
const outputDir = path.join(scratch, `port-${port}`, 'results');
const baseURL = `http://127.0.0.1:${port}`;

const themes = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
];
const viewports = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

export default defineConfig({
  testDir: './chat-attach',
  testMatch: '**/*.spec.ts',
  outputDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: path.join(outputDir, 'results.json') }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx tsx support/chat-fixture-server.ts',
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { CHAT_ATTACH_PORT: String(port), CHAT_ATTACH_SCRATCH: scratch },
  },
  projects: themes.flatMap((t) =>
    viewports.map((v) => ({
      name: `${t.name}-${v.name}`,
      use: { colorScheme: t.colorScheme, viewport: v.viewport },
    })),
  ),
});

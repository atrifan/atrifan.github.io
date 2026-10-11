import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Integration tests call route handlers directly against the Supabase project in
// .env.local. Specs skip themselves (with a message) when that env is missing.
loadEnv({ path: '.env.local' });

/**
 * Run: `npm run test:int`. (The Docker-backed node:test suites are `npm run test:integration`.)
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.vitest.ts'],
    setupFiles: ['tests/integration/vitest-setup.ts'],
    testTimeout: 30_000,
    // Specs share seeded rows; run files one at a time.
    fileParallelism: false,
  },
});

import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Secret-free contract tests for the decentralized chat control wire. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/decentralized-chat.vitest.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    fileParallelism: false,
  },
});

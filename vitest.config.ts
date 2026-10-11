import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests for pure modules (no network, no DB, no Next runtime).
 * Run: `npm run test:unit`. Integration tests use vitest.int.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest unit tests for pure modules (no network, no DB, no Next runtime): the *.vitest.ts
 * files in tests/unit. `npm run test:unit` runs these after the node:test suites (*.test.ts).
 * Route-handler integration tests use vitest.int.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.vitest.ts'],
  },
});

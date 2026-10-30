import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Isolated relay RED runner: no dotenv, live integration setup, or P2P tests.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/decentralized-relay.vitest.ts', 'tests/integration/relay-cutover.vitest.ts', 'tests/integration/relay-v2-security.vitest.ts', 'tests/integration/relay-v2-broker.vitest.ts', 'tests/integration/relay-v2-routes.vitest.ts', 'tests/integration/relay-v2-clock.vitest.ts'],
    testTimeout: 10_000,
    fileParallelism: false,
  },
});

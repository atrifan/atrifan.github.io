/**
 * Run tests/integration/*.test.ts against a throwaway local database.
 *
 *   npm run test:integration [-- <extra node --test args>]
 *
 * Starts Postgres + PostgREST in Docker (tests/support/gigs-test-db.ts), points the app's
 * Supabase env at it, sets fake Stripe/AI credentials, runs node:test, then drops the schema
 * and removes the containers. .env.local is NOT loaded, so nothing can reach the shared
 * Supabase project, live Stripe or the AI Gateway.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startGigsTestDb } from '../tests/support/gigs-test-db';

async function main() {
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'tests', 'integration');
  // `npm run test:integration -- tests/integration/x.test.ts` runs just those files.
  const picked = process.argv.slice(2).filter((a) => a.endsWith('.test.ts'));
  const files = picked.length > 0
    ? picked.map((f) => path.resolve(root, f))
    : readdirSync(dir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(dir, f));
  const db = await startGigsTestDb();
  // Delivery snapshots go to a throwaway directory instead of Vercel Blob.
  const snapshots = mkdtempSync(path.join(os.tmpdir(), 'tulzo-int-snapshots-'));
  let code = 1;
  try {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'test',
      STORAGE_SUPABASE_URL: db.supabaseUrl,
      STORAGE_SUPABASE_SERVICE_ROLE_KEY: db.serviceRoleKey,
      GIGS_TEST_PG_URL: db.pgUrl,
      GIGS_TEST_SCHEMA: db.schema,
      STRIPE_SECRET_KEY: 'sk_test_fake_integration',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_integration',
      AI_GATEWAY_API_KEY: 'fake-gateway-key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      DELIVERY_SNAPSHOT_FAKE_DIR: snapshots,
    };
    const args = [
      '--import', 'tsx',
      '--experimental-test-module-mocks',
      '--test', '--test-concurrency=1',
      ...process.argv.slice(2).filter((a) => !a.endsWith('.test.ts')),
      ...files,
    ];
    code = await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
      child.on('exit', (c) => resolve(c ?? 1));
    });
  } finally {
    await db.stop();
    rmSync(snapshots, { recursive: true, force: true });
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

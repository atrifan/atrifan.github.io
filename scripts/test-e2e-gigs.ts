/**
 * Run the gigs Playwright API suite against a dev server wired to throwaway backends.
 *
 *   npm run test:e2e:gigs [-- <extra playwright args>]
 *
 * - Postgres + PostgREST in Docker (tests/support/gigs-test-db.ts), never the shared project
 * - a fake Stripe API (tests/support/fake-stripe.ts) via STRIPE_API_BASE, test keys only
 * - AI Gateway key blanked, so nothing can call a model
 * - `next dev` on GIGS_E2E_PORT (default 3100) with the test identity header enabled
 * Everything is torn down afterwards.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { startGigsTestDb } from '../tests/support/gigs-test-db';
import { startFakeStripe } from '../tests/support/fake-stripe';

const root = path.resolve(__dirname, '..');
const port = Number(process.env.GIGS_E2E_PORT || 3100);
const baseUrl = `http://localhost:${port}`;

async function waitForServer(url: string, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not start at ${url}`);
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit' });
    child.on('exit', (c) => resolve(c ?? 1));
  });
}

async function main() {
  const db = await startGigsTestDb();
  const stripe = await startFakeStripe();
  const authSecret = randomBytes(24).toString('hex');
  const webhookSecret = `whsec_e2e_${randomBytes(12).toString('hex')}`;
  let server: ChildProcess | null = null;
  let code = 1;
  try {
    const serverEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'development',
      STORAGE_SUPABASE_URL: db.supabaseUrl,
      NEXT_PUBLIC_STORAGE_SUPABASE_URL: db.supabaseUrl,
      STORAGE_SUPABASE_SERVICE_ROLE_KEY: db.serviceRoleKey,
      STRIPE_SECRET_KEY: 'sk_test_fake_e2e',
      STRIPE_API_BASE: stripe.url,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      STRIPE_CONNECT_WEBHOOK_SECRET: '',
      AI_GATEWAY_API_KEY: '',
      JOBS_E2E_AUTH_SECRET: authSecret,
      NEXT_PUBLIC_APP_URL: baseUrl,
    };
    server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(port)], {
      cwd: root,
      env: serverEnv,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await waitForServer(`${baseUrl}/api/connect/status`);
    // next dev compiles routes on first hit; parallel first hits can race on its manifests
    // (500 "Unexpected end of JSON input"). Compile every gigs route once, one at a time.
    const id = '00000000-0000-4000-8000-000000000000';
    for (const [method, route] of [
      ['GET', '/api/jobs'], ['GET', `/api/jobs/${id}`], ['POST', `/api/jobs/${id}/spec/draft`],
      ['POST', `/api/jobs/${id}/spec/approve`], ['GET', `/api/jobs/${id}/bids`], ['POST', `/api/bids/${id}/accept`],
      ['GET', '/api/offers'], ['POST', '/api/connect/onboard'], ['GET', '/api/connect/status'], ['POST', '/api/billing/webhook'],
    ] as const) {
      await fetch(`${baseUrl}${route}`, { method, body: method === 'POST' ? '{}' : undefined });
    }

    code = await run(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', 'tests/e2e/gigs-api.spec.ts', ...process.argv.slice(2)], {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
      JOBS_E2E_AUTH_SECRET: authSecret,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      // Keep tests/global-setup.ts from seeding the shared Supabase project.
      STORAGE_SUPABASE_URL: '',
      NEXT_PUBLIC_STORAGE_SUPABASE_URL: '',
      STORAGE_SUPABASE_SERVICE_ROLE_KEY: '',
    });
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    await stripe.close();
    await db.stop();
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

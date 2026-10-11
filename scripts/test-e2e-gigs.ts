/**
 * Run the gigs Playwright API suite against a dev server wired to throwaway backends.
 *
 *   npm run test:e2e:gigs [-- <extra playwright args, or specific spec files>]
 *
 * - Postgres + PostgREST in Docker (tests/support/gigs-test-db.ts), never the shared project
 * - a fake Stripe API (tests/support/fake-stripe.ts) via STRIPE_API_BASE, test keys only
 * - a fake GitHub API (tests/support/fake-github.ts) via GITHUB_API_BASE, for send_project
 * - AI Gateway key blanked, so nothing can call a model; Resend and the notify Postgres
 *   URLs blanked, so no email is queued in or sent from a real system
 * - a random PAT_ENCRYPTION_KEY and one admin (ADMIN_USER_IDS, passed to the specs as
 *   QA_E2E_ADMIN_USER)
 * - `next dev` on GIGS_E2E_PORT (default 3100) with the test identity header enabled
 * - two seeded API keys for the Jobs MCP spec (an active Free-plan key and a revoked key)
 * Runs tests/e2e/gigs-api.spec.ts and tests/e2e/jobs-mcp.spec.ts.
 * Everything is torn down afterwards.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { startGigsTestDb } from '../tests/support/gigs-test-db';
import { startFakeStripe } from '../tests/support/fake-stripe';
import { startFakeGithub } from '../tests/support/fake-github';
import { Client } from 'pg';

const SPECS = [
  'tests/e2e/gigs-api.spec.ts', 'tests/e2e/submission-mcp.spec.ts', 'tests/e2e/admin-qa-mcp.spec.ts',
  'tests/e2e/jobs-mcp.spec.ts',
];

/** Seed the API keys the Jobs MCP spec uses: an active Free-plan key and a revoked one. */
async function seedApiKeys(pgUrl: string, schema: string): Promise<{ free: string; freeUser: string; revoked: string }> {
  const keys = {
    free: `tlz_e2e_free_${randomBytes(12).toString('hex')}`,
    freeUser: `user_e2e_mcp_free_${randomBytes(4).toString('hex')}`,
    revoked: `tlz_e2e_revoked_${randomBytes(12).toString('hex')}`,
  };
  const sha = (k: string) => createHash('sha256').update(k).digest('hex');
  const c = new Client({ connectionString: pgUrl });
  await c.connect();
  try {
    await c.query(
      `INSERT INTO ${schema}.api_keys (user_id, api_key_hash, api_key_suffix, name, plan, is_active)
       VALUES ($1, $2, right($3, 4), 'e2e free', 'free', TRUE), ($4, $5, right($6, 4), 'e2e revoked', 'pro', FALSE)`,
      [keys.freeUser, sha(keys.free), keys.free, `${keys.freeUser}_revoked`, sha(keys.revoked), keys.revoked],
    );
  } finally {
    await c.end();
  }
  return keys;
}

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
  const github = await startFakeGithub();
  const qaAdmin = `e2e_qa_admin_${randomBytes(4).toString('hex')}`;
  const apiKeys = await seedApiKeys(db.pgUrl, db.schema).catch(async (err) => {
    await stripe.close();
    await github.close();
    await db.stop();
    throw err;
  });
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
      GITHUB_API_BASE: github.url,
      PAT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      PAT_ENCRYPTION_KEY_PREV: '',
      ADMIN_USER_IDS: qaAdmin,
      ADMIN_EMAILS: '',
      RESEND_API_KEY: '',
      STORAGE_POSTGRES_URL: '',
      STORAGE_POSTGRES_URL_NON_POOLING: '',
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
      ['POST', '/api/admin/qa/mcp'], ['POST', '/api/e2e/jobs-submission-mcp'], ['POST', '/api/chat'],
      ['POST', '/api/jobs/mcp'], ['GET', '/.well-known/oauth-protected-resource/api/jobs/mcp'], ['GET', '/api/contracts'],
      ['GET', `/api/contracts/${id}`], ['GET', `/api/contracts/${id}/messages`], ['GET', `/api/contracts/${id}/steering`],
      ['POST', `/api/contracts/${id}/steering/${id}/approve`], ['POST', `/api/contracts/${id}/steering/${id}/reject`],
      ['GET', `/api/contracts/${id}/milestones`], ['GET', `/api/contracts/${id}/activity`],
    ] as const) {
      await fetch(`${baseUrl}${route}`, { method, body: method === 'POST' ? '{}' : undefined });
    }

    const args = process.argv.slice(2);
    const specs = args.some((a) => a.endsWith('.spec.ts')) ? [] : SPECS;
    code = await run(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...specs, ...args], {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
      JOBS_E2E_AUTH_SECRET: authSecret,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      QA_E2E_ADMIN_USER: qaAdmin,
      JOBS_MCP_E2E_API_KEY: apiKeys.free,
      JOBS_MCP_E2E_API_KEY_USER: apiKeys.freeUser,
      JOBS_MCP_E2E_REVOKED_KEY: apiKeys.revoked,
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
    await github.close();
    await db.stop();
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

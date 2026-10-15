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
 * - DELIVERY_SNAPSHOT_FAKE_DIR, a temp dir standing in for private Vercel Blob (delivery snapshots)
 * - a fake Resend (tests/support/fake-resend.ts) via RESEND_API_BASE for support mail (complaints,
 *   inbox replies and forwards), a RESEND_WEBHOOK_SECRET and LEGAL_CONTACT_EMAIL; the specs get
 *   RESEND_FAKE_URL
 * - a CRON_SECRET for the Phase 5 cron routes; the specs get it plus GITHUB_FAKE_URL and
 *   STRIPE_FAKE_URL (to add fake GitHub token fixtures, e.g. a push target repo)
 * Runs the specs in DEFAULT_SPECS.
 * Everything is torn down afterwards.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startGigsTestDb } from '../tests/support/gigs-test-db';
import { startFakeStripe } from '../tests/support/fake-stripe';
import { startFakeGithub } from '../tests/support/fake-github';
import { startFakeResend } from '../tests/support/fake-resend';
import { Client } from 'pg';
import { playwrightCommand } from './playwright-run';

const DEFAULT_SPECS = [
  'tests/e2e/gigs-api.spec.ts',
  'tests/e2e/submission-mcp.spec.ts',
  'tests/e2e/admin-qa-mcp.spec.ts',
  'tests/e2e/jobs-mcp.spec.ts',
  // gigs UI: pages, a11y (axe) and visual baselines, in light/dark x desktop/mobile
  'tests/e2e/gigs-ui.spec.ts',
  'tests/e2e/gigs-form-layout.spec.ts',
  'tests/a11y/gigs.a11y.spec.ts',
  'tests/visual/gigs.visual.spec.ts',
  // Phase 5: delivery, acceptance, disputes, reviews, trust (API + the delivery page)
  'tests/e2e/gigs-delivery.spec.ts',
  'tests/a11y/gigs-delivery.a11y.spec.ts',
  'tests/visual/gigs-delivery.visual.spec.ts',
  // job room: every tab for both parties, steering flows, a11y and visual baselines
  'tests/e2e/gigs-room.spec.ts',
  'tests/a11y/gigs-room.a11y.spec.ts',
  'tests/visual/gigs-room.visual.spec.ts',
  // notification centre: the in-app feed API over real gigs flows
  'tests/e2e/notifications-api.spec.ts',
  'tests/e2e/legal-complaints-api.spec.ts',
  'tests/e2e/support-inbox.spec.ts',
  'tests/e2e/support-mail-retry.spec.ts',
  'tests/e2e/legal-consent-api.spec.ts',
  'tests/e2e/gigs-legal-notices.spec.ts',
  'tests/a11y/support-inbox.a11y.spec.ts',
];
// GIGS_E2E_SPECS=a.spec.ts,b.spec.ts runs a subset (e.g. while iterating on one page).
const SPECS = (process.env.GIGS_E2E_SPECS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (SPECS.length === 0) SPECS.push(...DEFAULT_SPECS);

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
  const resend = await startFakeResend();
  const qaAdmin = `e2e_qa_admin_${randomBytes(4).toString('hex')}`;
  const apiKeys = await seedApiKeys(db.pgUrl, db.schema).catch(async (err) => {
    await stripe.close();
    await github.close();
    await resend.close();
    await db.stop();
    throw err;
  });
  const authSecret = randomBytes(24).toString('hex');
  const webhookSecret = `whsec_e2e_${randomBytes(12).toString('hex')}`;
  const cronSecret = `cron_e2e_${randomBytes(12).toString('hex')}`;
  const resendWebhookSecret = `whsec_${randomBytes(24).toString('base64')}`;
  // Delivery snapshots go to a throwaway directory instead of Vercel Blob.
  const snapshots = mkdtempSync(path.join(os.tmpdir(), 'tulzo-e2e-snapshots-'));
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
      // Never fetch Vercel's live model listing in tests: a closed port, so the built-in list stands in.
      AI_GATEWAY_MODELS_URL: 'http://127.0.0.1:9/v1/models',
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
      CRON_SECRET: cronSecret,
      DELIVERY_SNAPSHOT_FAKE_DIR: snapshots,
      JOBS_AUTO_ACCEPT_DAYS: '',
      JOBS_POST_ACCEPT_CLAIM_DAYS: '',
      ADMIN_EMAILS: '',
      // Support mail (complaints, inbox) goes to the fake Resend; the notify outbox stays off
      // because its Postgres URLs are blank.
      RESEND_API_KEY: 're_test_fake_e2e',
      RESEND_API_BASE: resend.url,
      RESEND_WEBHOOK_SECRET: resendWebhookSecret,
      LEGAL_CONTACT_EMAIL: 'support@tulzo.online',
      SUPPORT_FORWARD_TO: 'forward@tulzo.test',
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
      ['POST', '/api/admin/qa/mcp'], ['POST', '/api/chat'],
      ['POST', '/api/jobs/mcp'], ['GET', '/.well-known/oauth-protected-resource/api/jobs/mcp'], ['GET', '/api/contracts'],
      ['GET', `/api/contracts/${id}`], ['GET', `/api/contracts/${id}/messages`], ['GET', `/api/contracts/${id}/steering`],
      ['POST', `/api/contracts/${id}/steering/${id}/approve`], ['POST', `/api/contracts/${id}/steering/${id}/reject`],
      ['GET', `/api/contracts/${id}/milestones`], ['GET', `/api/contracts/${id}/activity`],
      ['GET', `/api/contracts/${id}/delivery`], ['GET', `/api/contracts/${id}/delivery/download`],
      ['POST', `/api/contracts/${id}/delivery/push`], ['POST', `/api/contracts/${id}/accept`],
      ['POST', `/api/contracts/${id}/dispute`], ['GET', `/api/contracts/${id}/reviews`],
      ['GET', '/api/admin/disputes'], ['GET', `/api/admin/disputes/${id}`], ['POST', `/api/admin/disputes/${id}/resolve`],
      ['GET', '/api/cron/auto-accept'], ['GET', '/api/cron/trust-decay'], ['GET', '/api/cron/credit-grants'],
      ['GET', '/api/profile/reputation'], ['GET', `/api/trust?principal_ids=${id}`], ['GET', '/api/credits/grants'],
      ['POST', `/api/contracts/${id}/progress`], ['GET', `/api/contracts/${id}/qa`],
      ['POST', `/api/contracts/${id}/steering/${id}/respond`], ['POST', `/api/contracts/${id}/steering/${id}/topup`],
      ['POST', `/api/contracts/${id}/versions/${id}/accept`],
      ['GET', '/api/notifications'], ['POST', '/api/notifications/read'], ['GET', '/api/notifications/unread-count'],
      ['GET', '/api/activity/gigs'],
    ] as const) {
      await fetch(`${baseUrl}${route}`, { method, body: method === 'POST' ? '{}' : undefined });
    }
    // The gigs pages too (signed out: public pages render, signed-in ones redirect).
    for (const page of ['/gigs', `/gigs/jobs/${id}`, '/gigs/post', '/gigs/offers/new', `/gigs/contracts/${id}`, `/gigs/contracts/${id}/delivery`, '/gigs/docs/mcp', '/gigs/docs/admin-qa', '/gigs/activity', '/sitemap.xml']) {
      await fetch(`${baseUrl}${page}`, { redirect: 'manual' });
    }

    const args = process.argv.slice(2);
    const specs = args.some((a) => a.endsWith('.spec.ts')) ? [] : SPECS;
    const pwEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
      JOBS_E2E_AUTH_SECRET: authSecret,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      QA_E2E_ADMIN_USER: qaAdmin,
      CRON_SECRET: cronSecret,
      GITHUB_FAKE_URL: github.url,
      STRIPE_FAKE_URL: stripe.url,
      RESEND_FAKE_URL: resend.url,
      RESEND_WEBHOOK_SECRET: resendWebhookSecret,
      LEGAL_CONTACT_EMAIL: 'support@tulzo.online',
      SUPPORT_FORWARD_TO: 'forward@tulzo.test',
      JOBS_MCP_E2E_API_KEY: apiKeys.free,
      JOBS_MCP_E2E_API_KEY_USER: apiKeys.freeUser,
      JOBS_MCP_E2E_REVOKED_KEY: apiKeys.revoked,
      // Keep tests/global-setup.ts from seeding the shared Supabase project.
      STORAGE_SUPABASE_URL: '',
      NEXT_PUBLIC_STORAGE_SUPABASE_URL: '',
      STORAGE_SUPABASE_SERVICE_ROLE_KEY: '',
    };
    const pw = playwrightCommand(root, [...specs, ...args], pwEnv);
    code = await run(pw.cmd, pw.args, pwEnv);
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    rmSync(snapshots, { recursive: true, force: true });
    await stripe.close();
    await github.close();
    await resend.close();
    await db.stop();
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

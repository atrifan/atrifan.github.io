/**
 * Throwaway database for gigs integration and e2e tests.
 *
 * Never touches the shared Supabase project. It starts two local Docker containers:
 *   - postgres:16 (with Supabase-like roles anon / service_role / authenticator)
 *   - postgrest (the REST layer supabase-js talks to)
 * then creates a schema `test_gigs_<random>`, applies the prerequisite user_budgets
 * migration, 20261101_jobs_core.sql, an api_keys baseline, 20261102_notifications.sql,
 * 20261115_job_room.sql, 20261201_qa.sql and its follow-ups (20261202, 20261203),
 * the job room follow-ups (20261206), 20260526_budget_analytics.sql + 20261215_delivery_trust.sql
 * (Phase 5), and the
 * marketplace package migrations into it, and serves it through
 * a small proxy at `<url>/rest/v1/*` so the app's normal supabase-js client works unchanged.
 * `stop()` drops the schema and removes both containers.
 */
import { execFileSync } from 'node:child_process';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';

const PG_IMAGE = process.env.GIGS_TEST_PG_IMAGE || 'postgres:16';
const POSTGREST_IMAGE = process.env.GIGS_TEST_POSTGREST_IMAGE || 'postgrest/postgrest:v12.2.3';
const ROOT = path.resolve(__dirname, '..', '..');

export interface GigsTestDb {
  /** Base URL to use as STORAGE_SUPABASE_URL. */
  supabaseUrl: string;
  /** A service_role JWT to use as STORAGE_SUPABASE_SERVICE_ROLE_KEY. */
  serviceRoleKey: string;
  /** Direct Postgres URL (superuser), for seeding and assertions. */
  pgUrl: string;
  schema: string;
  stop(): Promise<void>;
}

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hostPort(container: string, port: number): number {
  const out = docker(['port', container, `${port}/tcp`]).split('\n')[0];
  return Number(out.slice(out.lastIndexOf(':') + 1));
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function waitFor<T>(fn: () => Promise<T>, label: string, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Timed out waiting for ${label}: ${String(lastErr)}`);
}

/**
 * Proxy `/rest/v1/*` → PostgREST `/*`, the way Supabase's gateway does, and map the
 * client's `public` schema profile onto the throwaway test schema.
 */
function startRestProxy(targetPort: number, schema: string): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url || '/';
    const stripped = url.startsWith('/rest/v1') ? url.slice('/rest/v1'.length) || '/' : url;
    const headers = { ...req.headers };
    for (const h of ['accept-profile', 'content-profile']) {
      if (headers[h] === 'public') headers[h] = schema;
    }
    const upstream = httpRequest(
      { host: '127.0.0.1', port: targetPort, method: req.method, path: stripped, headers },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: String(err) }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * api_keys as it stands in Supabase before 20261201_qa.sql (001 + 002 + 20250123 +
 * 20260514 + 20261011), without the RLS policies that need Supabase's auth schema.
 */
const API_KEYS_PREREQ_SQL = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    api_key_suffix TEXT NOT NULL,
    api_key TEXT,
    name TEXT,
    server_name TEXT NOT NULL DEFAULT 'default',
    device_name TEXT NOT NULL DEFAULT 'default',
    provider TEXT NOT NULL DEFAULT 'custom',
    plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'plus', 'super')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT uq_api_keys_user_server_device UNIQUE (user_id, server_name, device_name)
  );
  ALTER TABLE paid_usage_analytics ADD COLUMN IF NOT EXISTS api_key_id UUID;
`;

export async function startGigsTestDb(): Promise<GigsTestDb> {
  const id = randomBytes(4).toString('hex');
  const schema = `test_gigs_${id}`;
  const pgName = `tulzo-gigs-pg-${id}`;
  const restName = `tulzo-gigs-rest-${id}`;
  const password = randomBytes(12).toString('hex');
  const jwtSecret = randomBytes(32).toString('hex');

  docker([
    'run', '-d', '--rm', '--name', pgName,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-p', '127.0.0.1::5432',
    PG_IMAGE,
  ]);
  let restServer: Server | null = null;
  let restStarted = false;
  const pgPort = hostPort(pgName, 5432);
  const pgUrl = `postgres://postgres:${password}@127.0.0.1:${pgPort}/postgres`;

  const stop = async () => {
    try {
      const c = new Client({ connectionString: pgUrl });
      await c.connect();
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await c.end();
    } catch {
      // container may already be gone
    }
    if (restServer) await new Promise((r) => restServer!.close(() => r(null)));
    if (restStarted) {
      try { docker(['rm', '-f', restName]); } catch { /* ignore */ }
    }
    try { docker(['rm', '-f', pgName]); } catch { /* ignore */ }
  };

  try {
    await waitFor(async () => {
      const c = new Client({ connectionString: pgUrl });
      await c.connect();
      await c.query('select 1');
      await c.end();
    }, 'postgres');

    const admin = new Client({ connectionString: pgUrl });
    await admin.connect();
    await admin.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}';
      GRANT anon, service_role TO authenticator;
      CREATE SCHEMA ${schema};
      GRANT USAGE ON SCHEMA ${schema} TO anon, service_role;
    `);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20260525_paid_proxy_tables.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20260526_budget_analytics.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261101_jobs_core.sql'), 'utf8'));
    await admin.query(API_KEYS_PREREQ_SQL);
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261102_notifications.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261115_job_room.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261201_qa.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261202_submissions_owner_admin.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261203_qa_credit_holds.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261215_delivery_trust.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations/20261206_job_room_followups.sql'), 'utf8'));
    // Marketplace: packages, ratings/installs, and the new kinds + catalog view.
    for (const m of [
      '20260521_packages.sql',
      '20260522_mcp_registry.sql',
      '20260703_package_ratings_discovery.sql',
      '20261205_marketplace_kinds_catalog.sql',
    ]) {
      await admin.query(readFileSync(path.join(ROOT, 'supabase/migrations', m), 'utf8'));
    }
    await admin.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA ${schema} TO service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA ${schema} TO service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO service_role;
    `);
    await admin.end();

    docker([
      'run', '-d', '--rm', '--name', restName,
      '-e', `PGRST_DB_URI=postgres://authenticator:${password}@host.docker.internal:${pgPort}/postgres`,
      '-e', `PGRST_DB_SCHEMAS=${schema}`,
      '-e', 'PGRST_DB_ANON_ROLE=anon',
      '-e', `PGRST_JWT_SECRET=${jwtSecret}`,
      '-p', '127.0.0.1::3000',
      POSTGREST_IMAGE,
    ]);
    restStarted = true;
    const restPort = hostPort(restName, 3000);
    const serviceRoleKey = signJwt({ role: 'service_role', iss: 'gigs-test' }, jwtSecret);

    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${restPort}/jobs?select=id&limit=1`, {
        headers: { Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!res.ok) throw new Error(`postgrest ${res.status} ${await res.text()}`);
    }, 'postgrest');

    restServer = await startRestProxy(restPort, schema);
    const proxyPort = (restServer.address() as AddressInfo).port;

    return { supabaseUrl: `http://127.0.0.1:${proxyPort}`, serviceRoleKey, pgUrl, schema, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** Truncate every gigs table plus the budget tables (between test files). */
export async function resetGigsTables(pgUrl: string, schema: string): Promise<void> {
  const c = new Client({ connectionString: pgUrl });
  await c.connect();
  await c.query(`
    TRUNCATE ${[
      'credit_grants', 'plan_subscriptions', 'balance_transactions', 'trust_scores', 'reviews', 'deliveries',
      'transfer_reversals', 'disputes',
      'activity_events', 'steering_requests', 'milestones', 'job_messages',
      'stripe_events', 'refunds', 'transfers', 'payments', 'contract_versions', 'contracts', 'bids',
      'offers', 'job_spec_versions', 'jobs', 'provider_profiles', 'agent_identities', 'principals',
      'user_budgets', 'paid_usage_analytics',
      'qa_credit_holds', 'qa_usage_log', 'qa_reviews', 'qa_requests', 'audit_events', 'submissions', 'api_keys',
      'user_contacts', 'notifications', 'notification_preferences',
      'package_installs', 'package_ratings', 'package_versions', 'packages',
    ].map((t) => `${schema}.${t}`).join(', ')} CASCADE
  `);
  await c.end();
}

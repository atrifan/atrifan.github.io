/**
 * Shared setup for gigs integration tests. Run through `npm run test:integration`,
 * which provides a throwaway DB (see scripts/test-integration.ts).
 *
 * Call installMocks() at the top of a test file, BEFORE importing any route module:
 * it replaces Clerk's auth() and the ai SDK's generateObject.
 */
import { mock } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import { Client } from 'pg';
import { resetGigsTables } from '../support/gigs-test-db';
import { startFakeStripe, type FakeStripe } from '../support/fake-stripe';

export const authState: { userId: string | null } = { userId: null };

type GenerateObjectFn = (args: Record<string, unknown>) => Promise<unknown>;
export const aiState: { generateObject: GenerateObjectFn; calls: Array<Record<string, unknown>> } = {
  generateObject: async () => {
    throw new Error('generateObject not stubbed');
  },
  calls: [],
};

/** Clerk users and bearer tokens the mocked Clerk SDK knows. */
export const clerkState: {
  users: Map<string, { emailAddresses: Array<{ emailAddress: string }>; publicMetadata: Record<string, unknown> }>;
  tokens: Map<string, string>;
} = { users: new Map(), tokens: new Map() };

type StreamTextFn = (args: Record<string, any>) => unknown;
export const streamState: { streamText: StreamTextFn; calls: Array<Record<string, unknown>> } = {
  streamText: () => {
    throw new Error('streamText not stubbed');
  },
  calls: [],
};

/** Notifications the code under test enqueued (src/lib/notify is mocked). */
export const notifyState: { sent: Array<{ userId: string; type: string; payload: Record<string, unknown>; dedupeKey: string }> } = {
  sent: [],
};

export function installMocks(): void {
  mock.module(pathToFileURL(require.resolve('@clerk/nextjs/server')).href, {
    namedExports: {
      auth: async () => ({ userId: authState.userId }),
      currentUser: async () => null,
      verifyToken: async (token: string) => {
        const sub = clerkState.tokens.get(token);
        if (!sub) throw new Error('invalid token');
        return { sub };
      },
      clerkClient: async () => ({
        users: {
          getUser: async (id: string) => {
            const u = clerkState.users.get(id);
            if (!u) throw new Error('user not found');
            return { id, ...u };
          },
        },
      }),
    },
  });
  mock.module(pathToFileURL(require.resolve('ai')).href, {
    namedExports: {
      generateObject: async (args: Record<string, unknown>) => {
        aiState.calls.push(args);
        return aiState.generateObject(args);
      },
      streamText: (args: Record<string, any>) => {
        streamState.calls.push(args);
        return streamState.streamText(args);
      },
    },
  });
  mock.module(pathToFileURL(path.resolve(__dirname, '../../src/lib/notify/index.ts')).href, {
    namedExports: {
      enqueue: async (userId: string, type: string, payload: Record<string, unknown>, dedupeKey: string) => {
        notifyState.sent.push({ userId, type, payload, dedupeKey });
        return { status: 'queued', id: `n_${notifyState.sent.length}` };
      },
    },
  });
}

export function requireTestDb(): { pgUrl: string; schema: string } {
  const pgUrl = process.env.GIGS_TEST_PG_URL;
  const schema = process.env.GIGS_TEST_SCHEMA;
  if (!pgUrl || !schema || !/^test_gigs_[a-f0-9]+$/.test(schema)) {
    throw new Error('Run integration tests with `npm run test:integration` (needs the throwaway test DB).');
  }
  return { pgUrl, schema };
}

export async function resetDb(): Promise<void> {
  const { pgUrl, schema } = requireTestDb();
  await resetGigsTables(pgUrl, schema);
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const { pgUrl, schema } = requireTestDb();
  const c = new Client({ connectionString: pgUrl });
  await c.connect();
  try {
    await c.query(`SET search_path TO ${schema}`);
    const r = await c.query(text, params);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

/** Seed a provider who finished Stripe Connect onboarding. */
export async function seedEnabledProvider(userId: string, accountId = `acct_seed_${userId}`): Promise<void> {
  const [p] = await sql<{ id: string }>(
    `INSERT INTO principals (kind, user_id) VALUES ('user', $1)
     ON CONFLICT (user_id) WHERE kind = 'user' DO UPDATE SET updated_at = NOW() RETURNING id`,
    [userId],
  );
  await sql(
    `INSERT INTO provider_profiles (user_id, principal_id, stripe_account_id, connect_status, payouts_enabled,
       charges_enabled, details_submitted, country, headline, skills)
     VALUES ($1, $2, $3, 'enabled', TRUE, TRUE, TRUE, 'DE', 'Seeded provider', ARRAY['typescript'])
     ON CONFLICT (user_id) DO UPDATE SET payouts_enabled = TRUE, connect_status = 'enabled',
       stripe_account_id = EXCLUDED.stripe_account_id`,
    [userId, p.id, accountId],
  );
}

export async function seedBalance(userId: string, dollars: number): Promise<void> {
  await sql(
    `INSERT INTO user_budgets (user_id, remaining_balance, status) VALUES ($1, $2, 'active')
     ON CONFLICT (user_id) DO UPDATE SET remaining_balance = EXCLUDED.remaining_balance, status = 'active'`,
    [userId, dollars],
  );
}

let fake: FakeStripe | null = null;
export async function useFakeStripe(): Promise<FakeStripe> {
  if (!fake) {
    fake = await startFakeStripe();
    process.env.STRIPE_API_BASE = fake.url;
  }
  return fake;
}
export async function stopFakeStripe(): Promise<void> {
  if (fake) await fake.close();
  fake = null;
  delete process.env.STRIPE_API_BASE;
}

export interface CallOptions {
  method?: string;
  url: string;
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  user?: string | null;
}

type Handler = (req: never, ctx: never) => Promise<Response> | Response;

export async function call(
  handler: Handler,
  { method = 'GET', url, body, params = {}, headers = {}, user }: CallOptions,
): Promise<{ status: number; body: any }> {
  if (user !== undefined) authState.userId = user;
  const { NextRequest } = await import('next/server');
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), init);
  const res = await (handler as unknown as (r: unknown, c: unknown) => Promise<Response>)(req, { params });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body: parsed };
}

export function signedWebhook(event: Record<string, unknown>): { body: string; headers: Record<string, string> } {
  const payload = JSON.stringify(event);
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const header = new Stripe('sk_test_signing_only').webhooks.generateTestHeaderString({ payload, secret });
  return { body: payload, headers: { 'stripe-signature': header } };
}

let evtCounter = 0;
export function stripeEvent(type: string, object: Record<string, unknown>, id?: string): Record<string, unknown> {
  evtCounter += 1;
  return {
    id: id ?? `evt_test_${Date.now()}_${evtCounter}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    type,
    data: { object },
  };
}

export const VALID_SPEC = {
  requirements: ['Import CSV files into Postgres'],
  deliverables: ['Source code in a private GitHub repo'],
  acceptance_criteria: ['The sample file imports with zero errors'],
  constraints: ['Node 24'],
  deadline: '2026-12-01T00:00:00.000Z',
  budget_min_cents: 20000,
  budget_max_cents: 40000,
  permitted_tools: ['node', 'postgres'],
  security: { data_sensitivity: 'internal', secrets_allowed: false, notes: '' },
};

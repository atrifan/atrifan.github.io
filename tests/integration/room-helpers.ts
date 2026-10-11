/**
 * Job-room fixtures for the gigs-room*.test.ts files: a paid contract built through the real
 * HTTP routes, and a JSON-RPC client for /api/jobs/mcp using the dev-only test identity.
 * Import AFTER installMocks() (it loads route modules lazily).
 */
import assert from 'node:assert/strict';
import { call, seedEnabledProvider, signedWebhook, stripeEvent, VALID_SPEC } from './helpers';

export const E2E_SECRET = 'integration-test-secret-0123456789';
process.env.JOBS_E2E_AUTH_SECRET = E2E_SECRET;

type Mod = Record<string, (...args: never[]) => Promise<Response>>;
const routes: Record<string, Mod> = {};

async function route(name: string): Promise<Mod> {
  if (!routes[name]) {
    const map: Record<string, () => Promise<unknown>> = {
      jobs: () => import('../../app/api/jobs/route'),
      draft: () => import('../../app/api/jobs/[id]/spec/draft/route'),
      approve: () => import('../../app/api/jobs/[id]/spec/approve/route'),
      bids: () => import('../../app/api/jobs/[id]/bids/route'),
      accept: () => import('../../app/api/bids/[id]/accept/route'),
      webhook: () => import('../../app/api/billing/webhook/route'),
      mcp: () => import('../../app/api/jobs/mcp/route'),
      contracts: () => import('../../app/api/contracts/route'),
      contract: () => import('../../app/api/contracts/[id]/route'),
      messages: () => import('../../app/api/contracts/[id]/messages/route'),
      steering: () => import('../../app/api/contracts/[id]/steering/route'),
      steeringApprove: () => import('../../app/api/contracts/[id]/steering/[sid]/approve/route'),
      steeringReject: () => import('../../app/api/contracts/[id]/steering/[sid]/reject/route'),
      milestones: () => import('../../app/api/contracts/[id]/milestones/route'),
      activity: () => import('../../app/api/contracts/[id]/activity/route'),
    };
    routes[name] = (await map[name]()) as Mod;
  }
  return routes[name];
}

/** Call a route handler `name.METHOD` as `user`. */
export async function http(
  name: string,
  method: 'GET' | 'POST',
  url: string,
  opts: { user: string | null; params?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: any }> {
  const mod = await route(name);
  return call(mod[method] as never, { method, url, user: opts.user, params: opts.params, body: opts.body });
}

let rpcId = 0;

/** Raw JSON-RPC to /api/jobs/mcp with the test identity (or explicit headers). */
export async function rpc(
  message: Record<string, unknown> | string,
  opts: { user?: string; client?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const mod = await route('mcp');
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.user) {
    headers['x-e2e-user'] = opts.user;
    headers['x-e2e-secret'] = E2E_SECRET;
    if (opts.client) headers['x-e2e-client'] = opts.client;
  }
  const body = typeof message === 'string' ? message : { jsonrpc: '2.0', id: ++rpcId, ...message };
  return call(mod.POST as never, { method: 'POST', url: '/api/jobs/mcp', body, headers, user: null });
}

/** tools/call as `user`; returns the structuredContent and whether it was a tool error. */
export async function tool(
  user: string,
  name: string,
  args: Record<string, unknown> = {},
  client?: string,
): Promise<{ isError: boolean; data: any }> {
  const res = await rpc({ method: 'tools/call', params: { name, arguments: args } }, { user, client });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.result, JSON.stringify(res.body));
  return { isError: res.body.result.isError === true, data: res.body.result.structuredContent };
}

export async function openJob(customer: string, title = 'Room job for integration tests'): Promise<string> {
  const created = await http('jobs', 'POST', '/api/jobs', {
    user: customer,
    body: { title, description: 'A job used to exercise the job room.', deadline: '2026-12-24T00:00:00.000Z' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.job.id as string;
  await http('draft', 'POST', `/api/jobs/${id}/spec/draft`, { user: customer, params: { id }, body: { spec: VALID_SPEC } });
  const ok = await http('approve', 'POST', `/api/jobs/${id}/spec/approve`, { user: customer, params: { id }, body: {} });
  assert.equal(ok.body.job.status, 'open');
  return id;
}

export interface PaidContract {
  contractId: string;
  jobId: string;
  bidId: string;
  versionId: string;
  priceCents: number;
  customerTotalCents: number;
}

/** Customer posts a job, provider bids over HTTP, customer accepts, webhook pays it. */
export async function paidContract(
  customer: string,
  provider: string,
  opts: { credits?: number; priceCents?: number; pay?: boolean } = {},
): Promise<PaidContract> {
  await seedEnabledProvider(provider);
  const jobId = await openJob(customer);
  const bid = await http('bids', 'POST', `/api/jobs/${jobId}/bids`, {
    user: provider,
    params: { id: jobId },
    body: { price_cents: opts.priceCents ?? 30000, eta_days: 7, included_steering_credits: opts.credits ?? 1 },
  });
  assert.equal(bid.status, 201, JSON.stringify(bid.body));
  const bidId = bid.body.bid.id as string;
  const acc = await http('accept', 'POST', `/api/bids/${bidId}/accept`, { user: customer, params: { id: bidId } });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  const { contract, version } = acc.body;
  if (opts.pay !== false) {
    const event = stripeEvent('checkout.session.completed', {
      id: contract.stripe_checkout_session_id,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: version.customer_total_cents,
      currency: version.currency,
      payment_intent: `pi_${contract.id.slice(0, 8)}`,
      metadata: { kind: 'contract', contract_id: contract.id, job_id: jobId, bid_id: bidId },
    });
    const { body, headers } = signedWebhook(event);
    const hook = await call((await route('webhook')).POST as never, { method: 'POST', url: '/api/billing/webhook', body, headers });
    assert.equal(hook.status, 200, JSON.stringify(hook.body));
  }
  return {
    contractId: contract.id,
    jobId,
    bidId,
    versionId: version.id,
    priceCents: version.price_cents,
    customerTotalCents: version.customer_total_cents,
  };
}

/** Pay a top-up checkout the way Stripe would report it. */
export async function payTopup(session: { id: string; amount: number; currency?: string }, meta: Record<string, string>) {
  const event = stripeEvent('checkout.session.completed', {
    id: session.id,
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: session.amount,
    currency: session.currency ?? 'eur',
    payment_intent: `pi_topup_${session.id.slice(-8)}`,
    metadata: meta,
  });
  const { body, headers } = signedWebhook(event);
  return call((await route('webhook')).POST as never, { method: 'POST', url: '/api/billing/webhook', body, headers });
}

/**
 * Seeding and calling helpers for the gigs QA integration tests (gigs-qa*.test.ts).
 */
import { createHash, randomBytes } from 'node:crypto';
import { call, sql, VALID_SPEC } from './helpers';

export interface SeededContract {
  contractId: string;
  versionId: string;
  jobId: string;
  specId: string;
  customer: string;
  provider: string;
  customerPrincipalId: string;
  providerPrincipalId: string;
}

async function principal(userId: string): Promise<string> {
  const [p] = await sql<{ id: string }>(
    `INSERT INTO principals (kind, user_id) VALUES ('user', $1)
     ON CONFLICT (user_id) WHERE kind = 'user' DO UPDATE SET updated_at = NOW() RETURNING id`,
    [userId],
  );
  return p.id;
}

/** A paid (active) contract between `customer` and `provider`, job in_progress. */
export async function seedActiveContract(opts: {
  customer: string;
  provider: string;
  qaChecks?: string[] | null;
  priceCents?: number;
  status?: string;
  title?: string;
}): Promise<SeededContract> {
  const { customer, provider, qaChecks = null, priceCents = 30000, status = 'active', title = 'Build a CSV importer' } = opts;
  const customerPrincipalId = await principal(customer);
  const providerPrincipalId = await principal(provider);
  const [job] = await sql<{ id: string }>(
    `INSERT INTO jobs (user_id, customer_principal_id, title, description, status)
     VALUES ($1, $2, $3, 'Import CSV files into Postgres quickly.', 'draft') RETURNING id`,
    [customer, customerPrincipalId, title],
  );
  const [spec] = await sql<{ id: string }>(
    `INSERT INTO job_spec_versions (job_id, user_id, version, status, source, requirements, deliverables,
       acceptance_criteria, constraints, permitted_tools, security, approved_at, approved_by)
     VALUES ($1, $2, 1, 'approved', 'manual', $3, $4, $5, $6, $7, $8, NOW(), $2) RETURNING id`,
    [
      job.id, customer, JSON.stringify(VALID_SPEC.requirements), JSON.stringify(VALID_SPEC.deliverables),
      JSON.stringify(VALID_SPEC.acceptance_criteria), JSON.stringify(VALID_SPEC.constraints),
      JSON.stringify(VALID_SPEC.permitted_tools), JSON.stringify(VALID_SPEC.security),
    ],
  );
  await sql(`UPDATE jobs SET status = 'in_progress', current_spec_version_id = $2 WHERE id = $1`, [job.id, spec.id]);
  const [bid] = await sql<{ id: string }>(
    `INSERT INTO bids (job_id, spec_version_id, user_id, provider_principal_id, price_cents, eta_days, plan,
       included_steering_credits, status)
     VALUES ($1, $2, $3, $4, $5, 7, 'Do it well', 2, 'accepted') RETURNING id`,
    [job.id, spec.id, provider, providerPrincipalId, priceCents],
  );
  const [contract] = await sql<{ id: string }>(
    `INSERT INTO contracts (job_id, bid_id, user_id, customer_user_id, provider_user_id, customer_principal_id,
       provider_principal_id, status)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7) RETURNING id`,
    [job.id, bid.id, customer, provider, customerPrincipalId, providerPrincipalId, status],
  );
  const fee = Math.floor((priceCents * 1500 + 5000) / 10000);
  const [version] = await sql<{ id: string }>(
    `INSERT INTO contract_versions (contract_id, user_id, version, spec_version_id, price_cents, commission_bps,
       fee_cents, customer_total_cents, steering_allowance, signed_by_customer_at, signed_by_provider_at, qa_checks)
     VALUES ($1, $2, 1, $3, $4, 1500, $5, $6, 2, NOW(), NOW(), $7) RETURNING id`,
    [contract.id, customer, spec.id, priceCents, fee, priceCents + fee, qaChecks],
  );
  await sql(`UPDATE contracts SET current_version_id = $2 WHERE id = $1`, [contract.id, version.id]);
  return {
    contractId: contract.id, versionId: version.id, jobId: job.id, specId: spec.id,
    customer, provider, customerPrincipalId, providerPrincipalId,
  };
}

/** A device API key (as /api/keys/generate makes them); returns the plaintext key. */
export async function seedDeviceKey(userId: string, plan = 'pro'): Promise<string> {
  const key = `ak_${randomBytes(24).toString('base64url').toUpperCase().slice(0, 32)}`;
  await sql(
    `INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, plan, device_name, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [userId, createHash('sha256').update(key).digest('hex'), key.slice(-4), plan, `dev_${randomBytes(4).toString('hex')}`],
  );
  return key;
}

export async function seedContact(userId: string, name: string, email: string): Promise<void> {
  await sql(
    `INSERT INTO user_contacts (user_id, name, email, email_verified) VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
    [userId, name, email],
  );
}

export async function balance(userId: string): Promise<number | null> {
  const rows = await sql<{ remaining_balance: string }>('SELECT remaining_balance FROM user_budgets WHERE user_id = $1', [userId]);
  return rows[0] ? Number(rows[0].remaining_balance) : null;
}

export async function contractStatus(contractId: string): Promise<string> {
  const [row] = await sql<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [contractId]);
  return row.status;
}

type Handler = Parameters<typeof call>[0];

export interface RpcResult {
  status: number;
  body: any;
  /** structuredContent of a tools/call result, if any. */
  data: any;
  /** Raw response text (to check secrets are not echoed). */
  text: string;
}

let rpcId = 0;
export async function rpc(
  handler: Handler,
  url: string,
  method: string,
  params: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<RpcResult> {
  rpcId += 1;
  const res = await call(handler, { method: 'POST', url, headers, body: { jsonrpc: '2.0', id: rpcId, method, params } });
  return { status: res.status, body: res.body, data: res.body?.result?.structuredContent, text: JSON.stringify(res.body) };
}

export function toolCall(handler: Handler, url: string, name: string, args: Record<string, unknown>, headers: Record<string, string>) {
  return rpc(handler, url, 'tools/call', { name, arguments: args }, headers);
}

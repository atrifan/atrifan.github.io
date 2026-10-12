/**
 * Seeded rows behind the admin home's numbers (hub /admin), for the throwaway DB of
 * `npm run test:e2e:marketplace` (scripts/test-e2e-marketplace.ts). Written straight to Postgres:
 *
 * - QA queue: 2 submissions awaiting QA (and 1 validated, not counted)
 * - Disputes: 1 open + 1 resolving (both open) and 1 resolved
 * - Inbox: 3 open threads, 1 answered, 1 closed
 * - Activity: two succeeded payments in the last 30 days, €45.00 commission each (€90.00), plus a
 *   refunded one and a 40-day-old one that earn nothing in the window
 * - Marketplace moderation: the catalog fixtures already hold 1 pending package (fx-pending-mcp)
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

export const ADMIN_HOME_COUNTS = { qa: 2, disputes: 2, inbox: 3, pending: 1, commission: '€90.00' } as const;

const CUSTOMER = 'user_admin_home_customer';
const PROVIDER = 'user_admin_home_provider';
const PRICE = 30000;
const FEE = 4500;
const DAY = 86_400_000;

const hex = (n = 6) => randomBytes(n).toString('hex');
const sha = () => randomBytes(20).toString('hex');

export async function seedAdminHome(pgUrl: string, schema: string): Promise<void> {
  const c = new Client({ connectionString: pgUrl });
  await c.connect();
  const q = async <T = { id: string }>(text: string, values: unknown[] = []): Promise<T[]> => (await c.query(text, values)).rows as T[];
  try {
    await c.query(`SET search_path TO ${schema}`);
    const principal = async (userId: string) =>
      (
        await q(
          `INSERT INTO principals (kind, user_id) VALUES ('user', $1)
           ON CONFLICT (user_id) WHERE kind = 'user' DO UPDATE SET updated_at = NOW() RETURNING id`,
          [userId],
        )
      )[0].id;
    const customerP = await principal(CUSTOMER);
    const providerP = await principal(PROVIDER);
    for (const [id, name] of [[CUSTOMER, 'Cara Customer'], [PROVIDER, 'Pat Provider']]) {
      await q(`INSERT INTO user_contacts (user_id, name, email, email_verified) VALUES ($1, $2, $3, TRUE) ON CONFLICT (user_id) DO NOTHING`, [
        id,
        name,
        `${id}@tulzo.test`,
      ]);
    }

    /** A signed contract (job, approved spec, accepted bid, version). */
    const contract = async (title: string) => {
      const [job] = await q(
        `INSERT INTO jobs (user_id, customer_principal_id, title, description, status)
         VALUES ($1, $2, $3, 'Seeded for the admin home.', 'draft') RETURNING id`,
        [CUSTOMER, customerP, title],
      );
      const [spec] = await q(
        `INSERT INTO job_spec_versions (job_id, user_id, version, status, source, requirements, deliverables,
           acceptance_criteria, constraints, permitted_tools, security, approved_at, approved_by)
         VALUES ($1, $2, 1, 'approved', 'manual', '["Works"]', '["Repo"]', '["Tests pass"]', '[]', '[]',
           '{"data_sensitivity":"internal","secrets_allowed":false,"notes":""}', NOW(), $2) RETURNING id`,
        [job.id, CUSTOMER],
      );
      await q(`UPDATE jobs SET status = 'in_progress', current_spec_version_id = $2 WHERE id = $1`, [job.id, spec.id]);
      const [bid] = await q(
        `INSERT INTO bids (job_id, spec_version_id, user_id, provider_principal_id, price_cents, eta_days, plan,
           included_steering_credits, status)
         VALUES ($1, $2, $3, $4, $5, 7, 'Do it well', 2, 'accepted') RETURNING id`,
        [job.id, spec.id, PROVIDER, providerP, PRICE],
      );
      const [k] = await q(
        `INSERT INTO contracts (job_id, bid_id, user_id, customer_user_id, provider_user_id, customer_principal_id,
           provider_principal_id, status)
         VALUES ($1, $2, $3, $3, $4, $5, $6, 'active') RETURNING id`,
        [job.id, bid.id, CUSTOMER, PROVIDER, customerP, providerP],
      );
      const [v] = await q(
        `INSERT INTO contract_versions (contract_id, user_id, version, spec_version_id, price_cents, commission_bps,
           fee_cents, customer_total_cents, steering_allowance, signed_by_customer_at, signed_by_provider_at)
         VALUES ($1, $2, 1, $3, $4, 1500, $5, $6, 2, NOW(), NOW()) RETURNING id`,
        [k.id, CUSTOMER, spec.id, PRICE, FEE, PRICE + FEE],
      );
      await q(`UPDATE contracts SET current_version_id = $2 WHERE id = $1`, [k.id, v.id]);
      return { contractId: k.id, versionId: v.id };
    };

    const submission = async (title: string, status: string) => {
      const k = await contract(title);
      await q(
        `INSERT INTO submissions (contract_id, contract_version_id, user_id, customer_user_id, attempt, repo_full_name,
           commit_sha, pat_ciphertext, pat_iv, pat_tag, status)
         VALUES ($1, $2, $3, $4, 1, 'acme/app', $5, 'x', 'x', 'x', $6)`,
        [k.contractId, k.versionId, PROVIDER, CUSTOMER, sha(), status],
      );
    };
    await submission('Fix the login bug', 'awaiting_qa');
    await submission('Add CSV export', 'awaiting_qa');
    await submission('Speed up search', 'validated');

    const dispute = async (title: string, status: string) => {
      const k = await contract(title);
      await q(
        `INSERT INTO disputes (contract_id, user_id, provider_user_id, opened_by_user_id, source, phase, category, reason, status,
           resolution, resolved_at)
         VALUES ($1, $2, $3, $2, 'customer', 'pre_accept', 'quality', 'Seeded dispute', $4, $5, $6)`,
        [k.contractId, CUSTOMER, PROVIDER, status, status === 'open' ? null : 'release', status === 'resolved' ? new Date().toISOString() : null],
      );
    };
    await dispute('Import drops rows', 'open');
    await dispute('Late delivery', 'resolving');
    await dispute('Wrong colours', 'resolved');

    const payment = async (title: string, status: string, daysAgo: number) => {
      const k = await contract(title);
      const refunded = status === 'refunded' ? PRICE + FEE : 0;
      await q(
        `INSERT INTO payments (contract_id, contract_version_id, user_id, stripe_checkout_session_id, stripe_payment_intent_id,
           amount_cents, amount_refunded_cents, currency, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'eur', $8, $9)`,
        [k.contractId, k.versionId, CUSTOMER, `cs_test_${hex()}`, `pi_test_${hex()}`, PRICE + FEE, refunded, status, new Date(Date.now() - daysAgo * DAY).toISOString()],
      );
    };
    await payment('Logo refresh', 'succeeded', 2);
    await payment('Docs site', 'succeeded', 10);
    await payment('Refunded gig', 'refunded', 5);
    await payment('Old gig', 'succeeded', 40);

    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const ref = (i: number) => `TZ-AH${alphabet[i]}0-${alphabet[i]}000`;
    const threads: Array<[string, string]> = [
      ['Refund question', 'open'],
      ['Account locked', 'open'],
      ['Illegal content report', 'open'],
      ['Invoice copy', 'answered'],
      ['Thanks!', 'closed'],
    ];
    for (const [i, [subject, status]] of threads.entries()) {
      await q(
        `INSERT INTO support_threads (reference, source, subject, contact_email, status, last_message_at)
         VALUES ($1, 'email', $2, $3, $4, NOW() - ($5 || ' hours')::interval)`,
        [ref(i + 1), subject, `person${i}@tulzo.test`, status, String(i + 1)],
      );
    }
  } finally {
    await c.end();
  }
}

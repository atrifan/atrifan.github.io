/**
 * Seeding for the Phase 5 integration tests (delivery, acceptance, disputes, reviews, trust):
 * a contract QA validated (delivered), paid, with the provider's PAT sealed like send_project
 * does, and a provider who finished Stripe Connect.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { seal } from '../../src/lib/crypto/secret-box';
import { seedEnabledProvider, sql } from './helpers';
import { seedActiveContract, type SeededContract } from './qa-helpers';
import { FAKE_REPOS, FAKE_SHA_HEAD, FAKE_TOKENS } from '../support/fake-github';
import type { FakeStripe } from '../support/fake-stripe';

export interface DeliveredContract extends SeededContract {
  submissionId: string;
  paymentId: string;
  paymentIntentId: string;
  chargeId: string;
  accountId: string;
}

const hex = () => randomBytes(6).toString('hex');

export async function seedDelivered(opts: {
  customer: string;
  provider: string;
  stripe: FakeStripe;
  status?: string;
  autoAcceptAt?: string;
  paymentStatus?: string;
  validated?: boolean;
  title?: string;
  cardFingerprint?: string;
}): Promise<DeliveredContract> {
  const { customer, provider, stripe, status = 'delivered', validated = true, paymentStatus = 'succeeded' } = opts;
  const accountId = `acct_test_${provider.replace(/\W/g, '')}`;
  const c = await seedActiveContract({ customer, provider, status, title: opts.title ?? `Delivery ${hex()}` });
  await seedEnabledProvider(provider, accountId);
  await sql(`UPDATE jobs SET status = $2 WHERE id = $1`, [c.jobId, status === 'delivered' ? 'delivered' : 'in_progress']);
  await sql(`UPDATE contracts SET transfer_group = 'contract_' || id WHERE id = $1`, [c.contractId]);
  const paymentIntentId = `pi_test_${hex()}`;
  const chargeId = `ch_test_${hex()}`;
  stripe.addPaymentIntent({ id: paymentIntentId, amount: 34500, currency: 'eur', chargeId, cardFingerprint: opts.cardFingerprint ?? `fp_${customer}` });
  const [payment] = await sql<{ id: string }>(
    `INSERT INTO payments (contract_id, contract_version_id, user_id, stripe_checkout_session_id, stripe_payment_intent_id,
       amount_cents, currency, status)
     VALUES ($1, $2, $3, $4, $5, 34500, 'eur', $6) RETURNING id`,
    [c.contractId, c.versionId, customer, `cs_test_${hex()}`, paymentIntentId, paymentStatus],
  );
  const submissionId = randomUUID();
  const sealed = seal(FAKE_TOKENS.good, { aad: `submission:${submissionId}` });
  const now = Date.now();
  await sql(
    `INSERT INTO submissions (id, contract_id, contract_version_id, user_id, customer_user_id, attempt, repo_full_name,
       commit_sha, pat_ciphertext, pat_iv, pat_tag, pat_expires_at, status, reviewed_at, delivery_unlocked_at, auto_accept_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      submissionId, c.contractId, c.versionId, provider, customer, FAKE_REPOS.private, FAKE_SHA_HEAD,
      sealed.ciphertext, sealed.iv, sealed.tag, new Date(now + 10 * 86_400_000).toISOString(),
      validated ? 'validated' : 'awaiting_qa',
      validated ? new Date(now).toISOString() : null,
      validated ? new Date(now).toISOString() : null,
      validated ? opts.autoAcceptAt ?? new Date(now + 7 * 86_400_000).toISOString() : null,
    ],
  );
  if (validated) {
    await sql(
      `INSERT INTO qa_reviews (submission_id, contract_id, reviewer_user_id, verdict, reason, report_md, findings)
       VALUES ($1, $2, 'user_admin', 'validated', NULL, '## QA report\nAll acceptance criteria pass.', $3)`,
      [submissionId, c.contractId, JSON.stringify([{ severity: 'low', title: 'Add a README section on CSV encoding' }, 'Consider streaming large files'])],
    );
  }
  return { ...c, submissionId, paymentId: payment.id, paymentIntentId, chargeId, accountId };
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<T>(text, params);
  if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}: ${text}`);
  return rows[0];
}

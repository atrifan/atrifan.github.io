/**
 * Reads shared by delivery, acceptance, disputes and reviews: a contract as one of its
 * parties sees it, its payments and transfers, the validated (delivered) submission, the open
 * dispute and the money state for src/lib/disputes/amounts.ts. Service-role client; every
 * user-facing read goes through loadPartyContract, which checks the caller is a party.
 */
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, notFound } from '../jobs/errors';
import { isUuid } from '../jobs/jobs-service';
import { loadContract, loadContractVersion } from '../jobs/contracts-service';
import type { ContractRow, ContractVersionRow, PaymentRow, PartyRole } from '../jobs/types';
import type { SubmissionRow } from '../qa/qa-data';
import type { MoneyState } from '../disputes/amounts';

export interface Phase5ContractRow extends ContractRow {
  accepted_at: string | null;
  accepted_by: string | null;
  acceptance: 'customer' | 'auto' | 'resolution' | null;
}

export interface TransferRow {
  id: string;
  contract_id: string;
  payment_id: string | null;
  user_id: string;
  stripe_transfer_id: string | null;
  destination_account_id: string;
  transfer_group: string | null;
  amount_cents: number;
  amount_reversed_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'reversed' | 'partially_reversed';
  created_at: string;
}

export interface DisputeRow {
  id: string;
  contract_id: string;
  user_id: string;
  provider_user_id: string;
  opened_by_user_id: string | null;
  source: 'customer' | 'qa_rejected' | 'chargeback';
  phase: 'pre_accept' | 'post_accept';
  category: string;
  reason: string;
  evidence: string | null;
  status: 'open' | 'resolving' | 'resolved';
  default_resolution: 'release' | 'partial_refund' | 'full_refund' | null;
  resolution: 'release' | 'partial_refund' | 'full_refund' | null;
  refund_cents: number | null;
  transfer_cents: number | null;
  reversal_cents: number | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  stripe_dispute_id: string | null;
  stripe_dispute_status: string | null;
  stripe_dispute_reason: string | null;
  stripe_amount_cents: number | null;
  created_at: string;
  updated_at: string;
}

export type DeliverySubmission = SubmissionRow & { auto_accept_reminded_at: string | null };

export function contractIdParam(params: { id?: string } | undefined): string {
  const id = params?.id;
  if (!id || !isUuid(id)) throw new JobsError('invalid_request', 400, 'Contract id must be a UUID');
  return id;
}

/** The contract and the caller's role in it; 404 for anyone else (never reveals it exists). */
export async function loadPartyContract(userId: string, contractId: string): Promise<{ contract: Phase5ContractRow; role: PartyRole }> {
  if (!isUuid(contractId)) throw notFound('Contract not found');
  const contract = (await loadContract(contractId)) as Phase5ContractRow | null;
  if (!contract) throw notFound('Contract not found');
  if (contract.customer_user_id === userId) return { contract, role: 'customer' };
  if (contract.provider_user_id === userId) return { contract, role: 'provider' };
  throw notFound('Contract not found');
}

export async function currentVersion(contract: ContractRow): Promise<ContractVersionRow | null> {
  return contract.current_version_id ? loadContractVersion(contract.current_version_id) : null;
}

export async function listPayments(contractId: string): Promise<PaymentRow[]> {
  const { data, error } = await jobsDb().from('payments').select('*').eq('contract_id', contractId).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list payments');
  return (data ?? []) as PaymentRow[];
}

export async function listTransfers(contractId: string): Promise<TransferRow[]> {
  const { data, error } = await jobsDb().from('transfers').select('*').eq('contract_id', contractId).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list transfers');
  return (data ?? []) as TransferRow[];
}

const PAID_STATUSES = new Set(['succeeded', 'partially_refunded']);

/** The payment has gone through and is not refunded in full or under a chargeback. */
export function paymentSucceeded(payments: PaymentRow[]): boolean {
  return payments.some((p) => PAID_STATUSES.has(p.status));
}

/** The submission QA validated (the delivered one), if any. */
export async function deliveredSubmission(contractId: string): Promise<DeliverySubmission | null> {
  const { data, error } = await jobsDb()
    .from('submissions')
    .select('*')
    .eq('contract_id', contractId)
    .eq('status', 'validated')
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error, 'delivered submission');
  return data as DeliverySubmission | null;
}

export async function listSubmissions(contractId: string): Promise<DeliverySubmission[]> {
  const { data, error } = await jobsDb()
    .from('submissions')
    .select('id, contract_id, attempt, status, commit_sha, created_at, reviewed_at, delivery_unlocked_at, auto_accept_at, auto_accept_reminded_at, pat_purged_at, pat_expires_at, agent_identity_id')
    .eq('contract_id', contractId)
    .order('attempt', { ascending: true });
  if (error) throw dbError(error, 'list submissions');
  return (data ?? []) as DeliverySubmission[];
}

export async function listDisputes(contractId: string): Promise<DisputeRow[]> {
  const { data, error } = await jobsDb().from('disputes').select('*').eq('contract_id', contractId).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list disputes');
  return (data ?? []) as DisputeRow[];
}

/** Open (or resolving) disputes and open chargebacks: either one stops auto-accept and payout. */
export function openDisputes(disputes: DisputeRow[]): DisputeRow[] {
  return disputes.filter((d) => d.status !== 'resolved');
}

export function moneyState(version: ContractVersionRow, payments: PaymentRow[], transfers: TransferRow[]): MoneyState {
  const counted = payments.filter((p) => p.status !== 'pending' && p.status !== 'failed');
  const live = transfers.filter((t) => t.status !== 'failed' && t.status !== 'pending');
  return {
    customerPaidCents: counted.reduce((s, p) => s + p.amount_cents, 0),
    alreadyRefundedCents: counted.reduce((s, p) => s + p.amount_refunded_cents, 0),
    bidCents: version.price_cents,
    transferredCents: live.reduce((s, t) => s + t.amount_cents, 0),
    alreadyReversedCents: live.reduce((s, t) => s + t.amount_reversed_cents, 0),
  };
}

/** Zero both sides' sealed PATs for a contract (provider read PATs, customer push PATs). */
export async function purgeContractPats(contractId: string): Promise<{ submissions: number; deliveries: number }> {
  const db = jobsDb();
  const now = new Date().toISOString();
  const purge = { pat_ciphertext: null, pat_iv: null, pat_tag: null, pat_purged_at: now };
  const subs = await db.from('submissions').update(purge).eq('contract_id', contractId).is('pat_purged_at', null).select('id');
  if (subs.error) throw dbError(subs.error, 'purge submission PATs');
  const dels = await db.from('deliveries').update(purge).eq('contract_id', contractId).is('pat_purged_at', null).not('pat_ciphertext', 'is', null).select('id');
  if (dels.error) throw dbError(dels.error, 'purge delivery PATs');
  return { submissions: (subs.data ?? []).length, deliveries: (dels.data ?? []).length };
}

export async function jobTitleOf(jobId: string): Promise<string> {
  const { data } = await jobsDb().from('jobs').select('title').eq('id', jobId).maybeSingle();
  return (data as { title?: string } | null)?.title ?? 'Your job';
}

export async function displayName(userId: string, fallback: string): Promise<string> {
  const { data } = await jobsDb().from('user_contacts').select('name').eq('user_id', userId).maybeSingle();
  const name = (data as { name?: string | null } | null)?.name;
  return name && name.trim() ? name.trim() : fallback;
}

/**
 * Delivery: what QA validated, and how the customer gets it.
 *
 * Once QA validated a submission and the payment went through, the customer can download the
 * exact QA'd commit (a tarball streamed through the platform, fetched with the provider's
 * sealed read PAT, never shown to anyone) or have it pushed into an empty private repo of
 * their own with a fine-grained write PAT they give for that push. Every access is recorded in
 * `deliveries` and `audit_events`. Both PATs are purged on acceptance.
 *
 * The delivery view also carries the QA report and warnings, the attempt history, the
 * contract version history, the dispute state and what the caller may do next.
 */
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, isUniqueViolation } from '../jobs/errors';
import { open as openSecret, seal } from '../crypto/secret-box';
import { audit } from '../qa/qa-data';
import type { ContractVersionRow, PartyRole, PaymentRow } from '../jobs/types';
import { claimDaysFrom } from './auto-accept';
import { claimWindowEndsAt, disputeEligibility } from '../disputes/policy';
import {
  deliveredSubmission,
  listDisputes,
  listPayments,
  listSubmissions,
  listTransfers,
  loadPartyContract,
  openDisputes,
  paymentSucceeded,
  type DeliverySubmission,
  type DisputeRow,
  type Phase5ContractRow,
} from './contract-data';
import { fetchCommitTarball, pushTree, verifyPushTarget } from './github-delivery';
import { DEFAULT_TAR_LIMITS, TarError, readTar, stripTopDir } from './tar';

export interface DeliveryWarning {
  severity: string | null;
  title: string;
  detail: string | null;
}

export interface ReviewView {
  id: string;
  reviewer_role: 'customer' | 'provider';
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  body: string | null;
  created_at: string;
}

export interface DeliveryView {
  contract: {
    id: string;
    job_id: string;
    job_title: string;
    status: Phase5ContractRow['status'];
    role: PartyRole;
    currency: string;
    accepted_at: string | null;
    acceptance: Phase5ContractRow['acceptance'];
  };
  delivery: {
    unlocked: boolean;
    submission_id: string | null;
    attempt: number | null;
    commit_sha: string | null;
    unlocked_at: string | null;
    auto_accept_at: string | null;
    auto_accept_paused: boolean;
    pat_available: boolean;
  };
  qa: { verdict: string; reason: string | null; report_md: string | null; warnings: DeliveryWarning[]; reviewed_at: string } | null;
  history: Array<{ attempt: number; commit_sha: string; submitted_at: string; status: string; verdict: string | null; reason: string | null; reviewed_at: string | null }>;
  contract_versions: Array<{
    version: number;
    price_cents: number;
    fee_cents: number;
    customer_total_cents: number;
    deadline: string | null;
    steering_allowance: number;
    created_at: string;
    current: boolean;
  }>;
  deliveries: Array<{ id: string; kind: 'download' | 'push'; status: string; target_repo: string | null; pushed_commit_sha: string | null; error: string | null; created_at: string }>;
  payment: { status: PaymentRow['status']; amount_cents: number; refunded_cents: number } | null;
  payout: { status: string; amount_cents: number; reversed_cents: number; created_at: string } | null;
  dispute: {
    id: string;
    source: DisputeRow['source'];
    phase: DisputeRow['phase'];
    status: DisputeRow['status'];
    category: string;
    reason: string;
    created_at: string;
    resolution: DisputeRow['resolution'];
    refund_cents: number | null;
    resolution_note: string | null;
    resolved_at: string | null;
  } | null;
  actions: {
    can_download: boolean;
    can_push: boolean;
    can_accept: boolean;
    can_dispute: boolean;
    dispute_phase: 'pre_accept' | 'post_accept' | null;
    claim_window_ends_at: string | null;
    can_review: boolean;
  };
  reviews: { mine: ReviewView | null; theirs: ReviewView | null };
}

function asWarning(f: unknown): DeliveryWarning | null {
  if (typeof f === 'string') return f.trim() ? { severity: null, title: f.trim().slice(0, 500), detail: null } : null;
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const str = (...keys: string[]) => {
    for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
    return null;
  };
  const title = str('title', 'message', 'summary', 'name');
  if (!title) return null;
  return { severity: str('severity', 'level', 'priority'), title: title.slice(0, 500), detail: str('detail', 'description', 'body')?.slice(0, 4000) ?? null };
}

function hasUsablePat(sub: DeliverySubmission | null, now: Date): boolean {
  if (!sub || sub.pat_purged_at || !sub.pat_ciphertext) return false;
  return !sub.pat_expires_at || new Date(sub.pat_expires_at).getTime() > now.getTime();
}

/** Delivery is unlocked for the customer: QA validated it and the payment went through. */
function unlocked(contract: Phase5ContractRow, sub: DeliverySubmission | null, payments: PaymentRow[]): boolean {
  if (!sub?.delivery_unlocked_at || !paymentSucceeded(payments)) return false;
  return contract.status === 'delivered' || contract.status === 'completed' || contract.status === 'disputed';
}

const reviewView = (r: Record<string, unknown> | undefined): ReviewView | null =>
  r
    ? {
        id: r.id as string,
        reviewer_role: r.reviewer_role as ReviewView['reviewer_role'],
        overall: Number(r.overall),
        quality: Number(r.quality),
        communication: Number(r.communication),
        timeliness: Number(r.timeliness),
        body: (r.body as string | null) ?? null,
        created_at: r.created_at as string,
      }
    : null;

export async function getDeliveryView(userId: string, contractId: string, now: Date = new Date()): Promise<DeliveryView> {
  const { contract, role } = await loadPartyContract(userId, contractId);
  const db = jobsDb();
  const [sub, subs, payments, transfers, disputes, qa, versions, deliveries, reviews, job] = await Promise.all([
    deliveredSubmission(contract.id),
    listSubmissions(contract.id),
    listPayments(contract.id),
    listTransfers(contract.id),
    listDisputes(contract.id),
    db.from('qa_reviews').select('submission_id, verdict, reason, report_md, findings, created_at').eq('contract_id', contract.id).order('created_at', { ascending: true }),
    db.from('contract_versions').select('*').eq('contract_id', contract.id).order('version', { ascending: true }),
    role === 'customer'
      ? db.from('deliveries').select('id, kind, status, target_repo, pushed_commit_sha, error, created_at').eq('contract_id', contract.id).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    db.from('reviews').select('*').eq('contract_id', contract.id),
    db.from('jobs').select('title').eq('id', contract.job_id).maybeSingle(),
  ]);
  for (const r of [qa, versions, deliveries, reviews]) if (r.error) throw dbError(r.error, 'delivery view');
  const qaRows = (qa.data ?? []) as Array<{ submission_id: string; verdict: string; reason: string | null; report_md: string | null; findings: unknown; created_at: string }>;
  const qaBySub = new Map(qaRows.map((q) => [q.submission_id, q]));
  const validated = sub ? qaBySub.get(sub.id) : undefined;
  const isUnlocked = unlocked(contract, sub, payments);
  const open = openDisputes(disputes);
  const nonChargeback = disputes.filter((d) => d.source !== 'chargeback');
  const latestDispute = nonChargeback[nonChargeback.length - 1] ?? disputes[disputes.length - 1] ?? null;
  const claimDays = claimDaysFrom();
  const eligibility = disputeEligibility({ contractStatus: contract.status, hasOpenDispute: open.length > 0, acceptedAt: contract.accepted_at, now, claimDays });
  const payment = payments[0] ?? null;
  const payout = transfers.find((t) => t.status !== 'failed') ?? transfers[transfers.length - 1] ?? null;
  const reviewRows = (reviews.data ?? []) as Array<Record<string, unknown>>;
  const mine = reviewRows.find((r) => r.reviewer_user_id === userId);
  const theirs = reviewRows.find((r) => r.reviewer_user_id !== userId);
  const resolvedOrAccepted = contract.status === 'completed' || contract.status === 'refunded';
  const patOk = hasUsablePat(sub, now);
  const customer = role === 'customer';

  return {
    contract: {
      id: contract.id,
      job_id: contract.job_id,
      job_title: (job.data as { title?: string } | null)?.title ?? 'Contract',
      status: contract.status,
      role,
      currency: contract.currency,
      accepted_at: contract.accepted_at,
      acceptance: contract.acceptance,
    },
    delivery: {
      unlocked: isUnlocked,
      submission_id: sub?.id ?? null,
      attempt: sub?.attempt ?? null,
      commit_sha: sub?.commit_sha ?? null,
      unlocked_at: sub?.delivery_unlocked_at ?? null,
      auto_accept_at: contract.status === 'delivered' ? sub?.auto_accept_at ?? null : null,
      auto_accept_paused: open.length > 0,
      pat_available: patOk,
    },
    qa: validated
      ? {
          verdict: validated.verdict,
          reason: validated.reason,
          report_md: validated.report_md,
          warnings: (Array.isArray(validated.findings) ? validated.findings : []).map(asWarning).filter((w): w is DeliveryWarning => !!w),
          reviewed_at: validated.created_at,
        }
      : null,
    history: subs.map((s) => {
      const q = qaBySub.get(s.id);
      return { attempt: s.attempt, commit_sha: s.commit_sha, submitted_at: s.created_at, status: s.status, verdict: q?.verdict ?? null, reason: q?.reason ?? null, reviewed_at: q?.created_at ?? null };
    }),
    contract_versions: ((versions.data ?? []) as ContractVersionRow[]).map((v) => ({
      version: v.version,
      price_cents: v.price_cents,
      fee_cents: v.fee_cents,
      customer_total_cents: v.customer_total_cents,
      deadline: v.deadline,
      steering_allowance: v.steering_allowance,
      created_at: v.created_at,
      current: v.id === contract.current_version_id,
    })),
    deliveries: ((deliveries.data ?? []) as DeliveryView['deliveries']).map((d) => ({ ...d })),
    payment: payment ? { status: payment.status, amount_cents: payments.reduce((s, p) => s + p.amount_cents, 0), refunded_cents: payments.reduce((s, p) => s + p.amount_refunded_cents, 0) } : null,
    payout: payout ? { status: payout.status, amount_cents: payout.amount_cents, reversed_cents: payout.amount_reversed_cents, created_at: payout.created_at } : null,
    dispute: latestDispute
      ? {
          id: latestDispute.id,
          source: latestDispute.source,
          phase: latestDispute.phase,
          status: latestDispute.status,
          category: latestDispute.category,
          reason: latestDispute.reason,
          created_at: latestDispute.created_at,
          resolution: latestDispute.resolution,
          refund_cents: latestDispute.refund_cents,
          resolution_note: latestDispute.resolution_note,
          resolved_at: latestDispute.resolved_at,
        }
      : null,
    actions: {
      can_download: customer && isUnlocked && patOk,
      can_push: customer && isUnlocked && patOk,
      can_accept: customer && isUnlocked && contract.status === 'delivered' && open.length === 0,
      can_dispute: customer && eligibility.ok && paymentSucceeded(payments),
      dispute_phase: eligibility.ok ? eligibility.phase : null,
      claim_window_ends_at: contract.accepted_at ? claimWindowEndsAt(contract.accepted_at, claimDays).toISOString() : null,
      can_review: resolvedOrAccepted && !mine && open.length === 0 && paymentSucceededEver(payments),
    },
    reviews: { mine: reviewView(mine), theirs: reviewView(theirs) },
  };
}

/** A refunded contract was still paid once (reviews stay possible after a full refund). */
function paymentSucceededEver(payments: PaymentRow[]): boolean {
  return payments.some((p) => p.status !== 'pending' && p.status !== 'failed');
}

async function requireDeliverable(userId: string, contractId: string) {
  const { contract, role } = await loadPartyContract(userId, contractId);
  if (role !== 'customer') throw new JobsError('forbidden', 403, 'Only the customer can fetch the delivery');
  const [sub, payments] = await Promise.all([deliveredSubmission(contract.id), listPayments(contract.id)]);
  if (!sub || !unlocked(contract, sub, payments)) {
    throw new JobsError('delivery_locked', 409, 'The delivery unlocks once QA validates the work and the payment has gone through');
  }
  if (!hasUsablePat(sub, new Date()) || !sub.pat_ciphertext || !sub.pat_iv || !sub.pat_tag) {
    throw new JobsError('pat_purged', 410, "The platform's access to the provider's repository has ended (accepted, or the token expired)");
  }
  let pat: string;
  try {
    pat = openSecret({ ciphertext: sub.pat_ciphertext, iv: sub.pat_iv, tag: sub.pat_tag }, { aad: `submission:${sub.id}` });
  } catch (err) {
    console.error('[delivery] PAT decrypt failed:', err instanceof Error ? err.name : 'error');
    throw new JobsError('config_error', 500, 'The delivery could not be prepared. Try again later.');
  }
  return { contract, sub, pat };
}

async function recordDelivery(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await jobsDb().from('deliveries').insert(row).select('id').single();
  if (error) {
    if (isUniqueViolation(error)) throw new JobsError('invalid_state', 409, 'A push for this contract is already running');
    throw dbError(error, 'record delivery');
  }
  return (data as { id: string }).id;
}

async function finishDelivery(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await jobsDb().from('deliveries').update({ ...patch, completed_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[delivery] could not record the result:', error.code);
}

export interface DownloadStream {
  body: ReadableStream<Uint8Array>;
  filename: string;
  contentLength: string | null;
}

/** Stream the QA'd commit as a .tar.gz. Audited per access. */
export async function openDownload(userId: string, contractId: string): Promise<DownloadStream> {
  const { contract, sub, pat } = await requireDeliverable(userId, contractId);
  const deliveryId = await recordDelivery({ contract_id: contract.id, submission_id: sub.id, user_id: userId, kind: 'download', status: 'pending', commit_sha: sub.commit_sha });
  await audit(userId, 'delivery_download', 'contract', contract.id, { submission_id: sub.id, commit_sha: sub.commit_sha, delivery_id: deliveryId });
  let res: Response;
  try {
    res = await fetchCommitTarball(pat, sub.repo_full_name, sub.commit_sha);
  } catch (err) {
    await finishDelivery(deliveryId, { status: 'failed', error: err instanceof JobsError ? err.code : 'error' });
    throw err;
  }
  const contentLength = res.headers.get('content-length');
  await finishDelivery(deliveryId, { status: 'succeeded', bytes: contentLength ? Number(contentLength) : null });
  const repoName = sub.repo_full_name.split('/')[1] ?? 'delivery';
  return { body: res.body as ReadableStream<Uint8Array>, filename: `${repoName}-${sub.commit_sha.slice(0, 12)}.tar.gz`, contentLength };
}

async function gunzipToBuffer(res: Response, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const gunzip = createGunzip();
  const source = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  await new Promise<void>((resolve, reject) => {
    source.on('error', reject);
    gunzip.on('error', reject);
    gunzip.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        source.destroy();
        gunzip.destroy();
        reject(new JobsError('archive_too_large', 413, `The delivery is larger than ${Math.round(maxBytes / 1024 / 1024)} MB; download it instead`));
        return;
      }
      chunks.push(c);
    });
    gunzip.on('end', () => resolve());
    source.pipe(gunzip);
  });
  return Buffer.concat(chunks);
}

export const pushSchema = z.object({
  repo: z.string().min(3).max(300),
  token: z.string().min(10).max(400),
});

export interface PushResult {
  delivery_id: string;
  status: 'succeeded';
  target_repo: string;
  pushed_commit_sha: string;
  source_commit_sha: string;
  file_count: number;
}

/**
 * Push the QA'd commit's files into the customer's empty private repo. The customer's PAT is
 * sealed for the duration of the push and purged right after (and in any case on acceptance).
 */
export async function pushDelivery(userId: string, contractId: string, input: { repo: string; token: string }): Promise<PushResult> {
  const { contract, sub, pat } = await requireDeliverable(userId, contractId);
  const target = await verifyPushTarget(input.token, input.repo);
  const deliveryId = await recordDelivery({
    contract_id: contract.id,
    submission_id: sub.id,
    user_id: userId,
    kind: 'push',
    status: 'pending',
    commit_sha: sub.commit_sha,
    target_repo: target.ref.fullName,
    pat_purged_at: new Date().toISOString(),
  });
  // Seal the customer's token against this delivery row while the push runs.
  const sealed = seal(input.token.trim(), { aad: `delivery:${deliveryId}` });
  await jobsDb().from('deliveries').update({ pat_ciphertext: sealed.ciphertext, pat_iv: sealed.iv, pat_tag: sealed.tag, pat_purged_at: null }).eq('id', deliveryId);
  await audit(userId, 'delivery_push', 'contract', contract.id, { submission_id: sub.id, commit_sha: sub.commit_sha, delivery_id: deliveryId, target_repo: target.ref.fullName });
  const purge = { pat_ciphertext: null, pat_iv: null, pat_tag: null, pat_purged_at: new Date().toISOString() };
  try {
    const tarball = await fetchCommitTarball(pat, sub.repo_full_name, sub.commit_sha);
    const tar = await gunzipToBuffer(tarball, DEFAULT_TAR_LIMITS.maxBytes);
    let files;
    try {
      files = stripTopDir(readTar(tar));
    } catch (err) {
      if (err instanceof TarError) throw new JobsError('archive_too_large', 413, err.message);
      throw err;
    }
    if (files.length === 0) throw new JobsError('push_failed', 422, 'The delivered commit has no files');
    const token = openSecret(sealed, { aad: `delivery:${deliveryId}` });
    const pushed = await pushTree(token, target, files, `Delivery from Tulzo: contract ${contract.id}\n\nSource commit ${sub.commit_sha} (validated by QA).`);
    await finishDelivery(deliveryId, { ...purge, status: 'succeeded', pushed_commit_sha: pushed, file_count: files.length, bytes: tar.length });
    return { delivery_id: deliveryId, status: 'succeeded', target_repo: target.ref.fullName, pushed_commit_sha: pushed, source_commit_sha: sub.commit_sha, file_count: files.length };
  } catch (err) {
    await finishDelivery(deliveryId, { ...purge, status: 'failed', error: err instanceof JobsError ? `${err.code}: ${err.message}`.slice(0, 500) : 'push failed' });
    throw err;
  }
}

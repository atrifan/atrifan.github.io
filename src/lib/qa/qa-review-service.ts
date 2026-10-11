/**
 * Admin QA: the queue, a submission's full context, credentials (decrypted PAT + review
 * key) and the verdict. Shared by the Admin QA MCP (app/api/admin/qa/mcp) and, later, the
 * hub /admin/qa UI. Callers must have checked admin rights (src/lib/qa/admin-auth.ts);
 * every function here takes the admin's user id for the audit trail.
 *
 * The platform never runs submitted code: the admin's own agent clones the repo at the
 * pinned SHA with the PAT, on the admin's machine.
 */
import { z } from 'zod';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, notFound } from '../jobs/errors';
import { loadContract, loadContractVersion, transitionContract } from '../jobs/contracts-service';
import { loadJob, loadSpecVersion, transitionJob } from '../jobs/jobs-service';
import { canTransitionJob } from '../jobs/job-state';
import { appBaseUrl } from '../jobs/stripe';
import type { ContractRow, ContractVersionRow } from '../jobs/types';
import { open as openSecret } from '../crypto/secret-box';
import { autoAcceptDaysFromEnv } from '../../config/qa.config';
import { decideQaVerdict, isOpenSubmissionStatus, QaDecisionError, type QaDecision } from './qa-decision';
import { creditsToUsd, settleReserve } from './qa-credits';
import { issueReviewKey, revokeReviewKeys } from './review-keys';
import {
  SUBMISSION_PUBLIC_COLUMNS,
  audit,
  describeParties,
  listContractReviews,
  loadQaRequestForSubmission,
  loadSubmission,
  notifySafe,
  num,
  submissionView,
  type QaRequestRow,
  type QaReviewRow,
  type SubmissionRow,
} from './qa-data';

const uuid = z.string().uuid();

function parse<S extends z.ZodTypeAny>(schema: S, args: unknown): z.infer<S> {
  const r = schema.safeParse(args ?? {});
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new JobsError('invalid_request', 400, 'Invalid arguments', issues);
  }
  return r.data;
}

function qaSummary(req: QaRequestRow | null) {
  if (!req) return { checks: ['basic'], reserved_credits: 0, platform_credits: 0, used_credits: 0, status: 'missing' };
  return {
    checks: req.checks,
    reserved_credits: num(req.reserved_credits),
    platform_credits: num(req.platform_credits),
    used_credits: num(req.used_credits),
    status: req.status,
  };
}

// ── queue ────────────────────────────────────────────────────────────────────

export const queueSchema = z.object({
  status: z.enum(['awaiting_qa', 'in_review', 'validated', 'requires_changes', 'rejected']).default('awaiting_qa'),
  limit: z.number().int().min(1).max(100).default(20),
});

export async function listQueue(args: unknown) {
  const { status, limit } = parse(queueSchema, args);
  const db = jobsDb();
  const { data, error } = await db
    .from('submissions')
    .select(SUBMISSION_PUBLIC_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw dbError(error, 'qa queue');
  const subs = (data ?? []) as unknown as SubmissionRow[];
  if (subs.length === 0) return { items: [] };

  const contractIds = Array.from(new Set(subs.map((s) => s.contract_id)));
  const [contracts, versions, requests] = await Promise.all([
    db.from('contracts').select('*').in('id', contractIds),
    db.from('contract_versions').select('*').in('id', subs.map((s) => s.contract_version_id).filter(Boolean) as string[]),
    db.from('qa_requests').select('*').eq('subject_type', 'contract_submission').in('subject_id', subs.map((s) => s.id)),
  ]);
  for (const r of [contracts, versions, requests]) if (r.error) throw dbError(r.error, 'qa queue join');
  const contractById = new Map(((contracts.data ?? []) as ContractRow[]).map((c) => [c.id, c]));
  const versionById = new Map(((versions.data ?? []) as ContractVersionRow[]).map((v) => [v.id, v]));
  const requestBySub = new Map(((requests.data ?? []) as QaRequestRow[]).map((q) => [q.subject_id, q]));
  const jobIds = Array.from(new Set(Array.from(contractById.values()).map((c) => c.job_id)));
  const jobs = await db.from('jobs').select('id, title').in('id', jobIds);
  if (jobs.error) throw dbError(jobs.error, 'qa queue jobs');
  const titleByJob = new Map(((jobs.data ?? []) as Array<{ id: string; title: string }>).map((j) => [j.id, j.title]));
  const parties = await describeParties(subs.flatMap((s) => [s.user_id, s.customer_user_id]));

  return {
    items: subs.map((s) => {
      const contract = contractById.get(s.contract_id);
      const version = s.contract_version_id ? versionById.get(s.contract_version_id) : undefined;
      return {
        submission_id: s.id,
        contract_id: s.contract_id,
        job_id: contract?.job_id ?? null,
        job_title: contract ? titleByJob.get(contract.job_id) ?? null : null,
        attempt: s.attempt,
        status: s.status,
        submitted_at: s.created_at,
        repo_full_name: s.repo_full_name,
        commit_sha: s.commit_sha,
        provider: parties.get(s.user_id),
        customer: parties.get(s.customer_user_id),
        price_cents: version?.price_cents ?? null,
        commission_cents: version?.fee_cents ?? null,
        commission_bps: version?.commission_bps ?? null,
        customer_total_cents: version?.customer_total_cents ?? null,
        currency: version?.currency ?? contract?.currency ?? null,
        checks: requestBySub.get(s.id)?.checks ?? ['basic'],
      };
    }),
  };
}

// ── detail ───────────────────────────────────────────────────────────────────

async function steeringHistory(contractId: string): Promise<unknown[]> {
  // steering_requests arrives with the job-room migration (Phase 3); tolerate its absence.
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function getSubmissionDetail(args: unknown) {
  const { submission_id } = parse(z.object({ submission_id: uuid }), args);
  const sub = await loadSubmission(submission_id);
  if (!sub) throw notFound('Submission not found');
  const contract = await loadContract(sub.contract_id);
  if (!contract) throw notFound('Contract not found');
  const version = sub.contract_version_id ? await loadContractVersion(sub.contract_version_id) : null;
  const spec = version ? await loadSpecVersion(version.spec_version_id) : null;
  const job = await loadJob(contract.job_id);
  const [req, parties, reviews, steering, versionsRes] = await Promise.all([
    loadQaRequestForSubmission(sub.id),
    describeParties([sub.user_id, sub.customer_user_id]),
    listContractReviews(contract.id),
    steeringHistory(contract.id),
    jobsDb().from('contract_versions').select('*').eq('contract_id', contract.id).order('version', { ascending: true }),
  ]);
  if (versionsRes.error) throw dbError(versionsRes.error, 'contract versions');
  const { data: attempts, error: attemptsError } = await jobsDb()
    .from('submissions')
    .select('id, attempt')
    .eq('contract_id', contract.id);
  if (attemptsError) throw dbError(attemptsError, 'attempts');
  const attemptOf = new Map(((attempts ?? []) as Array<{ id: string; attempt: number }>).map((a) => [a.id, a.attempt]));
  const versionView = (v: ContractVersionRow & { qa_checks?: string[] | null }) => ({
    id: v.id,
    version: v.version,
    price_cents: v.price_cents,
    commission_bps: v.commission_bps,
    fee_cents: v.fee_cents,
    customer_total_cents: v.customer_total_cents,
    currency: v.currency,
    deadline: v.deadline,
    steering_allowance: v.steering_allowance,
    qa_checks: v.qa_checks ?? null,
    signed_by_customer_at: v.signed_by_customer_at,
    signed_by_provider_at: v.signed_by_provider_at,
  });

  return {
    submission: { ...submissionView(sub), pat_purged: !!sub.pat_purged_at },
    job: job ? { id: job.id, title: job.title, description: job.description, category: job.category } : null,
    contract: { id: contract.id, status: contract.status, currency: contract.currency, created_at: contract.created_at },
    contract_version: version ? versionView(version) : null,
    contract_versions_history: ((versionsRes.data ?? []) as ContractVersionRow[]).map(versionView),
    spec: spec
      ? {
          id: spec.id,
          version: spec.version,
          requirements: spec.requirements,
          deliverables: spec.deliverables,
          acceptance_criteria: spec.acceptance_criteria,
          constraints: spec.constraints,
          permitted_tools: spec.permitted_tools,
          security: spec.security,
          deadline: spec.deadline,
          approved_at: spec.approved_at,
        }
      : null,
    parties: { provider: parties.get(sub.user_id), customer: parties.get(sub.customer_user_id) },
    qa: qaSummary(req),
    steering_history: steering,
    previous_reviews: reviews
      .filter((r) => r.submission_id !== sub.id)
      .map((r) => ({ id: r.id, submission_id: r.submission_id, attempt: attemptOf.get(r.submission_id) ?? null, verdict: r.verdict, reason: r.reason, created_at: r.created_at })),
  };
}

// ── credentials ──────────────────────────────────────────────────────────────

export async function getCredentials(adminUserId: string, args: unknown) {
  const { submission_id } = parse(z.object({ submission_id: uuid }), args);
  const sub = await loadSubmission(submission_id);
  if (!sub) throw notFound('Submission not found');
  if (sub.pat_purged_at || !sub.pat_ciphertext || !sub.pat_iv || !sub.pat_tag) {
    throw new JobsError('pat_purged', 410, 'The PAT for this submission has been purged');
  }
  if (!isOpenSubmissionStatus(sub.status)) {
    throw new JobsError('invalid_state', 409, `This submission was already marked ${sub.status}`);
  }
  let pat: string;
  try {
    pat = openSecret({ ciphertext: sub.pat_ciphertext, iv: sub.pat_iv, tag: sub.pat_tag }, { aad: `submission:${sub.id}` });
  } catch (err) {
    console.error('[qa] PAT decrypt failed:', err instanceof Error ? err.name : 'error');
    throw new JobsError('config_error', 500, 'The stored PAT could not be decrypted (check PAT_ENCRYPTION_KEY / _PREV)');
  }
  const req = await loadQaRequestForSubmission(sub.id);
  const cap = req ? num(req.platform_credits) + num(req.reserved_credits) : 0;
  const key = await issueReviewKey(adminUserId, sub.id, cap);
  if (sub.status === 'awaiting_qa') {
    const { error } = await jobsDb().from('submissions').update({ status: 'in_review' }).eq('id', sub.id).eq('status', 'awaiting_qa');
    if (error) throw dbError(error, 'start review');
  }
  await audit(adminUserId, 'qa_credentials_get', 'submission', sub.id, {
    contract_id: sub.contract_id,
    review_key_id: key.key_id,
    review_key_expires_at: key.expires_at,
    cap_credits: cap,
  });
  return {
    repo_full_name: sub.repo_full_name,
    repo_url: `https://github.com/${sub.repo_full_name}`,
    commit_sha: sub.commit_sha,
    pat_token: pat,
    pat_expires_at: sub.pat_expires_at,
    review_key: { ...key, used_credits: req ? num(req.used_credits) : 0, chat_url: `${appBaseUrl()}/api/chat` },
  };
}

// ── verdict ──────────────────────────────────────────────────────────────────

export const markSchema = z.object({
  submission_id: uuid,
  verdict: z.string(),
  reason: z.string().max(20_000).nullish(),
  report_md: z.string().max(200_000).nullish(),
  findings: z.array(z.unknown()).max(500).nullish(),
});

async function settleCredits(req: QaRequestRow | null) {
  if (!req) return { used: 0, platform_charged: 0, customer_charged: 0, customer_released: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await jobsDb().from('qa_requests').select('*').eq('id', req.id).single();
    if (error) throw dbError(error, 'reload qa request');
    const row = data as QaRequestRow;
    if (row.status !== 'reserved') {
      const used = num(row.used_credits);
      return { used, platform_charged: used - num(row.charged_credits), customer_charged: num(row.charged_credits), customer_released: num(row.released_credits) };
    }
    const s = settleReserve({ platformCredits: num(row.platform_credits), customerCredits: num(row.reserved_credits), usedCredits: num(row.used_credits) });
    const { data: ok, error: settleError } = await jobsDb().rpc('qa_settle_request', {
      p_request_id: row.id,
      p_expected_used: num(row.used_credits),
      p_charged: s.customerCharged,
      p_released: s.customerReleased,
      p_release_usd: creditsToUsd(s.customerReleased, num(row.credit_value_usd)),
    });
    if (settleError) throw dbError(settleError, 'settle qa request');
    if (ok === true) {
      return { used: s.usedCredits, platform_charged: s.platformCharged, customer_charged: s.customerCharged, customer_released: s.customerReleased };
    }
  }
  throw new JobsError('db_error', 500, 'Could not settle the QA credit reserve; try qa_mark again');
}

function decide(sub: SubmissionRow, contract: ContractRow, verdict: string, reason: string | null | undefined): QaDecision {
  try {
    return decideQaVerdict({
      verdict: verdict as QaDecision['verdict'],
      reason,
      submissionStatus: sub.status,
      contractStatus: contract.status,
      attempt: sub.attempt,
      now: new Date(),
      autoAcceptDays: autoAcceptDaysFromEnv(),
    });
  } catch (err) {
    if (err instanceof QaDecisionError) {
      if (err.code === 'reason_required') throw new JobsError('reason_required', 422, err.message);
      if (err.code === 'invalid_state') throw new JobsError('invalid_state', 409, err.message);
      throw new JobsError('invalid_request', 400, err.message);
    }
    throw err;
  }
}

export async function markSubmission(adminUserId: string, args: unknown) {
  const input = parse(markSchema, args);
  const sub = await loadSubmission(input.submission_id);
  if (!sub) throw notFound('Submission not found');
  const contract = await loadContract(sub.contract_id);
  if (!contract) throw notFound('Contract not found');
  const decision = decide(sub, contract, input.verdict, input.reason);
  const db = jobsDb();
  const now = new Date().toISOString();

  // Claim the submission: the guarded update makes a concurrent second verdict lose.
  const { data: claimed, error: claimError } = await db
    .from('submissions')
    .update({ status: decision.submissionTo, reviewed_at: now })
    .eq('id', sub.id)
    .in('status', ['awaiting_qa', 'in_review'])
    .select('id')
    .maybeSingle();
  if (claimError) throw dbError(claimError, 'claim submission');
  if (!claimed) throw new JobsError('invalid_state', 409, 'This submission was already marked');

  await revokeReviewKeys(sub.id);
  const credits = await settleCredits(await loadQaRequestForSubmission(sub.id));

  const earlier = (await listContractReviews(contract.id)).filter((r) => r.submission_id !== sub.id);
  const { data: reviewRow, error: reviewError } = await db
    .from('qa_reviews')
    .insert({
      submission_id: sub.id,
      contract_id: contract.id,
      reviewer_user_id: adminUserId,
      verdict: decision.verdict,
      reason: decision.reason,
      report_md: input.report_md ?? null,
      findings: input.findings ?? [],
      cost_credits: credits.used,
      supersedes_review_id: earlier[earlier.length - 1]?.id ?? null,
    })
    .select('*')
    .single();
  if (reviewError) throw dbError(reviewError, 'create review');
  const review = reviewRow as QaReviewRow;

  const moved = await transitionContract(contract.id, 'in_qa', decision.contractTo);
  if (!moved) console.error('[qa] contract moved during qa_mark:', contract.id);
  if (decision.jobTo) {
    const job = await loadJob(contract.job_id);
    if (job && canTransitionJob(job.status, decision.jobTo)) await transitionJob(job.id, job.status, decision.jobTo);
  }

  const jobTitle = (await loadJob(contract.job_id))?.title ?? 'Your job';
  for (const effect of decision.effects) {
    switch (effect.type) {
      case 'unlock_delivery': {
        const { error } = await db.from('submissions').update({ delivery_unlocked_at: now }).eq('id', sub.id);
        if (error) throw dbError(error, 'unlock delivery');
        await audit(adminUserId, 'delivery_unlocked', 'submission', sub.id, { contract_id: contract.id, commit_sha: sub.commit_sha });
        break;
      }
      case 'start_auto_accept': {
        const { error } = await db.from('submissions').update({ auto_accept_at: effect.autoAcceptAt }).eq('id', sub.id);
        if (error) throw dbError(error, 'start auto-accept');
        break;
      }
      case 'open_dispute':
        await audit(adminUserId, 'dispute_opened', 'contract', contract.id, {
          submission_id: sub.id,
          review_id: review.id,
          default_resolution: effect.defaultResolution,
          resolution_status: effect.resolutionStatus,
          reason: decision.reason,
        });
        break;
      case 'trust_mark':
        await audit(adminUserId, 'trust_qa_failure', 'principal', contract.provider_principal_id, {
          provider_user_id: contract.provider_user_id,
          contract_id: contract.id,
          submission_id: sub.id,
          review_id: review.id,
        });
        break;
      case 'notify': {
        const to = effect.to === 'customer' ? contract.customer_user_id : contract.provider_user_id;
        const base = { jobId: contract.job_id, jobTitle, contractId: contract.id };
        if (effect.notification === 'qa_verdict') {
          await notifySafe(to, 'qa_verdict', { ...base, verdict: effect.verdict, summary: decision.reason?.slice(0, 2000) }, `qa_verdict:${review.id}:${effect.to}`);
        } else {
          await notifySafe(to, 'delivery_ready', base, `delivery_ready:${review.id}`);
        }
        break;
      }
      default:
        break; // allow_resubmission, revoke_review_key, settle_credits: handled above / implicit
    }
  }
  await audit(adminUserId, 'qa_verdict', 'submission', sub.id, {
    contract_id: contract.id,
    review_id: review.id,
    verdict: decision.verdict,
    credits,
  });

  return {
    review: {
      id: review.id,
      submission_id: sub.id,
      verdict: review.verdict,
      reason: review.reason,
      report_md: review.report_md,
      findings: review.findings,
      cost_credits: num(review.cost_credits),
      supersedes_review_id: review.supersedes_review_id,
      created_at: review.created_at,
    },
    submission_status: decision.submissionTo,
    contract_status: moved?.status ?? decision.contractTo,
    credits,
  };
}


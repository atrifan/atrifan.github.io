/**
 * Provider side of QA: send_project, qa_status, qa_report_get.
 *
 * send_project: provider-only, contract active|rework. Verifies the PAT (fine-grained,
 * private repo, single-repo scope, ≤30-day expiry), pins the commit, seals the PAT,
 * reserves the customer's QA credits for the checks they chose (basic is on the platform),
 * creates attempt N+1, moves the contract to in_qa and notifies the customer and admins.
 * The PAT is never returned, logged or put in notifications/audit metadata.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, isUniqueViolation, notFound } from '../jobs/errors';
import { loadContract, loadContractVersion, transitionContract } from '../jobs/contracts-service';
import { loadJob } from '../jobs/jobs-service';
import type { ContractRow } from '../jobs/types';
import { verifyPatForRepo } from '../jobs/github-pat';
import { seal } from '../crypto/secret-box';
import { qaCostsFromEnv, creditValueUsdFromEnv } from '../../config/qa.config';
import { computeReserve, creditsToUsd, normalizeChecks } from './qa-credits';
import {
  SUBMISSION_PUBLIC_COLUMNS,
  adminUserIdsForNotify,
  audit,
  describeParties,
  listContractReviews,
  notifySafe,
  submissionView,
  type QaReviewRow,
  type SubmissionRow,
  type SubmissionView,
} from './qa-data';

const uuid = z.string().uuid();

function parse<S extends z.ZodTypeAny>(schema: S, args: unknown): z.infer<S> {
  const r = schema.safeParse(args ?? {});
  if (!r.success) {
    // only paths and messages: never echo the submitted values (the PAT)
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new JobsError('invalid_request', 400, 'Invalid arguments', issues);
  }
  return r.data;
}

export const sendProjectSchema = z.object({
  contract_id: uuid,
  git_repo: z.string().min(1).max(300),
  pat_token: z.string().min(1).max(300),
  commit_sha: z.string().max(64).nullish(),
});

export interface SendProjectResult {
  submission: SubmissionView;
  contract_status: 'in_qa';
  qa: { checks: string[]; reserved_credits: number; platform_credits: number };
}

const SUBMITTABLE: ReadonlySet<string> = new Set(['active', 'rework']);

async function nextAttempt(contractId: string): Promise<number> {
  const { data, error } = await jobsDb()
    .from('submissions')
    .select('attempt')
    .eq('contract_id', contractId)
    .order('attempt', { ascending: false })
    .limit(1);
  if (error) throw dbError(error, 'next attempt');
  return ((data ?? [])[0]?.attempt ?? 0) + 1;
}

export async function sendProject(
  userId: string,
  args: unknown,
  opts: { agentIdentityId?: string | null } = {},
): Promise<SendProjectResult> {
  const input = parse(sendProjectSchema, args);
  const contract = await loadContract(input.contract_id);
  if (!contract || (contract.provider_user_id !== userId && contract.customer_user_id !== userId)) {
    throw notFound('Contract not found');
  }
  if (contract.provider_user_id !== userId) {
    throw new JobsError('forbidden', 403, 'Only the provider of this contract can submit work');
  }
  if (!SUBMITTABLE.has(contract.status)) {
    throw new JobsError('invalid_state', 409, `The contract is ${contract.status}; work can be submitted while it is active or in rework`);
  }
  const version = contract.current_version_id ? await loadContractVersion(contract.current_version_id) : null;
  if (!version) throw new JobsError('invalid_state', 409, 'The contract has no signed version');

  const pat = await verifyPatForRepo({ token: input.pat_token, gitRepo: input.git_repo, commitSha: input.commit_sha });

  const checks = normalizeChecks((version as { qa_checks?: string[] | null }).qa_checks ?? null);
  const reserve = computeReserve(checks, qaCostsFromEnv());
  const creditValue = creditValueUsdFromEnv();
  const reserveUsd = creditsToUsd(reserve.customerCredits, creditValue);

  const fromStatus = contract.status;
  const claimed = await transitionContract(contract.id, fromStatus, 'in_qa');
  if (!claimed) throw new JobsError('invalid_state', 409, 'The contract changed meanwhile; check qa_status and try again');

  const db = jobsDb();
  const submissionId = randomUUID();
  let reserved = false;
  let submissionCreated = false;
  const rollback = async () => {
    if (submissionCreated) {
      await db.from('qa_requests').delete().eq('subject_type', 'contract_submission').eq('subject_id', submissionId);
      await db.from('submissions').delete().eq('id', submissionId);
    }
    if (reserved) await db.rpc('increment_user_balance', { target_user_id: contract.customer_user_id, amount_to_add: reserveUsd });
    await db.from('contracts').update({ status: fromStatus }).eq('id', contract.id).eq('status', 'in_qa');
  };

  try {
    if (reserveUsd > 0) {
      const { data, error } = await db.rpc('deduct_user_balance', { target_user_id: contract.customer_user_id, amount: reserveUsd });
      if (error) throw dbError(error, 'reserve QA credits');
      if (Number(data) < 0) {
        throw new JobsError(
          'insufficient_balance',
          402,
          `The customer's credit balance does not cover the QA checks chosen for this contract (${reserve.customerCredits} credits). Ask the customer to top up, then submit again.`,
        );
      }
      reserved = true;
    }

    const attempt = await nextAttempt(contract.id);
    const sealed = seal(input.pat_token.trim(), { aad: `submission:${submissionId}` });
    const { data: row, error } = await db
      .from('submissions')
      .insert({
        id: submissionId,
        contract_id: contract.id,
        contract_version_id: version.id,
        user_id: userId,
        customer_user_id: contract.customer_user_id,
        agent_identity_id: opts.agentIdentityId ?? null,
        attempt,
        repo_full_name: pat.repoFullName,
        commit_sha: pat.commitSha,
        pat_ciphertext: sealed.ciphertext,
        pat_iv: sealed.iv,
        pat_tag: sealed.tag,
        pat_expires_at: pat.expiresAt ? pat.expiresAt.toISOString() : null,
        status: 'awaiting_qa',
      })
      .select(SUBMISSION_PUBLIC_COLUMNS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) throw new JobsError('invalid_state', 409, 'A submission for this contract is already waiting for QA');
      throw dbError(error, 'create submission');
    }
    submissionCreated = true;

    const { error: reqError } = await db.from('qa_requests').insert({
      subject_type: 'contract_submission',
      subject_id: submissionId,
      requester_user_id: contract.customer_user_id,
      checks,
      platform_credits: reserve.platformCredits,
      reserved_credits: reserve.customerCredits,
      credit_value_usd: creditValue,
      status: 'reserved',
    });
    if (reqError) throw dbError(reqError, 'create qa request');

    const submission = row as unknown as SubmissionRow;
    await audit(userId, 'submission_created', 'submission', submissionId, {
      contract_id: contract.id,
      attempt,
      repo_full_name: pat.repoFullName,
      commit_sha: pat.commitSha,
      checks,
      reserved_credits: reserve.customerCredits,
    });
    await notifySubmission(contract, submission);

    return {
      submission: submissionView(submission),
      contract_status: 'in_qa',
      qa: { checks, reserved_credits: reserve.customerCredits, platform_credits: reserve.platformCredits },
    };
  } catch (err) {
    try {
      await rollback();
    } catch (rollbackErr) {
      console.error('[qa] send_project rollback failed:', rollbackErr instanceof Error ? rollbackErr.message : 'error');
    }
    throw err;
  }
}

async function notifySubmission(contract: ContractRow, submission: SubmissionRow): Promise<void> {
  const job = await loadJob(contract.job_id);
  const parties = await describeParties([contract.provider_user_id]);
  const providerName = parties.get(contract.provider_user_id)?.name || 'Your provider';
  const payload = { jobId: contract.job_id, jobTitle: job?.title ?? 'Your job', contractId: contract.id, providerName };
  await notifySafe(contract.customer_user_id, 'submission_received', payload, `submission_received:${submission.id}:customer`);
  for (const adminId of await adminUserIdsForNotify()) {
    if (adminId === contract.customer_user_id || adminId === contract.provider_user_id) continue;
    await notifySafe(adminId, 'submission_received', payload, `submission_received:${submission.id}:admin:${adminId}`);
  }
}

/** The contract, if `userId` is one of its parties; otherwise not_found. */
async function partyContract(userId: string, contractId: string): Promise<ContractRow> {
  const contract = await loadContract(contractId);
  if (!contract || (contract.customer_user_id !== userId && contract.provider_user_id !== userId)) {
    throw notFound('Contract not found');
  }
  return contract;
}

function reviewSummary(r: QaReviewRow, attempt: number | null) {
  return { id: r.id, submission_id: r.submission_id, attempt, verdict: r.verdict, reason: r.reason, created_at: r.created_at };
}

export async function qaStatus(userId: string, args: unknown) {
  const { contract_id } = parse(z.object({ contract_id: uuid }), args);
  const contract = await partyContract(userId, contract_id);
  const { data, error } = await jobsDb()
    .from('submissions')
    .select(SUBMISSION_PUBLIC_COLUMNS)
    .eq('contract_id', contract.id)
    .order('attempt', { ascending: true });
  if (error) throw dbError(error, 'list submissions');
  const submissions = ((data ?? []) as unknown as SubmissionRow[]).map(submissionView);
  const reviews = await listContractReviews(contract.id);
  const last = reviews[reviews.length - 1];
  const attemptOf = (id: string) => submissions.find((s) => s.id === id)?.attempt ?? null;
  return {
    contract_id: contract.id,
    contract_status: contract.status,
    submissions,
    latest_submission: submissions[submissions.length - 1] ?? null,
    latest_review: last ? reviewSummary(last, attemptOf(last.submission_id)) : null,
    can_resubmit: SUBMITTABLE.has(contract.status),
  };
}

export async function qaReportGet(userId: string, args: unknown) {
  const { review_id } = parse(z.object({ review_id: uuid }), args);
  const { data, error } = await jobsDb().from('qa_reviews').select('*').eq('id', review_id).maybeSingle();
  if (error) throw dbError(error, 'load review');
  const review = data as QaReviewRow | null;
  if (!review) throw notFound('Review not found');
  const contract = await loadContract(review.contract_id);
  if (!contract || (contract.customer_user_id !== userId && contract.provider_user_id !== userId)) {
    throw notFound('Review not found');
  }
  const { data: sub, error: subError } = await jobsDb()
    .from('submissions')
    .select('attempt, commit_sha, repo_full_name')
    .eq('id', review.submission_id)
    .maybeSingle();
  if (subError) throw dbError(subError, 'load reviewed submission');
  return {
    review: {
      id: review.id,
      submission_id: review.submission_id,
      contract_id: review.contract_id,
      attempt: sub?.attempt ?? null,
      commit_sha: sub?.commit_sha ?? null,
      verdict: review.verdict,
      reason: review.reason,
      report_md: review.report_md,
      findings: review.findings,
      cost_credits: Number(review.cost_credits),
      created_at: review.created_at,
    },
  };
}

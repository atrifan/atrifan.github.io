/**
 * Shared reads/writes for the QA pipeline: rows, party info (name, email, plan),
 * audit events and best-effort notifications. Server-only, service-role client.
 */
import { jobsDb } from '../jobs/db';
import { dbError } from '../jobs/errors';
import { PLAN_KEYS, normalizePlan, type PlanKey } from '../plans';
import { getAdminEmails } from '../admin';
import { enqueue, type NotificationType, type PayloadInput } from '../notify';
import { adminUserIdsFromEnv } from './admin-check';
import type { SubmissionStatus, QaVerdict } from './qa-decision';

export interface SubmissionRow {
  id: string;
  contract_id: string;
  contract_version_id: string | null;
  user_id: string;
  customer_user_id: string;
  agent_identity_id: string | null;
  attempt: number;
  repo_full_name: string;
  commit_sha: string;
  pat_ciphertext: string | null;
  pat_iv: string | null;
  pat_tag: string | null;
  pat_expires_at: string | null;
  pat_purged_at: string | null;
  /** GitHub reported the provider as an admin of the repo (their role, not the PAT's scope). */
  owner_admin: boolean;
  status: SubmissionStatus;
  reviewed_at: string | null;
  delivery_unlocked_at: string | null;
  auto_accept_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QaRequestRow {
  id: string;
  subject_type: 'contract_submission' | 'standalone';
  subject_id: string;
  requester_user_id: string;
  checks: string[];
  platform_credits: number | string;
  reserved_credits: number | string;
  used_credits: number | string;
  charged_credits: number | string | null;
  released_credits: number | string | null;
  credit_value_usd: number | string;
  status: 'reserved' | 'settled' | 'cancelled';
}

export interface QaReviewRow {
  id: string;
  submission_id: string;
  contract_id: string;
  reviewer_user_id: string;
  verdict: QaVerdict;
  reason: string | null;
  report_md: string | null;
  findings: unknown;
  cost_credits: number | string;
  supersedes_review_id: string | null;
  created_at: string;
}

/** Columns safe to return (never the sealed PAT). */
export const SUBMISSION_PUBLIC_COLUMNS =
  'id, contract_id, contract_version_id, user_id, customer_user_id, agent_identity_id, attempt, repo_full_name, commit_sha, pat_expires_at, pat_purged_at, owner_admin, status, reviewed_at, delivery_unlocked_at, auto_accept_at, created_at, updated_at';

export const num = (v: number | string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

export interface SubmissionView {
  id: string;
  contract_id: string;
  attempt: number;
  status: SubmissionStatus;
  repo_full_name: string;
  commit_sha: string;
  pat_expires_at: string | null;
  owner_admin: boolean;
  submitted_at: string;
}

export function submissionView(row: Pick<SubmissionRow, 'id' | 'contract_id' | 'attempt' | 'status' | 'repo_full_name' | 'commit_sha' | 'pat_expires_at' | 'created_at'> & { owner_admin?: boolean }): SubmissionView {
  return {
    id: row.id,
    contract_id: row.contract_id,
    attempt: row.attempt,
    status: row.status,
    repo_full_name: row.repo_full_name,
    commit_sha: row.commit_sha,
    pat_expires_at: row.pat_expires_at,
    owner_admin: row.owner_admin === true,
    submitted_at: row.created_at,
  };
}

export async function loadSubmission(id: string): Promise<SubmissionRow | null> {
  const { data, error } = await jobsDb().from('submissions').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'load submission');
  return data as SubmissionRow | null;
}

export async function loadQaRequestForSubmission(submissionId: string): Promise<QaRequestRow | null> {
  const { data, error } = await jobsDb()
    .from('qa_requests')
    .select('*')
    .eq('subject_type', 'contract_submission')
    .eq('subject_id', submissionId)
    .maybeSingle();
  if (error) throw dbError(error, 'load qa request');
  return data as QaRequestRow | null;
}

export async function listContractReviews(contractId: string): Promise<QaReviewRow[]> {
  const { data, error } = await jobsDb()
    .from('qa_reviews')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list reviews');
  return (data ?? []) as QaReviewRow[];
}

export interface PartyInfo {
  user_id: string;
  name: string | null;
  email: string | null;
  plan: PlanKey;
}

/** Name and email from user_contacts (synced from Clerk), plan from the user's device keys. */
export async function describeParties(userIds: string[]): Promise<Map<string, PartyInfo>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, PartyInfo>();
  for (const id of ids) out.set(id, { user_id: id, name: null, email: null, plan: 'free' });
  if (ids.length === 0) return out;
  const db = jobsDb();
  const [contacts, keys] = await Promise.all([
    db.from('user_contacts').select('user_id, name, email').in('user_id', ids),
    db.from('api_keys').select('user_id, plan').in('user_id', ids).eq('is_active', true).eq('purpose', 'device'),
  ]);
  if (contacts.error) console.error('[qa] contacts lookup failed:', contacts.error.code);
  if (keys.error) console.error('[qa] plan lookup failed:', keys.error.code);
  for (const c of (contacts.data ?? []) as Array<{ user_id: string; name: string | null; email: string | null }>) {
    const p = out.get(c.user_id);
    if (p) Object.assign(p, { name: c.name, email: c.email });
  }
  for (const k of (keys.data ?? []) as Array<{ user_id: string; plan: string }>) {
    const p = out.get(k.user_id);
    const plan = normalizePlan(k.plan);
    if (p && PLAN_KEYS.indexOf(plan) > PLAN_KEYS.indexOf(p.plan)) p.plan = plan;
  }
  return out;
}

export async function audit(
  actorUserId: string | null,
  action: string,
  subjectType: string,
  subjectId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await jobsDb()
    .from('audit_events')
    .insert({ actor_user_id: actorUserId, action, subject_type: subjectType, subject_id: subjectId, metadata });
  if (error) throw dbError(error, `audit ${action}`);
}

/** Admin user ids to notify: ADMIN_USER_IDS plus contacts whose email is on the admin list. */
export async function adminUserIdsForNotify(): Promise<string[]> {
  const ids = new Set(adminUserIdsFromEnv());
  const emails = getAdminEmails();
  if (emails.length > 0) {
    const { data, error } = await jobsDb().from('user_contacts').select('user_id, email').in('email', emails);
    if (error) console.error('[qa] admin contacts lookup failed:', error.code);
    for (const row of (data ?? []) as Array<{ user_id: string }>) ids.add(row.user_id);
  }
  return Array.from(ids);
}

/** Best-effort email: a failed notification never breaks the QA flow. */
export async function notifySafe<T extends NotificationType>(
  userId: string,
  type: T,
  payload: PayloadInput<T>,
  dedupeKey: string,
): Promise<void> {
  try {
    await enqueue(userId, type, payload, dedupeKey);
  } catch (err) {
    console.error('[qa] notify failed:', type, err instanceof Error ? err.message : String(err));
  }
}

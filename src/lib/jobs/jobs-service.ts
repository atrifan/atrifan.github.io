/**
 * Jobs and their spec versions. Shared by the HTTP routes and (later) the Jobs MCP tools.
 */
import { jobsDb } from './db';
import { budgetFilterClauses } from './budget-filter';
import { JobsError, dbError, isUniqueViolation, notFound } from './errors';
import { ensureUserPrincipal } from './principals';
import { assertJobTransition, type JobStatus } from './job-state';
import type { CreateJobInput, UpdateJobInput, JobListQuery, JobSpec } from './schemas';
import type { JobRow, JobSpecVersionRow } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export type JobWithBidCount = JobRow & { bid_count: number };

export async function createJob(userId: string, input: CreateJobInput): Promise<JobRow> {
  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('jobs')
    .insert({
      user_id: userId,
      customer_principal_id: principal.id,
      title: input.title,
      description: input.description,
      category: input.category ?? null,
      budget_min_cents: input.budget_min_cents ?? null,
      budget_max_cents: input.budget_max_cents ?? null,
      deadline: input.deadline ?? null,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw dbError(error, 'create job');
  return data as JobRow;
}

/** Load a job by id with no visibility rules (internal use). */
export async function loadJob(jobId: string): Promise<JobRow | null> {
  if (!isUuid(jobId)) return null;
  const { data, error } = await jobsDb().from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw dbError(error, 'load job');
  return data as JobRow | null;
}

/** A job the caller owns, or 404. */
export async function getOwnedJob(userId: string, jobId: string): Promise<JobRow> {
  if (!isUuid(jobId)) throw notFound('Job not found');
  const { data, error } = await jobsDb()
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbError(error, 'get owned job');
  if (!data) throw notFound('Job not found');
  return data as JobRow;
}

export async function loadSpecVersion(specId: string): Promise<JobSpecVersionRow | null> {
  const { data, error } = await jobsDb().from('job_spec_versions').select('*').eq('id', specId).maybeSingle();
  if (error) throw dbError(error, 'load spec');
  return data as JobSpecVersionRow | null;
}

async function latestSpecVersion(jobId: string, userId: string): Promise<JobSpecVersionRow | null> {
  const { data, error } = await jobsDb()
    .from('job_spec_versions')
    .select('*')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error, 'latest spec');
  return data as JobSpecVersionRow | null;
}

/**
 * A job as the caller may see it: owners see everything; others see non-draft jobs.
 * `spec` is the approved current version, or for the owner the latest draft.
 */
export async function getJobForViewer(
  userId: string,
  jobId: string,
): Promise<{ job: JobRow; spec: JobSpecVersionRow | null }> {
  const job = await loadJob(jobId);
  const isOwner = job?.user_id === userId;
  if (!job || (!isOwner && job.status === 'draft')) throw notFound('Job not found');
  let spec: JobSpecVersionRow | null = null;
  if (job.current_spec_version_id) spec = await loadSpecVersion(job.current_spec_version_id);
  if (!spec && isOwner) spec = await latestSpecVersion(job.id, userId);
  return { job, spec };
}

export async function listJobs(
  userId: string,
  query: JobListQuery,
): Promise<{ jobs: JobWithBidCount[]; total: number; limit: number; offset: number }> {
  let q = jobsDb().from('jobs').select('*, bids!bids_job_id_fkey(count)', { count: 'exact' });
  if (query.mine) {
    q = q.eq('user_id', userId);
    if (query.status) q = q.eq('status', query.status);
  } else {
    const status: JobStatus = query.status ?? 'open';
    if (status === 'draft') return { jobs: [], total: 0, limit: query.limit, offset: query.offset };
    q = q.eq('status', status);
  }
  if (query.category) q = q.eq('category', query.category);
  if (query.q) q = q.or(`title.ilike.*${query.q}*,description.ilike.*${query.q}*`);
  // price filter = overlap between [min_price, max_price] and the job's budget range (open ends unbounded)
  for (const clause of budgetFilterClauses({ min: query.min_price_cents, max: query.max_price_cents })) q = q.or(clause);
  if (query.deadline_before) q = q.lte('deadline', query.deadline_before);
  if (query.deadline_after) q = q.gte('deadline', query.deadline_after);
  q = q.order('created_at', { ascending: false }).range(query.offset, query.offset + query.limit - 1);

  const { data, error, count } = await q;
  if (error) throw dbError(error, 'list jobs');
  const jobs = ((data ?? []) as Array<JobRow & { bids?: Array<{ count: number }> }>).map(({ bids, ...job }) => ({
    ...job,
    bid_count: bids?.[0]?.count ?? 0,
  }));
  return { jobs, total: count ?? jobs.length, limit: query.limit, offset: query.offset };
}

/** Move a job between statuses, guarded on the current status. Returns null if it moved meanwhile. */
export async function transitionJob(jobId: string, from: JobStatus, to: JobStatus, extra: Partial<JobRow> = {}): Promise<JobRow | null> {
  assertJobTransition(from, to);
  const { data, error } = await jobsDb()
    .from('jobs')
    .update({ ...extra, status: to })
    .eq('id', jobId)
    .eq('status', from)
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'transition job');
  return data as JobRow | null;
}

export async function updateJob(userId: string, jobId: string, input: UpdateJobInput): Promise<JobRow> {
  const job = await getOwnedJob(userId, jobId);
  if (job.status !== 'draft') throw new JobsError('invalid_state', 409, 'Only draft jobs can be edited');
  const min = input.budget_min_cents !== undefined ? input.budget_min_cents : job.budget_min_cents;
  const max = input.budget_max_cents !== undefined ? input.budget_max_cents : job.budget_max_cents;
  if (min != null && max != null && min > max) {
    throw new JobsError('invalid_request', 400, 'budget_min_cents must be <= budget_max_cents');
  }
  const { data, error } = await jobsDb()
    .from('jobs')
    .update(input)
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'update job');
  if (!data) throw new JobsError('invalid_state', 409, 'Only draft jobs can be edited');
  return data as JobRow;
}

/** Cancel a draft or open job. Later states go through contracts. */
export async function cancelJob(userId: string, jobId: string): Promise<JobRow> {
  const job = await getOwnedJob(userId, jobId);
  if (job.status !== 'draft' && job.status !== 'open') {
    throw new JobsError('invalid_state', 409, `A job that is ${job.status} cannot be cancelled here`);
  }
  const moved = await transitionJob(job.id, job.status, 'cancelled');
  if (!moved) throw new JobsError('invalid_state', 409, 'The job changed; reload and try again');
  return moved;
}

/** Save a new draft spec version (v1, v2, ...) on a draft job. */
export async function saveSpecDraft(
  userId: string,
  jobId: string,
  spec: JobSpec,
  meta: { source: 'ai' | 'manual'; model?: string | null },
): Promise<JobSpecVersionRow> {
  const job = await getOwnedJob(userId, jobId);
  if (job.status !== 'draft') throw new JobsError('invalid_state', 409, 'Specs can only be drafted while the job is a draft');
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await latestSpecVersion(job.id, userId);
    const { data, error } = await jobsDb()
      .from('job_spec_versions')
      .insert({
        job_id: job.id,
        user_id: userId,
        version: (latest?.version ?? 0) + 1,
        status: 'draft',
        source: meta.source,
        model: meta.model ?? null,
        ...spec,
      })
      .select('*')
      .single();
    if (!error) return data as JobSpecVersionRow;
    if (!isUniqueViolation(error)) throw dbError(error, 'save spec draft');
  }
  throw new JobsError('invalid_state', 409, 'Concurrent spec edits; try again');
}

/** Approve a draft spec version (default: latest draft) and open the job for bids. */
export async function approveSpec(
  userId: string,
  jobId: string,
  specVersionId?: string,
): Promise<{ job: JobRow; spec: JobSpecVersionRow }> {
  const job = await getOwnedJob(userId, jobId);
  if (job.status !== 'draft') throw new JobsError('invalid_state', 409, 'Only a draft job can have its spec approved');

  let q = jobsDb().from('job_spec_versions').select('*').eq('job_id', job.id).eq('user_id', userId).eq('status', 'draft');
  q = specVersionId ? q.eq('id', specVersionId) : q.order('version', { ascending: false }).limit(1);
  const { data: draft, error } = await q.maybeSingle();
  if (error) throw dbError(error, 'find draft spec');
  if (!draft) throw new JobsError('no_draft_spec', 409, 'There is no draft spec to approve');

  const db = jobsDb();
  const { error: supersedeError } = await db
    .from('job_spec_versions')
    .update({ status: 'superseded' })
    .eq('job_id', job.id)
    .eq('status', 'approved');
  if (supersedeError) throw dbError(supersedeError, 'supersede spec');

  const { data: approved, error: approveError } = await db
    .from('job_spec_versions')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: userId })
    .eq('id', draft.id)
    .eq('status', 'draft')
    .select('*')
    .single();
  if (approveError) throw dbError(approveError, 'approve spec');

  const opened = await transitionJob(job.id, 'draft', 'open', { current_spec_version_id: approved.id });
  if (!opened) throw new JobsError('invalid_state', 409, 'The job changed; reload and try again');
  return { job: opened, spec: approved as JobSpecVersionRow };
}

/**
 * Errors the gigs services throw. Routes (and later the Jobs MCP tools) map them to
 * `{ error: code, message }` with `status`.
 */
export type JobsErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'invalid_state'
  | 'no_draft_spec'
  | 'connect_required'
  | 'own_job'
  | 'job_not_open'
  | 'spec_not_approved'
  | 'invalid_price'
  | 'price_out_of_bounds'
  | 'bid_exists'
  | 'bid_not_active'
  | 'already_accepted'
  | 'insufficient_balance'
  | 'unsupported_country'
  | 'ai_error'
  | 'stripe_error'
  | 'stripe_not_configured'
  | 'db_error'
  // submissions and QA (Phase 4)
  | 'classic_pat'
  | 'invalid_pat'
  | 'invalid_repo'
  | 'public_repo'
  | 'repo_not_accessible'
  | 'pat_admin'
  | 'pat_too_broad'
  | 'pat_expired'
  | 'pat_expiry_too_long'
  | 'invalid_commit_sha'
  | 'commit_not_found'
  | 'scope_unverifiable'
  | 'github_error'
  | 'pat_purged'
  | 'reason_required'
  | 'config_error';

export class JobsError extends Error {
  readonly code: JobsErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: JobsErrorCode, status: number, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'JobsError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Not found') => new JobsError('not_found', 404, what);

/** Postgres unique_violation, as surfaced by PostgREST. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

export function dbError(error: { message?: string; code?: string }, context: string): JobsError {
  console.error(`[jobs] ${context}:`, error?.code, error?.message);
  return new JobsError('db_error', 500, `Database error (${context})`);
}

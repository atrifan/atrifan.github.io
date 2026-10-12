/**
 * Price filters on the jobs listing: a job matches when its budget range overlaps the filter.
 * An open end is unbounded: "From €500" (no maximum) runs to infinity, "Up to €400" (no
 * minimum) starts at zero. A job with no budget at all has no price, so a price filter leaves
 * it out. Pure; `budgetFilterClauses` is the same rule as PostgREST `or` filters.
 */

export interface PriceFilter {
  min?: number | null;
  max?: number | null;
}

export interface JobBudget {
  budget_min_cents: number | null;
  budget_max_cents: number | null;
}

export function budgetOverlaps(job: JobBudget, filter: PriceFilter): boolean {
  const { min, max } = filter;
  if (min == null && max == null) return true;
  const lo = job.budget_min_cents;
  const hi = job.budget_max_cents;
  if (lo == null && hi == null) return false;
  if (min != null && hi != null && hi < min) return false;
  if (max != null && lo != null && lo > max) return false;
  return true;
}

/** One `.or()` argument per bound; supabase-js ANDs separate `.or()` calls. */
export function budgetFilterClauses(filter: PriceFilter): string[] {
  const clauses: string[] = [];
  if (filter.min != null) {
    clauses.push(`budget_max_cents.gte.${filter.min},and(budget_max_cents.is.null,budget_min_cents.not.is.null)`);
  }
  if (filter.max != null) {
    clauses.push(`budget_min_cents.lte.${filter.max},and(budget_min_cents.is.null,budget_max_cents.not.is.null)`);
  }
  return clauses;
}

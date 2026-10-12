/**
 * Display formatting for the gigs pages: euros, budgets, dates and status labels. Pure,
 * so the server and client render the same text (no locale or timezone dependence).
 */
import type { ContractStatus, JobStatus } from '../job-state';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `30000` → "€300", `1250` → "€12.50", `125000` → "€1,250". */
export function formatEuros(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}€${group(euros)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

export function formatBudget(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = min != null;
  const hasMax = max != null;
  if (hasMin && hasMax) return min === max ? formatEuros(min) : `${formatEuros(min)} – ${formatEuros(max)}`;
  if (hasMin) return `From ${formatEuros(min)}`;
  if (hasMax) return `Up to ${formatEuros(max)}`;
  return 'Budget open';
}

/**
 * Parse a euro amount typed by a person: "300", "12.5", "12,50". Empty → null; anything
 * else (negative, more than two decimals, symbols) → NaN.
 */
export function parseEurosToCents(input: string | null | undefined): number | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** "1 Mar 2027" in UTC, or '' for an invalid date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function deadlineLabel(iso: string | null | undefined): string {
  return iso ? `Due ${formatDate(iso)}` : 'No deadline';
}

const DAY_MS = 86_400_000;

/** "Posted today" (under 24h), "Posted yesterday", "Posted 3 days ago", "Posted 2 weeks ago", "Posted on 5 Jan 2025". */
export function postedAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (days < 1) return 'Posted today';
  if (days < 2) return 'Posted yesterday';
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Posted ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return `Posted on ${formatDate(iso)}`;
}

export const GIG_CATEGORIES = [
  { value: 'development', label: 'Development' },
  { value: 'automation', label: 'Automation' },
  { value: 'data', label: 'Data & AI' },
  { value: 'design', label: 'Design' },
  { value: 'devops', label: 'DevOps' },
  { value: 'security', label: 'Security' },
  { value: 'writing', label: 'Writing' },
  { value: 'other', label: 'Other' },
] as const;

function sentenceCase(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'General';
  return GIG_CATEGORIES.find((c) => c.value === category)?.label ?? sentenceCase(category);
}

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  awarded: 'Awarded',
  in_progress: 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export function jobStatusLabel(status: JobStatus): string {
  return JOB_STATUS_LABELS[status];
}

const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  pending_payment: 'Awaiting payment',
  active: 'In progress',
  submitted: 'Submitted',
  in_qa: 'In QA',
  rework: 'Changes requested',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function contractStatusLabel(status: ContractStatus): string {
  return CONTRACT_STATUS_LABELS[status];
}

/** Title-case fallback for labels the UI does not know yet (e.g. new statuses). */
export function humanize(value: string): string {
  return sentenceCase(value);
}

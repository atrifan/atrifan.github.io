/**
 * QA check choices for a job (src/config/qa.config.ts). Pure. Basic QA is always included
 * (paid from the commission); the deeper checks reserve up to their cap from the
 * customer's credits. The wizard stores the choice per job in sessionStorage and the
 * accept step sends it as `qa_checks`.
 */
import { QA_CHECKS, type QaCheck } from '../../../config/qa.config';

const LABELS: Record<QaCheck, string> = {
  basic: 'Basic QA',
  deep_requirements: 'Deep requirements review',
  code_review: 'Code review',
  security: 'Security review',
  journey: 'User journey test',
  adversarial: 'Adversarial testing',
};

export interface QaOption {
  id: QaCheck;
  label: string;
  credits: number;
  included: boolean;
}

export function qaOptions(costs: Readonly<Record<QaCheck, number>>): QaOption[] {
  return QA_CHECKS.map((id) => ({ id, label: LABELS[id], credits: costs[id], included: id === 'basic' }));
}

export function qaCheckLabel(id: QaCheck): string {
  return LABELS[id];
}

/** Basic first, then the chosen checks in canonical order; unknown values dropped. */
export function normalizeQaChecks(input: unknown): QaCheck[] {
  const chosen = new Set(Array.isArray(input) ? input.filter((v): v is string => typeof v === 'string') : []);
  return QA_CHECKS.filter((id) => id === 'basic' || chosen.has(id));
}

/** Credits reserved from the customer for these checks (basic is not reserved). */
export function qaReserveCredits(checks: readonly QaCheck[], costs: Readonly<Record<QaCheck, number>>): number {
  return normalizeQaChecks(checks).reduce((sum, id) => (id === 'basic' ? sum : sum + costs[id]), 0);
}

export function qaStorageKey(jobId: string): string {
  return `tulzo.gigs.qa.${jobId}`;
}

export function parseStoredQaChecks(raw: string | null): QaCheck[] {
  if (!raw) return normalizeQaChecks([]);
  try {
    return normalizeQaChecks(JSON.parse(raw));
  } catch {
    return normalizeQaChecks([]);
  }
}

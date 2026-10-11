/**
 * Input schemas for the gigs API and the AI spec builder. Pure (zod only), so the
 * HTTP routes and the future Jobs MCP tools validate the same way.
 */
import { z } from 'zod';
import { JOB_STATUSES, type JobStatus } from './job-state.ts';

const cents = z.number().int().min(0);
const isoDateTime = z.string().datetime({ offset: true });
const shortText = z.string().trim().min(1).max(2000);

function budgetOrdered(v: { budget_min_cents?: number | null; budget_max_cents?: number | null }): boolean {
  return v.budget_min_cents == null || v.budget_max_cents == null || v.budget_min_cents <= v.budget_max_cents;
}
const budgetOrderMessage = { message: 'budget_min_cents must be <= budget_max_cents', path: ['budget_min_cents'] };

export const SpecSecuritySchema = z.object({
  data_sensitivity: z.enum(['public', 'internal', 'confidential']),
  secrets_allowed: z.boolean(),
  notes: z.string().max(2000),
});

export const JobSpecSchema = z
  .object({
    requirements: z.array(shortText).min(1).max(50),
    deliverables: z.array(shortText).min(1).max(50),
    acceptance_criteria: z.array(shortText).min(1).max(50),
    constraints: z.array(shortText).max(50),
    deadline: isoDateTime.nullable(),
    budget_min_cents: cents.nullable(),
    budget_max_cents: cents.nullable(),
    permitted_tools: z.array(z.string().trim().min(1).max(200)).max(50),
    security: SpecSecuritySchema,
  })
  .refine(budgetOrdered, budgetOrderMessage);
export type JobSpec = z.infer<typeof JobSpecSchema>;

/**
 * What the model is asked to produce. Looser than JobSpecSchema (no formats or
 * cross-field rules, which structured-output modes handle poorly); normalizeAiSpec
 * turns it into a valid JobSpec.
 */
export const AiJobSpecSchema = z.object({
  requirements: z.array(z.string()).describe('Concrete, testable functional requirements'),
  deliverables: z.array(z.string()).describe('What the provider hands over'),
  acceptance_criteria: z.array(z.string()).describe('Checks QA will use to accept the work'),
  constraints: z.array(z.string()).describe('Technical or business constraints'),
  deadline: z.string().nullable().describe('ISO 8601 date or datetime, or null if none was given'),
  budget_min_cents: z.number().nullable().describe('Minimum budget in euro cents, or null'),
  budget_max_cents: z.number().nullable().describe('Maximum budget in euro cents, or null'),
  permitted_tools: z.array(z.string()).describe('Tools, languages, services the provider may use'),
  security: z.object({
    data_sensitivity: z.enum(['public', 'internal', 'confidential']),
    secrets_allowed: z.boolean().describe('Whether the work needs real secrets or credentials'),
    notes: z.string().describe('Security notes, or an empty string'),
  }),
});
export type AiJobSpec = z.infer<typeof AiJobSpecSchema>;

function cleanList(items: string[], max: number): string[] {
  return items.map((s) => s.trim()).filter((s) => s.length > 0).map((s) => s.slice(0, 2000)).slice(0, max);
}

function cleanCents(v: number | null): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

export function normalizeAiSpec(ai: AiJobSpec): JobSpec {
  let deadline: string | null = null;
  if (ai.deadline) {
    const t = Date.parse(ai.deadline);
    if (Number.isFinite(t)) deadline = new Date(t).toISOString();
  }
  const min = cleanCents(ai.budget_min_cents);
  let max = cleanCents(ai.budget_max_cents);
  if (min != null && max != null && min > max) max = null;
  return {
    requirements: cleanList(ai.requirements, 50),
    deliverables: cleanList(ai.deliverables, 50),
    acceptance_criteria: cleanList(ai.acceptance_criteria, 50),
    constraints: cleanList(ai.constraints, 50),
    deadline,
    budget_min_cents: min,
    budget_max_cents: max,
    permitted_tools: cleanList(ai.permitted_tools, 50).map((s) => s.slice(0, 200)),
    security: {
      data_sensitivity: ai.security.data_sensitivity,
      secrets_allowed: ai.security.secrets_allowed,
      notes: ai.security.notes.slice(0, 2000),
    },
  };
}

const jobFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(10000),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  budget_min_cents: cents.nullable().optional(),
  budget_max_cents: cents.nullable().optional(),
  deadline: isoDateTime.nullable().optional(),
};

export const CreateJobSchema = z.object(jobFields).strict().refine(budgetOrdered, budgetOrderMessage);
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const UpdateJobSchema = z
  .object({
    title: jobFields.title.optional(),
    description: jobFields.description.optional(),
    category: jobFields.category,
    budget_min_cents: jobFields.budget_min_cents,
    budget_max_cents: jobFields.budget_max_cents,
    deadline: jobFields.deadline,
  })
  .strict()
  .refine(budgetOrdered, budgetOrderMessage);
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;

export const DraftSpecRequestSchema = z
  .object({
    spec: JobSpecSchema.optional(),
    instructions: z.string().trim().max(4000).optional(),
  })
  .strict();

export const ApproveSpecRequestSchema = z.object({ spec_version_id: z.string().uuid().optional() }).strict();

export const CreateBidSchema = z
  .object({
    price_cents: z.number().int().positive(),
    eta_days: z.number().int().min(1).max(365),
    plan: z.string().trim().max(10000).optional(),
    deliverables: z.array(shortText).max(50).default([]),
    included_steering_credits: z.number().int().min(0).max(100).default(0),
    assumptions: z.array(shortText).max(50).default([]),
  })
  .strict();
export type CreateBidInput = z.infer<typeof CreateBidSchema>;

export const CreateOfferSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(5000),
    price_cents: z.number().int().positive(),
    delivery_days: z.number().int().min(1).max(365),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;

export const ConnectOnboardSchema = z.object({ country: z.string().trim().length(2) }).strict();

// ---------- list queries ----------

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/** Remove characters that carry meaning in a PostgREST `or=(...)` filter. */
function cleanSearch(q: string): string {
  return q.replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

const boolParam = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const intParam = z.coerce.number().int().min(0);

const baseListShape = {
  q: z.string().optional().transform((v) => (v ? cleanSearch(v) || undefined : undefined)),
  category: z.string().trim().min(1).max(100).optional(),
  min_price_cents: intParam.optional(),
  max_price_cents: intParam.optional(),
  mine: boolParam,
  limit: z.coerce.number().int().min(1).optional().transform((v) => Math.min(v ?? DEFAULT_LIMIT, MAX_LIMIT)),
  offset: intParam.optional().transform((v) => v ?? 0),
};

const JobListQuerySchema = z.object({
  ...baseListShape,
  status: z.enum(JOB_STATUSES as unknown as [JobStatus, ...JobStatus[]]).optional(),
  deadline_before: isoDateTime.optional(),
  deadline_after: isoDateTime.optional(),
});
export type JobListQuery = z.infer<typeof JobListQuerySchema>;

const OfferListQuerySchema = z.object(baseListShape);
export type OfferListQuery = z.infer<typeof OfferListQuerySchema>;

type Parsed<T> = { ok: true; value: T } | { ok: false; issues: z.ZodIssue[] };

function toObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    if (v !== '') out[k] = v;
  });
  return out;
}

export function parseJobListQuery(params: URLSearchParams): Parsed<JobListQuery> {
  const r = JobListQuerySchema.safeParse(toObject(params));
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: r.error.issues };
}

export function parseOfferListQuery(params: URLSearchParams): Parsed<OfferListQuery> {
  const r = OfferListQuerySchema.safeParse(toObject(params));
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: r.error.issues };
}

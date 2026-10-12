/**
 * Steering: the customer asks for something while the work is running.
 *
 * An LLM proposes what kind of request it is (clarification, revision, scope change);
 * the pure gate `decideSteering` has the final say:
 *   - any change to the spec, the price or the deadline is a scope change;
 *   - a revision uses one included steering credit from the contract version, and becomes
 *     a scope change when none is left;
 *   - a clarification is free.
 * A scope change pauses the work until the customer approves the provider's re-estimate
 * (a new contract version) and pays any top-up.
 *
 * Everything here except `classifySteering` is pure. Persistence is in steering-service.ts.
 * The classifier is billed to the requester (metered cost × CREDIT_MARKUP); without AI, or
 * without the balance to pay for it, `ruleClassifySteering` decides instead.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { createGateway } from '../ai-gateway.ts';

export const STEERING_KINDS = ['clarification', 'revision', 'scope_change'] as const;
export type SteeringKind = (typeof STEERING_KINDS)[number];

export const STEERING_STATUSES = [
  'open',
  'awaiting_estimate',
  'awaiting_provider',
  'awaiting_approval',
  'answered',
  'resolved',
  'approved',
  'rejected',
  'declined',
  'cancelled',
] as const;
export type SteeringStatus = (typeof STEERING_STATUSES)[number];

export type TopupStatus = 'none' | 'pending' | 'paid' | 'expired';

export interface SteeringDecisionInput {
  /** What the classifier (or, without AI, the customer) says the request is. */
  classified: SteeringKind;
  /** Requested changes to spec items; blank entries are ignored. */
  specDiff: readonly string[];
  /** Proposed price minus the current price, in cents. */
  priceDelta: number;
  /** Proposed deadline minus the current deadline, in ms. */
  deadlineDelta: number;
  /** Steering credits left on the current contract version. */
  remainingSteeringCredits: number;
}

export interface SteeringDecision {
  kind: SteeringKind;
  consumesCredit: boolean;
  requiresApproval: boolean;
}

const SCOPE_CHANGE: SteeringDecision = { kind: 'scope_change', consumesCredit: false, requiresApproval: true };

export function decideSteering(input: SteeringDecisionInput): SteeringDecision {
  const { classified, specDiff, priceDelta, deadlineDelta, remainingSteeringCredits } = input;
  const changesSpec = specDiff.some((s) => s.trim().length > 0);
  // `!== 0` is also true for NaN, so a garbled delta fails safe into a scope change.
  if (changesSpec || priceDelta !== 0 || deadlineDelta !== 0) return { ...SCOPE_CHANGE };
  if (classified === 'clarification') return { kind: 'clarification', consumesCredit: false, requiresApproval: false };
  if (classified === 'revision' && remainingSteeringCredits >= 1) {
    return { kind: 'revision', consumesCredit: true, requiresApproval: false };
  }
  return { ...SCOPE_CHANGE };
}

/**
 * Status of a new request. A scope change waits for the provider's estimate, or, when
 * the customer already proposed terms (price or deadline), for the provider to accept them.
 */
export function initialSteeringStatus(decision: SteeringDecision, customerProposedTerms: boolean): SteeringStatus {
  if (decision.kind !== 'scope_change') return 'open';
  return customerProposedTerms ? 'awaiting_provider' : 'awaiting_estimate';
}

const PAUSING_STATUSES: ReadonlySet<SteeringStatus> = new Set(['awaiting_estimate', 'awaiting_provider', 'awaiting_approval']);

const UNPAID_TOPUP: ReadonlySet<TopupStatus> = new Set(['pending', 'expired']);

/**
 * Does this request pause the work? Unresolved scope changes, and approved ones whose top-up
 * is unpaid (pending, or its Checkout expired and the customer has to get a new link).
 */
export function pausesWork(req: { kind: SteeringKind; status: SteeringStatus; topup_status: TopupStatus }): boolean {
  if (req.kind !== 'scope_change') return false;
  if (PAUSING_STATUSES.has(req.status)) return true;
  return req.status === 'approved' && UNPAID_TOPUP.has(req.topup_status);
}

/** Can the customer get a fresh top-up Checkout? An approved scope change with an unpaid top-up. */
export function topupRegenerable(req: { kind: SteeringKind; status: SteeringStatus; topup_status: TopupStatus }): boolean {
  return req.kind === 'scope_change' && req.status === 'approved' && UNPAID_TOPUP.has(req.topup_status);
}

/** What the customer still owes after a scope change: the increase in their total. */
export function topupAmountCents(oldCustomerTotalCents: number, newCustomerTotalCents: number): number {
  return newCustomerTotalCents > oldCustomerTotalCents ? newCustomerTotalCents - oldCustomerTotalCents : 0;
}

export function remainingCredits(allowance: number, used: number): number {
  return Math.max(0, allowance - used);
}

// ---------- steering credits (claimed atomically, see steering-service.ts) ----------

/**
 * The contract's used-credit count after claiming one more, or null when none is left.
 * steering-service writes it with a compare-and-swap on `contracts.steering_credits_used`,
 * so two concurrent revisions can't both take the last credit.
 */
export function nextCreditCount(used: number, allowance: number): number | null {
  return used < allowance ? used + 1 : null;
}

/** A revision that lost the race for the last credit becomes a scope change. */
export function settleCreditClaim(decision: SteeringDecision, claimed: boolean): SteeringDecision {
  if (!decision.consumesCredit || claimed) return decision;
  return { ...SCOPE_CHANGE };
}

// ---------- money after a scope change ----------

/** What the customer gets back when a scope change lowers their total. */
export function refundAmountCents(oldCustomerTotalCents: number, newCustomerTotalCents: number): number {
  return oldCustomerTotalCents > newCustomerTotalCents ? oldCustomerTotalCents - newCustomerTotalCents : 0;
}

export interface RefundablePayment {
  id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  amount_refunded_cents: number;
  status: string;
  created_at: string;
}

export interface RefundPlan {
  parts: Array<{ paymentId: string; paymentIntentId: string; amountCents: number }>;
  /** What no payment can cover; recorded as a credit to apply at payout. */
  leftoverCents: number;
}

const REFUNDABLE = new Set(['succeeded', 'partially_refunded']);

/** Split a refund over the contract's payments, newest first (top-ups before the original charge). */
export function planRefund(payments: readonly RefundablePayment[], amountCents: number): RefundPlan {
  const parts: RefundPlan['parts'] = [];
  let left = Math.max(0, amountCents);
  const usable = payments
    .filter((p) => REFUNDABLE.has(p.status) && p.stripe_payment_intent_id && p.amount_cents > p.amount_refunded_cents)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  for (const p of usable) {
    if (left === 0) break;
    const take = Math.min(left, p.amount_cents - p.amount_refunded_cents);
    parts.push({ paymentId: p.id, paymentIntentId: p.stripe_payment_intent_id!, amountCents: take });
    left -= take;
  }
  return { parts, leftoverCents: left };
}

// ---------- spec changes from a scope change ----------

/** The spec lists after a scope change: new items appended (trimmed, deduplicated); null if nothing changes. */
export function applySpecChanges(
  base: { requirements: readonly string[]; deliverables: readonly string[] },
  changes: { specChanges: readonly string[]; deliverableChanges: readonly string[] },
): { requirements: string[]; deliverables: string[] } | null {
  const add = (list: readonly string[], extra: readonly string[]) => {
    const out = [...list];
    for (const raw of extra) {
      const item = raw.trim();
      if (item && !out.includes(item)) out.push(item);
    }
    return out;
  };
  const requirements = add(base.requirements, changes.specChanges);
  const deliverables = add(base.deliverables, changes.deliverableChanges);
  if (requirements.length === base.requirements.length && deliverables.length === base.deliverables.length) return null;
  return { requirements, deliverables };
}

// ---------- notifications ----------

const PROGRESS_EMAIL_WINDOW_MS = 60 * 60 * 1000;

/** At most one progress email per contract per hour: the last one must be older than this. */
export function progressEmailCutoff(now: Date): string {
  return new Date(now.getTime() - PROGRESS_EMAIL_WINDOW_MS).toISOString();
}

// ---------- classifier ----------

export const DEFAULT_STEERING_MODEL = 'openai/gpt-4o-mini';

export const SteeringClassificationSchema = z.object({
  kind: z.enum(STEERING_KINDS),
  confidence: z.number().describe('0 to 1'),
  rationale: z.string().describe('One short sentence, shown to both parties'),
});
export type SteeringClassification = z.infer<typeof SteeringClassificationSchema>;

const CLASSIFIER_SYSTEM = [
  'You classify a customer message sent to a provider while a paid software job is in progress.',
  'clarification: a question or extra context that does not change what must be delivered.',
  'revision: asks to redo or adjust something already within the agreed requirements and deliverables.',
  'scope_change: adds, removes or changes requirements, deliverables, acceptance criteria, price or deadline.',
  'When unsure between revision and scope_change, choose scope_change.',
].join(' ');

export interface ClassifierContext {
  message: string;
  requirements: readonly string[];
  deliverables: readonly string[];
  priceCents: number;
  deadline: string | null;
}

export function buildClassifierPrompt(c: ClassifierContext): string {
  return [
    'Agreed requirements:',
    ...c.requirements.map((r) => `- ${r}`),
    'Agreed deliverables:',
    ...c.deliverables.map((d) => `- ${d}`),
    `Agreed price (cents): ${c.priceCents}`,
    `Agreed deadline: ${c.deadline ?? 'none'}`,
    '',
    'Customer message:',
    c.message,
  ].join('\n');
}

const SCOPE_WORDS =
  /\b(add(s|ed|ing)?|also|extra|additional|another|more|new feature|remov\w*|drop|instead|integrat\w*|extend\w*|support for)\b/;
const REVISION_WORDS = /\b(fix(es|ed|ing)?|redo|re-do|adjust\w*|tweak\w*|rename\w*|correct\w*|wrong|broken|polish)\b/;

/**
 * Rule-based classification, used when the AI is unavailable or the customer's balance can't
 * pay for it. The customer's own choice wins; otherwise scope words beat rework words, and
 * anything else is a clarification. `decideSteering` still has the final say.
 */
export function ruleClassifySteering(message: string, requestedKind?: SteeringKind): SteeringKind {
  if (requestedKind) return requestedKind;
  const m = message.toLowerCase();
  if (SCOPE_WORDS.test(m)) return 'scope_change';
  if (REVISION_WORDS.test(m)) return 'revision';
  return 'clarification';
}

/** What a classifier call costs the requester in USD: metered cost × CREDIT_MARKUP, rounded up to 1e-6. */
export function classifierChargeUsd(costUsd: number, markup: number): number {
  if (!(costUsd > 0)) return 0;
  return Math.ceil(Number((costUsd * markup * 1e6).toFixed(3))) / 1e6;
}

export interface ClassifierUsage {
  inputTokens: number;
  outputTokens: number;
  generationId: string | null;
}

export type ClassifierOutput =
  | ({ source: 'ai'; model: string; usage: ClassifierUsage } & SteeringClassification)
  | { source: 'rules'; kind: SteeringKind; error: string };

/**
 * Ask the model what kind of request this is. Never throws: without a gateway key or on a
 * model error it falls back to `ruleClassifySteering`. Billing is the caller's job
 * (steering-service.ts charges `usage` to the requester).
 */
export async function classifySteering(
  c: ClassifierContext,
  opts: { userId: string; requestedKind?: SteeringKind; model?: string },
): Promise<ClassifierOutput> {
  const rules = (error: string): ClassifierOutput => ({ source: 'rules', kind: ruleClassifySteering(c.message, opts.requestedKind), error });
  if (!process.env.AI_GATEWAY_API_KEY) return rules('ai_not_configured');
  const model = opts.model ?? steeringModel();
  try {
    const result = await generateObject({
      model: createGateway()(model),
      schema: SteeringClassificationSchema,
      system: CLASSIFIER_SYSTEM,
      prompt: buildClassifierPrompt(c),
      headers: { 'x-vercel-ai-user-id': opts.userId, 'x-vercel-ai-tag': 'gigs-steering-classifier' },
    });
    const parsed = SteeringClassificationSchema.safeParse(result.object);
    if (!parsed.success) return rules('invalid_ai_output');
    const headers = (result.response?.headers ?? {}) as Record<string, string | undefined>;
    const usage: ClassifierUsage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      generationId: headers['x-vercel-ai-generation-id'] ?? null,
    };
    return { source: 'ai', model, usage, ...parsed.data };
  } catch (err) {
    console.error('[jobs] steering classification failed:', err instanceof Error ? err.message : err);
    return rules('ai_error');
  }
}

export function steeringModel(): string {
  return process.env.JOBS_STEERING_MODEL || DEFAULT_STEERING_MODEL;
}

/** Output-token budget assumed when estimating a classifier call before making it. */
export const CLASSIFIER_OUTPUT_TOKENS_ESTIMATE = 200;

/**
 * Form validation for the gigs pages (post-a-job wizard, offer form, bid form). Pure.
 * Turns what people type (strings) into the API payloads (integer euro cents, ISO dates,
 * string lists), with one friendly message per invalid field. Mirrors the server schemas
 * in src/lib/jobs/schemas.ts so most mistakes are caught before a request.
 */
import { formatEuros, parseEurosToCents } from './format';
import type { JobSpec } from '../schemas';

export type Result<T, F extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<F, string>> };

const MAX_ITEMS = 50;
const MAX_ITEM = 2000;
const MAX_TOOL = 200;

// ---------- parsing helpers ----------

/** One item per line; blank lines and leading list bullets ("- ", "* ", "• ") dropped. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•]\s+/, ''))
    .filter((l) => l.length > 0);
}

/** Comma-separated labels, trimmed, without blanks or case-insensitive duplicates. */
export function splitLabels(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** "5" → 5; empty → null; anything else → NaN. */
export function parseWholeNumber(input: string | null | undefined): number | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** "2027-03-01" → end of that day in UTC; '' → null; not a real date → undefined. */
export function dateInputToIso(value: string): string | null | undefined {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59));
  // Date.UTC rolls 2027-02-30 over to March and maps years < 100 to 19xx: a round trip catches both.
  if (date.toISOString().slice(0, 10) !== value) return undefined;
  return date.toISOString();
}

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const AMOUNT_ERROR = 'Enter an amount in euros, like 250';

function budget<F extends string>(
  minRaw: string,
  maxRaw: string,
  errors: Partial<Record<F | 'minBudget' | 'maxBudget', string>>,
): { min: number | null; max: number | null } {
  const min = parseEurosToCents(minRaw);
  const max = parseEurosToCents(maxRaw);
  if (Number.isNaN(min)) errors.minBudget = AMOUNT_ERROR;
  if (Number.isNaN(max)) errors.maxBudget = AMOUNT_ERROR;
  if (min != null && max != null && min > max) errors.minBudget = "The minimum budget can't be above the maximum";
  return { min, max };
}

function deadline<F extends string>(value: string, now: Date, errors: Partial<Record<F | 'deadline', string>>): string | null {
  const iso = dateInputToIso(value);
  if (iso === undefined) {
    errors.deadline = 'Pick a valid date';
    return null;
  }
  if (iso && new Date(iso).getTime() <= now.getTime()) errors.deadline = 'Pick a deadline in the future';
  return iso;
}

function lines(value: string, maxLength: number, tooLong: string): { items: string[]; error?: string } {
  const items = splitLines(value);
  if (items.length > MAX_ITEMS) return { items, error: 'Keep it to 50 lines or fewer' };
  if (items.some((i) => i.length > maxLength)) return { items, error: tooLong };
  return { items };
}

function done<T, F extends string>(value: T, errors: Partial<Record<F, string>>): Result<T, F> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---------- post a job: describe ----------

export interface DescribeForm {
  title: string;
  description: string;
  category: string;
  minBudget: string;
  maxBudget: string;
  deadline: string;
}
type DescribeField = keyof DescribeForm;

export interface CreateJobPayload {
  title: string;
  description: string;
  category: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  deadline: string | null;
}

export function validateDescribe(form: DescribeForm, now: Date = new Date()): Result<CreateJobPayload, DescribeField> {
  const errors: Partial<Record<DescribeField, string>> = {};
  const title = form.title.trim();
  const description = form.description.trim();
  if (title.length < 3) errors.title = 'Give your job a title of at least 3 characters';
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters';
  if (description.length < 10) errors.description = 'Describe the outcome in at least 10 characters';
  else if (description.length > 10000) errors.description = 'Keep the description under 10,000 characters';
  const { min, max } = budget(form.minBudget, form.maxBudget, errors);
  const due = deadline(form.deadline, now, errors);
  return done(
    { title, description, category: form.category.trim() || null, budget_min_cents: min, budget_max_cents: max, deadline: due },
    errors,
  );
}

// ---------- post a job: edit the spec ----------

export type DataSensitivity = 'public' | 'internal' | 'confidential';
const SENSITIVITIES: readonly DataSensitivity[] = ['public', 'internal', 'confidential'];

export interface SpecForm {
  requirements: string;
  deliverables: string;
  acceptanceCriteria: string;
  constraints: string;
  permittedTools: string;
  deadline: string;
  minBudget: string;
  maxBudget: string;
  dataSensitivity: DataSensitivity;
  secretsAllowed: boolean;
  securityNotes: string;
}
type SpecField = keyof SpecForm;

export function validateSpec(form: SpecForm, now: Date = new Date()): Result<JobSpec, SpecField> {
  const errors: Partial<Record<SpecField, string>> = {};
  const lineError = 'Keep each line under 2,000 characters';
  const list = (field: SpecField, value: string, emptyError?: string, max = MAX_ITEM, tooLong = lineError) => {
    const r = lines(value, max, tooLong);
    if (r.error) errors[field] = r.error;
    else if (emptyError && r.items.length === 0) errors[field] = emptyError;
    return r.items;
  };
  const requirements = list('requirements', form.requirements, 'Add at least one requirement');
  const deliverables = list('deliverables', form.deliverables, 'Add at least one deliverable');
  const acceptance = list('acceptanceCriteria', form.acceptanceCriteria, 'Add at least one acceptance criterion');
  const constraints = list('constraints', form.constraints);
  const tools = list('permittedTools', form.permittedTools, undefined, MAX_TOOL, 'Keep each tool under 200 characters');
  const { min, max } = budget(form.minBudget, form.maxBudget, errors);
  const due = deadline(form.deadline, now, errors);
  if (!SENSITIVITIES.includes(form.dataSensitivity)) errors.dataSensitivity = 'Choose how sensitive the data is';
  const notes = form.securityNotes.trim();
  if (notes.length > 2000) errors.securityNotes = 'Keep the security notes under 2,000 characters';
  return done(
    {
      requirements,
      deliverables,
      acceptance_criteria: acceptance,
      constraints,
      permitted_tools: tools,
      deadline: due,
      budget_min_cents: min,
      budget_max_cents: max,
      security: { data_sensitivity: form.dataSensitivity, secrets_allowed: form.secretsAllowed, notes },
    },
    errors,
  );
}

export function specToForm(spec: JobSpec): SpecForm {
  return {
    requirements: spec.requirements.join('\n'),
    deliverables: spec.deliverables.join('\n'),
    acceptanceCriteria: spec.acceptance_criteria.join('\n'),
    constraints: spec.constraints.join('\n'),
    permittedTools: spec.permitted_tools.join('\n'),
    deadline: isoToDateInput(spec.deadline),
    minBudget: centsToInput(spec.budget_min_cents),
    maxBudget: centsToInput(spec.budget_max_cents),
    dataSensitivity: spec.security.data_sensitivity,
    secretsAllowed: spec.security.secrets_allowed,
    securityNotes: spec.security.notes,
  };
}

/** A blank spec form, starting from the job's own budget and deadline. */
export function emptySpecForm(
  job: { budget_min_cents: number | null; budget_max_cents: number | null; deadline: string | null } | null,
): SpecForm {
  return {
    requirements: '',
    deliverables: '',
    acceptanceCriteria: '',
    constraints: '',
    permittedTools: '',
    deadline: isoToDateInput(job?.deadline),
    minBudget: centsToInput(job?.budget_min_cents),
    maxBudget: centsToInput(job?.budget_max_cents),
    dataSensitivity: 'internal',
    secretsAllowed: false,
    securityNotes: '',
  };
}

// ---------- offers ----------

export interface OfferForm {
  title: string;
  description: string;
  labels: string;
  category: string;
  price: string;
  deliveryDays: string;
}
type OfferField = keyof OfferForm;

export interface CreateOfferPayload {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  price_cents: number;
  delivery_days: number;
}

const MIN_OFFER_CENTS = 500;

export function validateOffer(form: OfferForm): Result<CreateOfferPayload, OfferField> {
  const errors: Partial<Record<OfferField, string>> = {};
  const title = form.title.trim();
  const description = form.description.trim();
  if (title.length < 3) errors.title = 'Give your offer a title of at least 3 characters';
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters';
  if (description.length < 10) errors.description = 'Describe the service in at least 10 characters';
  else if (description.length > 5000) errors.description = 'Keep the description under 5,000 characters';
  const tags = splitLabels(form.labels);
  if (tags.length > 20 || tags.some((t) => t.length > 50)) errors.labels = 'Use at most 20 labels of up to 50 characters';
  const price = parseEurosToCents(form.price);
  if (price == null || Number.isNaN(price) || price < MIN_OFFER_CENTS) errors.price = `Set a price of at least ${formatEuros(MIN_OFFER_CENTS)}`;
  const days = parseWholeNumber(form.deliveryDays);
  if (days == null || Number.isNaN(days) || days < 1 || days > 365) errors.deliveryDays = 'Delivery time must be between 1 and 365 days';
  const category = form.category.trim();
  return done(
    { title, description, tags, ...(category ? { category } : {}), price_cents: price ?? 0, delivery_days: days ?? 0 },
    errors,
  );
}

// ---------- bids ----------

export interface BidForm {
  price: string;
  etaDays: string;
  plan: string;
  deliverables: string;
  steering: string;
  assumptions: string;
}
type BidField = keyof BidForm;

export interface CreateBidPayload {
  price_cents: number;
  eta_days: number;
  plan?: string;
  deliverables: string[];
  included_steering_credits: number;
  assumptions: string[];
}

export function validateBid(form: BidForm, bounds: { minCents: number; maxCents: number }): Result<CreateBidPayload, BidField> {
  const errors: Partial<Record<BidField, string>> = {};
  const price = parseEurosToCents(form.price);
  if (price == null || Number.isNaN(price) || price < bounds.minCents) errors.price = `Bids start at ${formatEuros(bounds.minCents)}`;
  else if (price > bounds.maxCents) errors.price = `Bids can be at most ${formatEuros(bounds.maxCents)}`;
  const eta = parseWholeNumber(form.etaDays);
  if (eta == null || Number.isNaN(eta) || eta < 1 || eta > 365) errors.etaDays = 'Delivery estimate must be between 1 and 365 days';
  const steering = parseWholeNumber(form.steering) ?? 0;
  if (Number.isNaN(steering) || steering > 100) errors.steering = 'Steering interactions must be between 0 and 100';
  const plan = form.plan.trim();
  if (plan.length > 10000) errors.plan = 'Keep the plan under 10,000 characters';
  const deliverables = lines(form.deliverables, MAX_ITEM, 'Keep each line under 2,000 characters');
  if (deliverables.error) errors.deliverables = deliverables.error;
  const assumptions = lines(form.assumptions, MAX_ITEM, 'Keep each line under 2,000 characters');
  if (assumptions.error) errors.assumptions = assumptions.error;
  return done(
    {
      price_cents: price ?? 0,
      eta_days: eta ?? 0,
      ...(plan ? { plan } : {}),
      deliverables: deliverables.items,
      included_steering_credits: steering,
      assumptions: assumptions.items,
    },
    errors,
  );
}

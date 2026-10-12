/**
 * The complaints form (hub /legal/complaints, POST /api/legal/complaints): categories, field
 * rules and the per-IP rate limit. Pure; the same rules run in the browser and on the server.
 *
 * Illegal-content notices follow the DSA (Regulation (EU) 2022/2065) art. 16(2): who sends it
 * (name, email), where the content is (an exact URL), why it is illegal (the message) and a
 * good-faith statement.
 */

export const COMPLAINT_CATEGORIES = [
  'payment_refund',
  'gigs_dispute',
  'marketplace_content',
  'illegal_content',
  'account',
  'privacy',
  'other',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  payment_refund: 'Payment or refund',
  gigs_dispute: 'Gigs dispute',
  marketplace_content: 'Marketplace content',
  illegal_content: 'Illegal content notice',
  account: 'Account',
  privacy: 'Privacy',
  other: 'Other',
};

export const LIMITS = { name: 200, email: 320, related: 500, messageMin: 10, messageMax: 5000 } as const;
export const COMPLAINTS_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

export type ComplaintField = 'category' | 'name' | 'email' | 'related' | 'message' | 'good_faith';

export interface ComplaintInput {
  category: ComplaintCategory;
  name: string;
  email: string;
  related: string | null;
  message: string;
  goodFaith: boolean;
}

export type ComplaintValidation =
  | { ok: true; value: ComplaintInput }
  | { ok: false; fields: Partial<Record<ComplaintField, string>> };

export const MESSAGES: Record<ComplaintField, string> = {
  category: 'Choose a category.',
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  related: 'Give the exact URL of the content.',
  message: `Write at least ${LIMITS.messageMin} characters.`,
  good_faith: 'Confirm the statement to send a notice.',
};

export function isComplaintCategory(value: unknown): value is ComplaintCategory {
  return (COMPLAINT_CATEGORIES as readonly unknown[]).includes(value);
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

export function isEmail(value: string): boolean {
  return value.length <= LIMITS.email && EMAIL.test(value);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function validateComplaint(raw: unknown): ComplaintValidation {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fields: Partial<Record<ComplaintField, string>> = {};
  const category = body.category;
  const name = str(body.name);
  const email = str(body.email);
  const related = str(body.related);
  const message = str(body.message);
  const goodFaith = body.good_faith === true;

  if (!isComplaintCategory(category)) fields.category = MESSAGES.category;
  if (!name) fields.name = MESSAGES.name;
  else if (name.length > LIMITS.name) fields.name = `Use at most ${LIMITS.name} characters.`;
  if (!isEmail(email)) fields.email = MESSAGES.email;
  if (related.length > LIMITS.related) fields.related = `Use at most ${LIMITS.related} characters.`;
  else if (category === 'illegal_content' && !related) fields.related = MESSAGES.related;
  if (message.length < LIMITS.messageMin) fields.message = MESSAGES.message;
  else if (message.length > LIMITS.messageMax) fields.message = `Use at most ${LIMITS.messageMax} characters.`;
  if (category === 'illegal_content' && !goodFaith) fields.good_faith = MESSAGES.good_faith;

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: { category: category as ComplaintCategory, name, email, related: related || null, message, goodFaith },
  };
}

/** A filled-in honeypot means a bot: answer as if it worked and do nothing. */
export function isHoneypotHit(raw: unknown): boolean {
  const v = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).website : undefined) ?? '';
  return typeof v !== 'string' || v.trim() !== '';
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Sliding window: `recent` are the times of this client's accepted complaints. Allowed while
 * fewer than `limit` fall inside the window; otherwise retry when the oldest one in it leaves.
 */
export function rateLimitDecision(
  recent: readonly (string | Date)[],
  now: Date,
  { limit = COMPLAINTS_PER_HOUR, windowMs = RATE_WINDOW_MS }: { limit?: number; windowMs?: number } = {},
): RateDecision {
  const t = now.getTime();
  const inWindow = recent
    .map((r) => new Date(r).getTime())
    .filter((x) => Number.isFinite(x) && x > t - windowMs && x <= t)
    .sort((a, b) => a - b);
  if (inWindow.length < limit) return { allowed: true };
  const oldest = inWindow[inWindow.length - limit];
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)) };
}

/** The client IP for rate limiting: the first x-forwarded-for hop, else x-real-ip. */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd) return fwd;
  return headers.get('x-real-ip')?.trim() || null;
}

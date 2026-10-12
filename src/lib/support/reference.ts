/**
 * Support references: `TZ-XXXX-XXXX`, 8 Crockford base32 characters (no I, L, O, U), 40 bits.
 * Every complaint and support thread has one; it goes in email subjects so replies find their
 * thread. Pure.
 */

export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERENCE_PATTERN = /^TZ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const FIND = /\bTZ-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})\b/i;

/** A reference from 8 random bytes (one character per byte, 5 bits each). */
export function referenceFromBytes(bytes: ArrayLike<number>): string {
  if (bytes.length < 8) throw new RangeError('A reference needs 8 random bytes');
  let chars = '';
  for (let i = 0; i < 8; i++) chars += REFERENCE_ALPHABET[bytes[i] & 31];
  return `TZ-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function isReference(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value);
}

/** The first reference in a subject or body (case-insensitive), upper-cased; null if none. */
export function findReference(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = FIND.exec(t);
    if (m) return `TZ-${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
  }
  return null;
}

/** `subject [TZ-XXXX-XXXX]`, unless the subject already carries that reference. */
export function subjectWithReference(subject: string, reference: string): string {
  const s = subject.trim() || 'Your message to Tulzo';
  return findReference(s) === reference ? s : `${s} [${reference}]`;
}

/** `Re: subject [ref]`, without stacking "Re:" prefixes. */
export function replySubject(subject: string, reference: string): string {
  const base = subject.replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, '').trim();
  return `Re: ${subjectWithReference(base, reference)}`;
}

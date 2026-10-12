import { NextRequest, NextResponse } from 'next/server';
import { MISCONFIGURED } from '@/src/lib/misconfigured';
import { jsonBody, sessionUserId } from '@/src/lib/session-user';
import { clientIp, isHoneypotHit, validateComplaint } from '@/src/lib/support/complaint';
import { referenceFromBytes } from '@/src/lib/support/reference';
import { RateLimitedError, SupportMisconfiguredError, submitComplaint } from '@/src/lib/support/support-service';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/legal/complaints: the hub /legal/complaints form, signed in or out.
 * Body `{ category, name, email, related?, message, good_faith?, website? }` (src/lib/support/complaint.ts)
 * → 201 `{ ok, reference }`; 400 `{ error: 'invalid_request', fields }`; 429 `{ error: 'rate_limited' }`
 * with Retry-After (5 per hour per client IP); 500 server_misconfigured without LEGAL_CONTACT_EMAIL.
 * A filled-in `website` honeypot gets the same 201 with a reference that was never stored.
 */
export async function POST(request: NextRequest) {
  const body = await jsonBody(request);
  if (isHoneypotHit(body)) return NextResponse.json({ ok: true, reference: referenceFromBytes(randomBytes(8)) }, { status: 201 });
  const checked = validateComplaint(body);
  if (!checked.ok) return NextResponse.json({ error: 'invalid_request', fields: checked.fields }, { status: 400 });

  let userId: string | null = null;
  try {
    userId = await sessionUserId(request);
  } catch {
    userId = null; // signed out
  }
  try {
    const { reference } = await submitComplaint({ input: checked.value, userId, ip: clientIp(request.headers) });
    return NextResponse.json({ ok: true, reference }, { status: 201 });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } },
      );
    }
    if (err instanceof SupportMisconfiguredError) {
      console.error('[legal/complaints]', err.message);
      return NextResponse.json(MISCONFIGURED, { status: 500 });
    }
    console.error('[legal/complaints] failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}

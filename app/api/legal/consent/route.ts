import { NextRequest, NextResponse } from 'next/server';
import { jsonBody, sessionUserId, unauthorized } from '@/src/lib/session-user';
import { CONSENT_REQUIRED, hasWithdrawalConsent, isConsentPurchase } from '@/src/lib/legal/consent';
import { recordConsent } from '@/src/lib/legal/consent-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/legal/consent `{ purchase: 'subscription', withdrawal_consent: true }` (signed in)
 * → 201 `{ ok, id, terms_version }`. Records the right-of-withdrawal waiver for purchases whose
 * checkout we don't run ourselves: Clerk's PricingTable on hub /pricing is revealed only after it.
 * Credits and gig contracts record theirs in their own checkout routes, so only 'subscription'
 * is accepted here.
 */
export async function POST(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  const body = await jsonBody(request);
  const purchase = (body as { purchase?: unknown } | null)?.purchase;
  if (!isConsentPurchase(purchase) || purchase !== 'subscription') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (!hasWithdrawalConsent(body)) return NextResponse.json(CONSENT_REQUIRED, { status: 400 });
  try {
    const consent = await recordConsent({ userId, purchase });
    return NextResponse.json({ ok: true, id: consent.id, terms_version: consent.terms_version }, { status: 201 });
  } catch (err) {
    console.error('[legal/consent]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'consent_not_recorded' }, { status: 503 });
  }
}

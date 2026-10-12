/**
 * Records withdrawal consents in `purchase_consents` (supabase/migrations/20261225_legal_complaints.sql).
 * Server-only (service role). A checkout that can't record the consent doesn't start: without the
 * record we couldn't show the consumer gave it.
 */
import { jobsDb } from '@/src/lib/jobs/db';
import { CONSENT_TEXT, type ConsentPurchase } from './consent';
import { TERMS_VERSION } from './facts';

export interface ConsentRecord {
  id: string;
  terms_version: string;
  consented_at: string;
}

export class ConsentNotRecordedError extends Error {
  constructor(cause: string) {
    super(`withdrawal consent could not be recorded: ${cause}`);
    this.name = 'ConsentNotRecordedError';
  }
}

export async function recordConsent(input: {
  userId: string;
  purchase: ConsentPurchase;
  amountCents?: number | null;
  currency?: string | null;
  reference?: string | null;
}): Promise<ConsentRecord> {
  const { data, error } = await jobsDb()
    .from('purchase_consents')
    .insert({
      user_id: input.userId,
      purchase: input.purchase,
      terms_version: TERMS_VERSION,
      amount_cents: input.amountCents ?? null,
      currency: input.currency ?? null,
      reference: input.reference ?? null,
      consent_text: CONSENT_TEXT[input.purchase],
    })
    .select('id, terms_version, consented_at')
    .single();
  if (error || !data) throw new ConsentNotRecordedError(error?.code ?? error?.message ?? 'no row');
  return data as ConsentRecord;
}

/** Metadata for the Stripe Checkout session (strings only). */
export function consentMetadata(consent: ConsentRecord): Record<string, string> {
  return { withdrawal_consent: 'true', terms_version: consent.terms_version, consent_id: consent.id };
}

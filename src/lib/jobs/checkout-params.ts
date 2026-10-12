/**
 * Stripe Checkout parameters for paying a contract. Pure.
 *
 * Separate charges and transfers: the customer pays bid + commission on the platform;
 * the bid is transferred to the provider later (Phase 5) using the same transfer_group.
 * `metadata.kind = 'contract'` routes the webhook; the credits top-up metadata
 * (clerkUserId / rawDepositAmount) is deliberately absent.
 */
import type Stripe from 'stripe';

export interface ContractCheckoutInput {
  contractId: string;
  jobId: string;
  bidId: string;
  jobTitle: string;
  customerTotalCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Shown above the pay button, e.g. the QA credit reserve. */
  note?: string;
  /** Extra metadata, e.g. the withdrawal consent (src/lib/legal/consent-service.ts). */
  metadata?: Record<string, string>;
}

export function transferGroupFor(contractId: string): string {
  return `contract_${contractId}`;
}

export interface TopupCheckoutInput {
  contractId: string;
  jobId: string;
  steeringRequestId: string;
  contractVersionId: string;
  version: number;
  jobTitle: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Top-up after an approved scope change raised the price: the difference in customer total
 * (bid delta plus commission), on the contract's transfer_group. `metadata.kind = 'contract_topup'`.
 */
export function buildTopupCheckoutParams(input: TopupCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = {
    kind: 'contract_topup',
    contract_id: input.contractId,
    job_id: input.jobId,
    steering_request_id: input.steeringRequestId,
    contract_version_id: input.contractVersionId,
  };
  return {
    mode: 'payment',
    client_reference_id: input.contractId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          product_data: { name: `Scope change (v${input.version}): ${input.jobTitle}`.slice(0, 250) },
        },
      },
    ],
    payment_intent_data: { transfer_group: transferGroupFor(input.contractId), metadata },
    metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

export function buildContractCheckoutParams(input: ContractCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { ...input.metadata, kind: 'contract', contract_id: input.contractId, job_id: input.jobId, bid_id: input.bidId };
  return {
    mode: 'payment',
    client_reference_id: input.contractId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.customerTotalCents,
          product_data: { name: `Gig contract: ${input.jobTitle}`.slice(0, 250) },
        },
      },
    ],
    payment_intent_data: { transfer_group: transferGroupFor(input.contractId), metadata },
    metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    ...(input.note ? { custom_text: { submit: { message: input.note.slice(0, 1200) } } } : {}),
  };
}

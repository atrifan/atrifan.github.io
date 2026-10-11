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
}

export function transferGroupFor(contractId: string): string {
  return `contract_${contractId}`;
}

export function buildContractCheckoutParams(input: ContractCheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { kind: 'contract', contract_id: input.contractId, job_id: input.jobId, bid_id: input.bidId };
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
  };
}

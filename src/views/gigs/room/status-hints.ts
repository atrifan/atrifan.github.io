import type { ContractStatus } from '@/src/lib/jobs/job-state';

/** One line per contract status, shown on the contract page and the room's Status tab. */
export const STATUS_HINT: Record<ContractStatus, string> = {
  pending_payment: 'Waiting for the customer to pay through Stripe. Work starts once the payment is confirmed.',
  active: 'Paid. The provider is working on it.',
  submitted: 'The provider submitted the work.',
  in_qa: 'An independent reviewer is checking the work against the acceptance criteria.',
  rework: 'QA asked for changes. The provider is fixing them.',
  delivered: 'QA validated the work. The delivery is ready.',
  completed: 'Done. The provider has been paid.',
  disputed: 'Under review by Tulzo.',
  cancelled: 'This contract was cancelled.',
  refunded: 'The payment was refunded.',
};

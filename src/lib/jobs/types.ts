import type { JobStatus, ContractStatus } from './job-state';
import type { ConnectStatus } from './connect-rules';
import type { SteeringKind, SteeringStatus, TopupStatus } from './steering';

export interface PrincipalRow {
  id: string;
  kind: 'user' | 'agent' | 'org';
  user_id: string;
  agent_identity_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderProfileRow {
  id: string;
  user_id: string;
  principal_id: string;
  stripe_account_id: string | null;
  connect_status: ConnectStatus;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  headline: string | null;
  skills: string[];
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  user_id: string;
  customer_principal_id: string;
  title: string;
  description: string;
  category: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  currency: string;
  deadline: string | null;
  status: JobStatus;
  current_spec_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSpecVersionRow {
  id: string;
  job_id: string;
  user_id: string;
  version: number;
  status: 'draft' | 'approved' | 'superseded';
  source: 'ai' | 'manual';
  model: string | null;
  requirements: string[];
  deliverables: string[];
  acceptance_criteria: string[];
  constraints: string[];
  permitted_tools: string[];
  security: { data_sensitivity: 'public' | 'internal' | 'confidential'; secrets_allowed: boolean; notes: string };
  deadline: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferRow {
  id: string;
  user_id: string;
  provider_principal_id: string;
  title: string;
  description: string;
  category: string | null;
  tags: string[];
  price_cents: number;
  currency: string;
  delivery_days: number;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BidRow {
  id: string;
  job_id: string;
  spec_version_id: string;
  user_id: string;
  provider_principal_id: string;
  agent_identity_id: string | null;
  price_cents: number;
  currency: string;
  eta_days: number;
  plan: string | null;
  deliverables: string[];
  included_steering_credits: number;
  assumptions: string[];
  status: 'active' | 'withdrawn' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface ContractRow {
  id: string;
  parent_contract_id: string | null;
  job_id: string;
  bid_id: string;
  user_id: string;
  customer_user_id: string;
  provider_user_id: string;
  customer_principal_id: string;
  provider_principal_id: string;
  status: ContractStatus;
  current_version_id: string | null;
  currency: string;
  transfer_group: string | null;
  stripe_checkout_session_id: string | null;
  /** Included steering credits used so far; claimed with a compare-and-swap (steering-service.ts). */
  steering_credits_used: number;
  /** When the customer was last emailed a progress update (at most one per hour). */
  progress_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractVersionRow {
  id: string;
  contract_id: string;
  user_id: string;
  version: number;
  spec_version_id: string;
  price_cents: number;
  commission_bps: number;
  fee_cents: number;
  customer_total_cents: number;
  currency: string;
  deadline: string | null;
  steering_allowance: number;
  /** QA checks the customer pays for (src/config/qa.config.ts); null on versions from before Phase 4. */
  qa_checks: string[] | null;
  signed_by_customer_at: string | null;
  signed_by_provider_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  contract_id: string;
  contract_version_id: string | null;
  user_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  amount_cents: number;
  amount_refunded_cents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'disputed';
  created_at: string;
  updated_at: string;
}

/** Commission breakdown as returned by the API (snake_case). */
export interface Pricing {
  bid_cents: number;
  fee_cents: number;
  customer_total_cents: number;
  provider_net_cents: number;
  commission_bps: number;
}

export interface AgentIdentityRow {
  id: string;
  user_id: string;
  owner_principal_id: string;
  name: string;
  version: string | null;
  model: string | null;
  oauth_client_id: string | null;
  client_kind: 'oauth' | 'api_key' | 'test';
  api_key_id: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PartyRole = 'customer' | 'provider';

export interface JobMessageRow {
  id: string;
  seq: number;
  contract_id: string;
  user_id: string | null;
  author_principal_id: string | null;
  agent_identity_id: string | null;
  author_role: PartyRole | 'system';
  kind: 'message' | 'progress' | 'system';
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface MilestoneRow {
  id: string;
  contract_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  position: number;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SteeringRequestRow {
  id: string;
  contract_id: string;
  user_id: string;
  requested_by_principal_id: string;
  message: string;
  requested_kind: SteeringKind | null;
  kind: SteeringKind;
  classifier_output: Record<string, unknown>;
  credit_cost: number;
  spec_changes: string[];
  proposed_price_cents: number | null;
  proposed_deadline: string | null;
  status: SteeringStatus;
  response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  estimate_delta_cents: number | null;
  estimate_eta_days: number | null;
  deliverable_changes: string[];
  base_contract_version_id: string;
  new_contract_version_id: string | null;
  topup_amount_cents: number;
  topup_status: TopupStatus;
  topup_checkout_session_id: string | null;
  topup_checkout_url: string | null;
  /** Refund on approval of a price decrease, or a credit recorded for payout when nothing could be refunded. */
  refund_amount_cents: number;
  refund_status: 'none' | 'refunded' | 'credit_pending' | 'credit_settled';
  /** Still owed to the customer while credit_pending; settled at payout (src/lib/delivery/scope-credits.ts). */
  refund_credit_cents: number;
  credit_refunded_cents: number;
  credit_deducted_cents: number;
  credit_settled_at: string | null;
  /** The job_spec_versions row this scope change created (spec or deliverable changes). */
  new_spec_version_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityEventRow {
  id: string;
  seq: number;
  contract_id: string;
  user_id: string | null;
  actor_role: PartyRole | 'system';
  agent_identity_id: string | null;
  type: string;
  summary: string;
  data: Record<string, unknown>;
  created_at: string;
}

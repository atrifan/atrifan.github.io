import type { JobStatus, ContractStatus } from './job-state';
import type { ConnectStatus } from './connect-rules';

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

-- Gigs (jobs marketplace) core: parties, jobs, specs, offers, bids, contracts, money, webhooks.
--
-- Names are deliberately NOT schema-qualified, so the same file applies to `public` in
-- Supabase and to a throwaway schema in tests (`SET search_path TO test_gigs_x`).
-- Money is integer cents; currency is a lower-case ISO 4217 code, default 'eur'.
-- Clerk user ids are TEXT. Server code uses the service role and filters by user_id.

CREATE OR REPLACE FUNCTION jobs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Every party (a human user, an agent acting for a user, an org) is a principal.
CREATE TABLE IF NOT EXISTS principals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('user', 'agent', 'org')),
  user_id TEXT NOT NULL,                       -- the Clerk user it belongs to (owner for agents/orgs)
  agent_identity_id UUID,                      -- set when kind = 'agent' (FK added below)
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind <> 'agent' OR agent_identity_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS principals_one_user_principal ON principals (user_id) WHERE kind = 'user';
CREATE INDEX IF NOT EXISTS principals_user_id_idx ON principals (user_id);

CREATE TABLE IF NOT EXISTS agent_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                       -- owner
  owner_principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  version TEXT,
  model TEXT,
  oauth_client_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_identities_user_id_idx ON agent_identities (user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'principals_agent_identity_fk') THEN
    ALTER TABLE principals
      ADD CONSTRAINT principals_agent_identity_fk
      FOREIGN KEY (agent_identity_id) REFERENCES agent_identities(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  principal_id UUID NOT NULL UNIQUE REFERENCES principals(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE,
  connect_status TEXT NOT NULL DEFAULT 'none'
    CHECK (connect_status IN ('none', 'pending', 'restricted', 'enabled', 'disabled')),
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  headline TEXT CHECK (headline IS NULL OR length(headline) <= 200),
  skills TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT payouts_enabled OR stripe_account_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                       -- the customer who posted it
  customer_principal_id UUID NOT NULL REFERENCES principals(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 10000),
  category TEXT,
  budget_min_cents INTEGER CHECK (budget_min_cents IS NULL OR budget_min_cents >= 0),
  budget_max_cents INTEGER CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'awarded', 'in_progress', 'delivered', 'completed', 'cancelled', 'disputed')),
  current_spec_version_id UUID,                -- FK added below
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (budget_min_cents IS NULL OR budget_max_cents IS NULL OR budget_min_cents <= budget_max_cents),
  CHECK (status = 'draft' OR status = 'cancelled' OR current_spec_version_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_category_idx ON jobs (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_deadline_idx ON jobs (deadline) WHERE deadline IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_spec_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                       -- the job owner
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
  model TEXT,
  requirements JSONB NOT NULL CHECK (jsonb_typeof(requirements) = 'array'),
  deliverables JSONB NOT NULL CHECK (jsonb_typeof(deliverables) = 'array'),
  acceptance_criteria JSONB NOT NULL CHECK (jsonb_typeof(acceptance_criteria) = 'array'),
  constraints JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(constraints) = 'array'),
  permitted_tools JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(permitted_tools) = 'array'),
  security JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(security) = 'object'),
  deadline TIMESTAMPTZ,
  budget_min_cents INTEGER CHECK (budget_min_cents IS NULL OR budget_min_cents >= 0),
  budget_max_cents INTEGER CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, version),
  CHECK (budget_min_cents IS NULL OR budget_max_cents IS NULL OR budget_min_cents <= budget_max_cents),
  CHECK (status = 'draft' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS job_spec_versions_job_idx ON job_spec_versions (job_id, version DESC);
CREATE INDEX IF NOT EXISTS job_spec_versions_user_idx ON job_spec_versions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS job_spec_versions_one_approved ON job_spec_versions (job_id) WHERE status = 'approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_current_spec_version_fk') THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_current_spec_version_fk
      FOREIGN KEY (current_spec_version_id) REFERENCES job_spec_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- What a provider is willing to do, independent of any job.
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                       -- the provider
  provider_principal_id UUID NOT NULL REFERENCES principals(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 5000),
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  delivery_days INTEGER NOT NULL CHECK (delivery_days >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS offers_user_id_idx ON offers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_status_created_idx ON offers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_category_idx ON offers (category) WHERE category IS NOT NULL;

CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  spec_version_id UUID NOT NULL REFERENCES job_spec_versions(id),
  user_id TEXT NOT NULL,                       -- the provider
  provider_principal_id UUID NOT NULL REFERENCES principals(id),
  agent_identity_id UUID REFERENCES agent_identities(id),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  eta_days INTEGER NOT NULL CHECK (eta_days >= 1),
  plan TEXT,
  deliverables JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(deliverables) = 'array'),
  included_steering_credits INTEGER NOT NULL DEFAULT 0 CHECK (included_steering_credits >= 0),
  assumptions JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(assumptions) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One active bid per provider per job.
CREATE UNIQUE INDEX IF NOT EXISTS bids_one_active_per_provider
  ON bids (job_id, provider_principal_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS bids_job_idx ON bids (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bids_user_id_idx ON bids (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_contract_id UUID REFERENCES contracts(id),   -- future subcontracting
  job_id UUID NOT NULL REFERENCES jobs(id),
  bid_id UUID NOT NULL REFERENCES bids(id),
  user_id TEXT NOT NULL,                       -- the customer (same as customer_user_id)
  customer_user_id TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  customer_principal_id UUID NOT NULL REFERENCES principals(id),
  provider_principal_id UUID NOT NULL REFERENCES principals(id),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'active', 'submitted', 'rework', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded')),
  current_version_id UUID,                     -- FK added below
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  transfer_group TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id = customer_user_id),
  CHECK (customer_user_id <> provider_user_id),
  CHECK (parent_contract_id IS NULL OR parent_contract_id <> id)
);
CREATE INDEX IF NOT EXISTS contracts_user_id_idx ON contracts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_provider_user_idx ON contracts (provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_job_idx ON contracts (job_id);
CREATE INDEX IF NOT EXISTS contracts_parent_idx ON contracts (parent_contract_id) WHERE parent_contract_id IS NOT NULL;
-- At most one live contract per job and per bid (a cancelled checkout can be retried).
CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_live_per_job
  ON contracts (job_id) WHERE status NOT IN ('cancelled', 'refunded');
CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_live_per_bid
  ON contracts (bid_id) WHERE status NOT IN ('cancelled', 'refunded');

CREATE TABLE IF NOT EXISTS contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                       -- the customer
  version INTEGER NOT NULL CHECK (version >= 1),
  spec_version_id UUID NOT NULL REFERENCES job_spec_versions(id),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),            -- the bid; what the provider is paid
  commission_bps INTEGER NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  customer_total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  deadline TIMESTAMPTZ,
  steering_allowance INTEGER NOT NULL DEFAULT 0 CHECK (steering_allowance >= 0),
  signed_by_customer_at TIMESTAMPTZ,
  signed_by_provider_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, version),
  CHECK (customer_total_cents = price_cents + fee_cents)
);
CREATE INDEX IF NOT EXISTS contract_versions_user_idx ON contract_versions (user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_current_version_fk') THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES contract_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  contract_version_id UUID REFERENCES contract_versions(id),
  user_id TEXT NOT NULL,                       -- the payer (customer)
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'partially_refunded', 'refunded', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount_refunded_cents <= amount_cents)
);
CREATE INDEX IF NOT EXISTS payments_contract_idx ON payments (contract_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  payment_id UUID REFERENCES payments(id),
  user_id TEXT NOT NULL,                       -- the payee (provider)
  stripe_transfer_id TEXT UNIQUE,
  destination_account_id TEXT NOT NULL,
  transfer_group TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  amount_reversed_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_reversed_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'reversed', 'partially_reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount_reversed_cents <= amount_cents)
);
CREATE INDEX IF NOT EXISTS transfers_contract_idx ON transfers (contract_id);
CREATE INDEX IF NOT EXISTS transfers_user_id_idx ON transfers (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  user_id TEXT NOT NULL,                       -- the customer refunded
  stripe_refund_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'requires_action')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds (payment_id);
CREATE INDEX IF NOT EXISTS refunds_user_id_idx ON refunds (user_id, created_at DESC);

-- Webhook idempotency: one row per Stripe event id.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,                          -- evt_...
  type TEXT NOT NULL,
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  object_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stripe_events_type_idx ON stripe_events (type, received_at DESC);

-- updated_at triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'principals', 'agent_identities', 'provider_profiles', 'jobs', 'job_spec_versions', 'offers',
    'bids', 'contracts', 'contract_versions', 'payments', 'transfers', 'refunds', 'stripe_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION jobs_set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- RLS on, no policies: only the service role (which bypasses RLS) reads or writes these tables.
ALTER TABLE principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_spec_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

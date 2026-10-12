-- Gigs Phase 5: delivery, acceptance and payouts, disputes, reviews, trust scores, and
-- monthly plan credit grants.
--
-- Names are NOT schema-qualified (applies to `public` in Supabase and to a throwaway schema in
-- tests). Requires 20261101_jobs_core.sql, 20261201_qa.sql, 20260525_paid_proxy_tables.sql
-- (user_budgets, increment_user_balance) and 20260526_budget_analytics.sql
-- (balance_transactions). Additive only.

-- 1. Acceptance. accepted_by is the customer's user id, or NULL for auto-accept / admin release.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS accepted_by TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS acceptance TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_acceptance_check' AND conrelid = 'contracts'::regclass) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_acceptance_check
      CHECK (acceptance IS NULL OR acceptance IN ('customer', 'auto', 'resolution'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts (status);

-- The 48h auto-accept reminder, sent once per validated submission.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS auto_accept_reminded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS submissions_auto_accept_idx ON submissions (auto_accept_at) WHERE auto_accept_at IS NOT NULL;

-- Self-dealing detection (src/lib/trust/trust-score.ts): Stripe fingerprints of the payer
-- (card fingerprint, Stripe customer, billing email) and of the provider's payout account
-- (account email, bank/card fingerprints). Lower-case "kind:value" strings.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_fingerprints TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS payout_fingerprints TEXT[] NOT NULL DEFAULT '{}';

-- 2. Payouts: at most one live payout transfer per contract (a failed one can be retried).
CREATE UNIQUE INDEX IF NOT EXISTS transfers_one_live_payout_per_contract
  ON transfers (contract_id) WHERE status <> 'failed';

-- 3. Disputes. One open customer/QA dispute per contract; chargebacks are linked by their
--    Stripe dispute id and may sit next to it.
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  user_id TEXT NOT NULL,                       -- the customer
  provider_user_id TEXT NOT NULL,
  opened_by_user_id TEXT,                      -- NULL for chargebacks
  source TEXT NOT NULL CHECK (source IN ('customer', 'qa_rejected', 'chargeback')),
  phase TEXT NOT NULL CHECK (phase IN ('pre_accept', 'post_accept')),
  category TEXT NOT NULL CHECK (category IN (
    'not_as_described', 'incomplete', 'quality', 'late', 'not_delivered', 'qa_rejected', 'chargeback', 'other'
  )),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 4000),
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 20000),
  -- resolving: the admin's plan is stored and the money moves are in flight (safe to retry)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolving', 'resolved')),
  default_resolution TEXT CHECK (default_resolution IS NULL OR default_resolution IN ('release', 'partial_refund', 'full_refund')),
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('release', 'partial_refund', 'full_refund')),
  refund_cents INTEGER CHECK (refund_cents IS NULL OR refund_cents >= 0),
  transfer_cents INTEGER CHECK (transfer_cents IS NULL OR transfer_cents >= 0),
  reversal_cents INTEGER CHECK (reversal_cents IS NULL OR reversal_cents >= 0),
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 4000),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  stripe_dispute_id TEXT UNIQUE,
  stripe_dispute_status TEXT,
  stripe_dispute_reason TEXT,
  stripe_amount_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'resolved' OR source = 'chargeback' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK (status <> 'resolving' OR resolution IS NOT NULL),
  CHECK (source <> 'chargeback' OR stripe_dispute_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS disputes_contract_idx ON disputes (contract_id, created_at);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes (status, created_at);
CREATE INDEX IF NOT EXISTS disputes_user_idx ON disputes (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_per_contract
  ON disputes (contract_id) WHERE status IN ('open', 'resolving') AND source <> 'chargeback';

-- Refunds made by a dispute resolution point at it (so a retried resolution never refunds twice).
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id);

-- Transfer reversals made by dispute resolutions.
CREATE TABLE IF NOT EXISTS transfer_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES transfers(id),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  dispute_id UUID REFERENCES disputes(id),
  stripe_reversal_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency ~ '^[a-z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transfer_reversals_contract_idx ON transfer_reversals (contract_id);

-- 4. Deliveries: every download of the QA'd SHA and every push to the customer's repo. The
--    customer's write PAT for a push is sealed (AAD "delivery:<id>") and purged once the push
--    is done and, at the latest, on acceptance.
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  user_id TEXT NOT NULL,                       -- the customer
  kind TEXT NOT NULL CHECK (kind IN ('download', 'push')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  target_repo TEXT CHECK (target_repo IS NULL OR target_repo ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'),
  pushed_commit_sha TEXT,
  file_count INTEGER,
  bytes BIGINT,
  error TEXT,
  pat_ciphertext TEXT,
  pat_iv TEXT,
  pat_tag TEXT,
  pat_purged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind = 'download' OR target_repo IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS deliveries_contract_idx ON deliveries (contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deliveries_user_idx ON deliveries (user_id, created_at DESC);
-- One push at a time per contract.
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_one_pending_push
  ON deliveries (contract_id) WHERE kind = 'push' AND status = 'pending';

-- 5. Reviews: one per contract per reviewer, after acceptance or resolution. A customer's
--    review is about the provider principal and the agent identity/version that did the work;
--    a provider's review is about the customer.
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  reviewer_user_id TEXT NOT NULL,
  reviewer_principal_id UUID NOT NULL REFERENCES principals(id),
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('customer', 'provider')),
  subject_user_id TEXT NOT NULL,
  subject_principal_id UUID NOT NULL REFERENCES principals(id),
  subject_agent_identity_id UUID REFERENCES agent_identities(id),
  subject_agent_version TEXT,
  overall SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 5),
  quality SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  communication SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  timeliness SMALLINT NOT NULL CHECK (timeliness BETWEEN 1 AND 5),
  body TEXT CHECK (body IS NULL OR length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, reviewer_user_id),
  CHECK (reviewer_user_id <> subject_user_id)
);
CREATE INDEX IF NOT EXISTS reviews_subject_user_idx ON reviews (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_subject_principal_idx ON reviews (subject_principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_subject_agent_idx ON reviews (subject_agent_identity_id) WHERE subject_agent_identity_id IS NOT NULL;

-- 6. Trust scores: one row per provider principal ('principal:<id>') and per agent version
--    ('agent:<identity id>:<version>'). Recomputed on events and nightly (decay).
CREATE TABLE IF NOT EXISTS trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key TEXT NOT NULL UNIQUE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('principal', 'agent_version')),
  principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  agent_identity_id UUID REFERENCES agent_identities(id) ON DELETE CASCADE,
  agent_version TEXT,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  level TEXT NOT NULL CHECK (level IN ('new', 'building', 'established')),
  counted INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(2, 1),
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (subject_type = 'principal' OR agent_identity_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS trust_scores_principal_idx ON trust_scores (principal_id);
CREATE INDEX IF NOT EXISTS trust_scores_user_idx ON trust_scores (user_id);

-- 7. Monthly plan credits. One grant per user per monthly period; the unused remainder of a
--    grant expires at the next grant or when its period ends (src/lib/credits/grants.ts).
--    Bought credits never expire. The ledger rows are in balance_transactions
--    (type 'plan_grant' and 'plan_expiry'); amounts there are USD, like the balance.
CREATE TABLE IF NOT EXISTS plan_subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'plus', 'super')),
  status TEXT NOT NULL,
  period_anchor TIMESTAMPTZ,
  clerk_subscription_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}-\d{2}$'),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'plus', 'super')),
  credits NUMERIC(12, 2) NOT NULL CHECK (credits > 0),
  credit_value_usd NUMERIC(10, 6) NOT NULL CHECK (credit_value_usd > 0),
  balance_after_usd NUMERIC(12, 4) NOT NULL,
  transaction_id BIGINT REFERENCES balance_transactions(id),
  source TEXT NOT NULL CHECK (source IN ('webhook', 'cron')),
  expired_credits NUMERIC(12, 2) CHECK (expired_credits IS NULL OR expired_credits >= 0),
  expired_at TIMESTAMPTZ,
  expire_transaction_id BIGINT REFERENCES balance_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period),
  CHECK (period_end > period_start),
  CHECK ((expired_at IS NULL) = (expired_credits IS NULL))
);
CREATE INDEX IF NOT EXISTS credit_grants_user_idx ON credit_grants (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_grants_open_idx ON credit_grants (period_end) WHERE expired_at IS NULL;

-- Expire what is left of a grant, guarded by the balance the caller computed from
-- (optimistic: a balance change in between returns 'balance_changed' and the caller retries).
-- Never takes more than the balance. Returns {"ok", "expired_usd", "balance_usd", "error"?}.
CREATE OR REPLACE FUNCTION expire_credit_grant(
  p_grant_id UUID,
  p_expire_credits NUMERIC,
  p_expected_balance_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  g RECORD;
  v_balance NUMERIC;
  v_usd NUMERIC;
  v_tx BIGINT;
BEGIN
  SELECT * INTO g FROM credit_grants WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF g.expired_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'expired_usd', 0, 'already_expired', true);
  END IF;
  INSERT INTO user_budgets (user_id, remaining_balance, status) VALUES (g.user_id, 0, 'active')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT remaining_balance INTO v_balance FROM user_budgets WHERE user_id = g.user_id FOR UPDATE;
  IF round(v_balance, 4) <> round(p_expected_balance_usd, 4) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_changed', 'balance_usd', v_balance);
  END IF;
  v_usd := LEAST(GREATEST(round(COALESCE(p_expire_credits, 0) * g.credit_value_usd, 4), 0), GREATEST(v_balance, 0));
  IF v_usd > 0 THEN
    UPDATE user_budgets SET remaining_balance = remaining_balance - v_usd, updated_at = NOW() WHERE user_id = g.user_id;
    INSERT INTO balance_transactions (user_id, type, amount, description)
    VALUES (g.user_id, 'plan_expiry', v_usd, format('Unused %s monthly credits expired (%s)', initcap(g.plan), g.period))
    RETURNING id INTO v_tx;
  END IF;
  UPDATE credit_grants
  SET expired_at = NOW(), expired_credits = round(v_usd / g.credit_value_usd, 2), expire_transaction_id = v_tx
  WHERE id = g.id;
  RETURN jsonb_build_object('ok', true, 'expired_usd', v_usd, 'balance_usd', v_balance - v_usd);
END;
$$ LANGUAGE plpgsql;

-- Grant a period's credits once: claim (user, period), expire the previous grant's remainder
-- (as computed by the caller from p_expected_balance_usd), add the new credits. All or nothing.
-- Returns {"ok", "duplicate"?, "grant_id", "expired_usd", "balance_usd", "error"?}.
CREATE OR REPLACE FUNCTION apply_credit_grant(
  p_user_id TEXT,
  p_period TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_plan TEXT,
  p_credits NUMERIC,
  p_credit_value_usd NUMERIC,
  p_source TEXT,
  p_previous_grant_id UUID,
  p_expire_credits NUMERIC,
  p_expected_balance_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_balance NUMERIC;
  v_expired JSONB;
  v_expired_usd NUMERIC := 0;
  v_grant_usd NUMERIC;
  v_tx BIGINT;
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM credit_grants WHERE user_id = p_user_id AND period = p_period) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  INSERT INTO user_budgets (user_id, remaining_balance, status) VALUES (p_user_id, 0, 'active')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT remaining_balance INTO v_balance FROM user_budgets WHERE user_id = p_user_id FOR UPDATE;
  IF round(v_balance, 4) <> round(p_expected_balance_usd, 4) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_changed', 'balance_usd', v_balance);
  END IF;
  IF p_previous_grant_id IS NOT NULL THEN
    v_expired := expire_credit_grant(p_previous_grant_id, p_expire_credits, v_balance);
    IF NOT (v_expired->>'ok')::boolean THEN
      RAISE EXCEPTION 'expire_credit_grant failed: %', v_expired->>'error';
    END IF;
    v_expired_usd := COALESCE((v_expired->>'expired_usd')::numeric, 0);
  END IF;
  v_grant_usd := round(p_credits * p_credit_value_usd, 4);
  PERFORM increment_user_balance(p_user_id, v_grant_usd);
  INSERT INTO balance_transactions (user_id, type, amount, description)
  VALUES (p_user_id, 'plan_grant', v_grant_usd, format('%s plan: %s monthly credits (%s)', initcap(p_plan), p_credits, p_period))
  RETURNING id INTO v_tx;
  INSERT INTO credit_grants (user_id, period, period_start, period_end, plan, credits, credit_value_usd,
    balance_after_usd, transaction_id, source)
  VALUES (p_user_id, p_period, p_period_start, p_period_end, p_plan, p_credits, p_credit_value_usd,
    v_balance - v_expired_usd + v_grant_usd, v_tx, p_source)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'grant_id', v_id, 'expired_usd', v_expired_usd,
    'balance_usd', v_balance - v_expired_usd + v_grant_usd);
EXCEPTION WHEN unique_violation THEN
  -- a concurrent grant for the same period won
  RETURN jsonb_build_object('ok', true, 'duplicate', true);
END;
$$ LANGUAGE plpgsql;

-- updated_at triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['disputes', 'deliveries', 'reviews'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION jobs_set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- RLS on, no policies: only the service role reads or writes these tables.
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_grants ENABLE ROW LEVEL SECURITY;

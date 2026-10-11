-- Gigs Phase 4: submissions, admin QA, review keys, audit trail.
--
-- Names are NOT schema-qualified (applies to `public` in Supabase and to a throwaway
-- schema in tests). Requires 20261101_jobs_core.sql, 20260525_paid_proxy_tables.sql
-- (user_budgets, increment_user_balance) and api_keys. Additive only, except that the
-- contracts.status CHECK is widened with 'in_qa'.
--
-- Credits: 1 credit = CREDIT_VALUE_USD (default $0.01). Credit columns are NUMERIC(12,2).

-- 1. Contract state 'in_qa' (active|rework -> in_qa -> delivered|rework|disputed|refunded).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'contracts'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%pending_payment%'
  LOOP
    EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check CHECK (status IN (
  'pending_payment', 'active', 'submitted', 'in_qa', 'rework', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded'
));

-- 2. The QA checks the customer chose when the contract was made (NULL = basic only).
ALTER TABLE contract_versions ADD COLUMN IF NOT EXISTS qa_checks TEXT[];

-- 3. Submissions: one row per send_project attempt. The PAT is AES-256-GCM sealed
--    (src/lib/crypto/secret-box.ts, AAD "submission:<id>") and purged after acceptance.
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  contract_version_id UUID REFERENCES contract_versions(id),
  user_id TEXT NOT NULL,                       -- the provider who submitted
  customer_user_id TEXT NOT NULL,
  agent_identity_id UUID REFERENCES agent_identities(id),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  repo_full_name TEXT NOT NULL CHECK (repo_full_name ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'),
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  pat_ciphertext TEXT,
  pat_iv TEXT,
  pat_tag TEXT,
  pat_expires_at TIMESTAMPTZ,
  pat_purged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'awaiting_qa'
    CHECK (status IN ('awaiting_qa', 'in_review', 'validated', 'requires_changes', 'rejected')),
  files_hash TEXT,                             -- Phase 5 (delivery snapshot)
  snapshot_path TEXT,                          -- Phase 5
  reviewed_at TIMESTAMPTZ,
  delivery_unlocked_at TIMESTAMPTZ,            -- set by a validated verdict; Phase 5 builds delivery
  auto_accept_at TIMESTAMPTZ,                  -- validated + JOBS_AUTO_ACCEPT_DAYS
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, attempt),
  CHECK (user_id <> customer_user_id),
  CHECK (pat_purged_at IS NOT NULL OR (pat_ciphertext IS NOT NULL AND pat_iv IS NOT NULL AND pat_tag IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS submissions_status_created_idx ON submissions (status, created_at);
CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_customer_idx ON submissions (customer_user_id, created_at DESC);
-- At most one submission per contract waiting for (or in) QA.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_open_per_contract
  ON submissions (contract_id) WHERE status IN ('awaiting_qa', 'in_review');

-- 4. QA requests: the credit reserve for one QA job. Polymorphic subject so the
--    standalone checker (Phase 6) reuses the pipeline.
CREATE TABLE IF NOT EXISTS qa_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('contract_submission', 'standalone')),
  subject_id UUID NOT NULL,
  requester_user_id TEXT NOT NULL,             -- who pays (the customer)
  checks TEXT[] NOT NULL DEFAULT ARRAY['basic'],
  platform_credits NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (platform_credits >= 0),  -- basic, paid by the platform
  reserved_credits NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),  -- taken from the requester's balance
  used_credits NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (used_credits >= 0),          -- metered review-key usage
  charged_credits NUMERIC(12, 2) CHECK (charged_credits IS NULL OR charged_credits >= 0),   -- requester's share, at settlement
  released_credits NUMERIC(12, 2) CHECK (released_credits IS NULL OR released_credits >= 0),
  credit_value_usd NUMERIC(10, 6) NOT NULL CHECK (credit_value_usd > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'cancelled')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_type, subject_id),
  CHECK (charged_credits IS NULL OR charged_credits <= reserved_credits)
);
CREATE INDEX IF NOT EXISTS qa_requests_requester_idx ON qa_requests (requester_user_id, created_at DESC);

-- 5. QA reviews: one verdict per submission; supersedes_review_id links to the review of
--    the previous attempt, so the history reads as a chain.
CREATE TABLE IF NOT EXISTS qa_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL UNIQUE REFERENCES submissions(id),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  reviewer_user_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('validated', 'requires_changes', 'rejected')),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 4000),
  report_md TEXT CHECK (report_md IS NULL OR length(report_md) <= 200000),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  cost_credits NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_credits >= 0),
  supersedes_review_id UUID REFERENCES qa_reviews(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verdict = 'validated' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS qa_reviews_contract_idx ON qa_reviews (contract_id, created_at);

-- 6. Audit trail (credential reads, verdicts, dispute/trust events for Phase 5).
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_subject_idx ON audit_events (subject_type, subject_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action, created_at DESC);

-- 7. Review keys: api_keys rows with purpose 'qa_review', tied to a submission, capped
--    and short-lived. Existing rows become purpose 'device'.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'device';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS cap_credits NUMERIC(12, 2);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_purpose_check' AND conrelid = 'api_keys'::regclass) THEN
    ALTER TABLE api_keys ADD CONSTRAINT api_keys_purpose_check CHECK (
      purpose IN ('device', 'qa_review')
      AND (purpose <> 'qa_review' OR (submission_id IS NOT NULL AND cap_credits IS NOT NULL AND expires_at IS NOT NULL))
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_api_keys_submission ON api_keys (submission_id) WHERE submission_id IS NOT NULL;

-- 8. Per-call usage of review keys through /api/chat.
CREATE TABLE IF NOT EXISTS qa_usage_log (
  id BIGSERIAL PRIMARY KEY,
  qa_request_id UUID NOT NULL REFERENCES qa_requests(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  api_key_id UUID NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  credits_requested NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credits_charged NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS qa_usage_log_submission_idx ON qa_usage_log (submission_id, created_at);

-- Meter one /api/chat call made with a review key: clamp to what is left of the cap,
-- add it to the request's used_credits and log it, atomically. Returns
-- {"ok":bool, "charged", "used", "cap", "error"?}.
CREATE OR REPLACE FUNCTION qa_meter_usage(
  p_api_key_id UUID,
  p_credits NUMERIC,
  p_cost_usd NUMERIC,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER
) RETURNS JSONB AS $$
DECLARE
  k RECORD;
  r RECORD;
  v_cap NUMERIC;
  v_charge NUMERIC;
BEGIN
  SELECT id, user_id, submission_id, cap_credits INTO k
  FROM api_keys WHERE id = p_api_key_id AND purpose = 'qa_review';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_review_key');
  END IF;
  SELECT * INTO r FROM qa_requests
  WHERE subject_type = 'contract_submission' AND subject_id = k.submission_id
  FOR UPDATE;
  IF NOT FOUND OR r.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_reserve');
  END IF;
  v_cap := LEAST(r.platform_credits + r.reserved_credits, k.cap_credits);
  v_charge := LEAST(GREATEST(COALESCE(p_credits, 0), 0), GREATEST(v_cap - r.used_credits, 0));
  UPDATE qa_requests SET used_credits = used_credits + v_charge WHERE id = r.id;
  INSERT INTO qa_usage_log (qa_request_id, submission_id, api_key_id, reviewer_user_id, model,
    input_tokens, output_tokens, cost_usd, credits_requested, credits_charged)
  VALUES (r.id, k.submission_id, k.id, k.user_id, p_model, COALESCE(p_input_tokens, 0), COALESCE(p_output_tokens, 0),
    COALESCE(p_cost_usd, 0), GREATEST(COALESCE(p_credits, 0), 0), v_charge);
  RETURN jsonb_build_object('ok', true, 'charged', v_charge, 'used', r.used_credits + v_charge, 'cap', v_cap);
END;
$$ LANGUAGE plpgsql;

-- Settle a reserve once: record the requester's charge and release the rest of their
-- reserve back to user_budgets. Guarded on status and on the used_credits the caller read,
-- so a late usage row makes the settle fail (and the caller retries) instead of being lost.
CREATE OR REPLACE FUNCTION qa_settle_request(
  p_request_id UUID,
  p_expected_used NUMERIC,
  p_charged NUMERIC,
  p_released NUMERIC,
  p_release_usd NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
  v_user TEXT;
BEGIN
  UPDATE qa_requests
  SET status = 'settled', charged_credits = p_charged, released_credits = p_released, settled_at = NOW()
  WHERE id = p_request_id AND status = 'reserved' AND used_credits = p_expected_used
  RETURNING requester_user_id INTO v_user;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF p_release_usd > 0 THEN
    PERFORM increment_user_balance(v_user, p_release_usd);
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['submissions', 'qa_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION jobs_set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- RLS on, no policies: only the service role reads or writes these tables.
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_usage_log ENABLE ROW LEVEL SECURITY;

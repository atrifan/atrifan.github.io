-- Gigs job room: messages, milestones, steering requests, activity; agent identities per client.
--
-- Builds on 20261101_jobs_core.sql. Names are deliberately NOT schema-qualified, so the same
-- file applies to `public` in Supabase and to a throwaway schema in tests.
-- Every row carries the contract it belongs to; server code checks that the caller is a party.
-- `seq` columns give polling clients a strictly increasing cursor (`?since=<seq>`).

-- ---------- agent identities: one per (user, OAuth client) and per (user, API key) ----------
-- jobs_core made oauth_client_id globally unique, but the OAuth proxy issues tokens for one
-- Clerk OAuth app, so two users can share a client id. Scope it to the owner instead.
ALTER TABLE agent_identities DROP CONSTRAINT IF EXISTS agent_identities_oauth_client_id_key;
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS client_kind TEXT NOT NULL DEFAULT 'oauth'
  CHECK (client_kind IN ('oauth', 'api_key', 'test'));
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS api_key_id UUID;
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS agent_identities_user_oauth_client
  ON agent_identities (user_id, client_kind, oauth_client_id) WHERE oauth_client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_identities_user_api_key
  ON agent_identities (user_id, api_key_id) WHERE api_key_id IS NOT NULL;

-- ---------- messages (chat and progress posts) ----------
CREATE TABLE IF NOT EXISTS job_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT,                                -- author (NULL for system messages)
  author_principal_id UUID REFERENCES principals(id),
  agent_identity_id UUID REFERENCES agent_identities(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('customer', 'provider', 'system')),
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'progress', 'system')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 12000),
  metadata JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((author_role = 'system') = (user_id IS NULL))
);
CREATE INDEX IF NOT EXISTS job_messages_contract_seq_idx ON job_messages (contract_id, seq);

-- ---------- milestones ----------
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                       -- who created it (the provider)
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
  position INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS milestones_contract_idx ON milestones (contract_id, position, created_at);
CREATE INDEX IF NOT EXISTS milestones_contract_updated_idx ON milestones (contract_id, updated_at);

-- ---------- steering requests ----------
CREATE TABLE IF NOT EXISTS steering_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                       -- the customer who asked
  requested_by_principal_id UUID NOT NULL REFERENCES principals(id),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  requested_kind TEXT CHECK (requested_kind IS NULL OR requested_kind IN ('clarification', 'revision', 'scope_change')),
  kind TEXT NOT NULL CHECK (kind IN ('clarification', 'revision', 'scope_change')),
  classifier_output JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(classifier_output) = 'object'),
  credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost IN (0, 1)),
  spec_changes JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(spec_changes) = 'array'),
  proposed_price_cents INTEGER CHECK (proposed_price_cents IS NULL OR proposed_price_cents > 0),
  proposed_deadline TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN (
    'open', 'awaiting_estimate', 'awaiting_provider', 'awaiting_approval',
    'answered', 'resolved', 'approved', 'rejected', 'declined', 'cancelled'
  )),
  -- the provider's answer / re-estimate
  response TEXT CHECK (response IS NULL OR length(response) <= 5000),
  responded_by TEXT,
  responded_at TIMESTAMPTZ,
  estimate_delta_cents INTEGER,
  estimate_eta_days INTEGER CHECK (estimate_eta_days IS NULL OR estimate_eta_days BETWEEN 1 AND 365),
  deliverable_changes JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(deliverable_changes) = 'array'),
  -- the contract terms this request started from, and the version it proposes
  base_contract_version_id UUID NOT NULL REFERENCES contract_versions(id),
  new_contract_version_id UUID REFERENCES contract_versions(id),
  -- top-up when an approved scope change raises the price
  topup_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (topup_amount_cents >= 0),
  topup_status TEXT NOT NULL DEFAULT 'none' CHECK (topup_status IN ('none', 'pending', 'paid', 'expired')),
  topup_checkout_session_id TEXT UNIQUE,
  topup_checkout_url TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind = 'scope_change' OR new_contract_version_id IS NULL),
  CHECK (kind = 'revision' OR credit_cost = 0)
);
CREATE INDEX IF NOT EXISTS steering_requests_contract_idx ON steering_requests (contract_id, created_at);
CREATE INDEX IF NOT EXISTS steering_requests_contract_updated_idx ON steering_requests (contract_id, updated_at);
-- One open scope change per contract at a time: each one proposes the next contract version.
CREATE UNIQUE INDEX IF NOT EXISTS steering_requests_one_open_scope_change
  ON steering_requests (contract_id)
  WHERE kind = 'scope_change' AND status IN ('awaiting_estimate', 'awaiting_provider', 'awaiting_approval');

-- ---------- activity feed ----------
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT,                                -- the actor (NULL for system events)
  actor_role TEXT NOT NULL CHECK (actor_role IN ('customer', 'provider', 'system')),
  agent_identity_id UUID REFERENCES agent_identities(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 100),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  data JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_events_contract_seq_idx ON activity_events (contract_id, seq);

-- updated_at triggers (jobs_set_updated_at comes from jobs_core)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['milestones', 'steering_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION jobs_set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- RLS on, no policies: only the service role reads or writes these tables.
ALTER TABLE job_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE steering_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

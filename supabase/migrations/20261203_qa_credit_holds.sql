-- QA follow-up on 20261201_qa.sql (already applied): credit holds, so concurrent review calls
-- on /api/chat can't overshoot a submission's QA reserve. Unqualified names, like the other
-- gigs migrations.

-- An in-flight review call holds its worst-case cost (input estimate + output cap, with the
-- markup) until it is metered. New calls only start if cap - used - live holds covers their
-- own hold. Holds expire, so a crashed call can't block the reserve for long.
CREATE TABLE IF NOT EXISTS qa_credit_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_request_id UUID NOT NULL REFERENCES qa_requests(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL,
  credits NUMERIC(12, 2) NOT NULL CHECK (credits > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS qa_credit_holds_request_idx ON qa_credit_holds (qa_request_id, expires_at);
ALTER TABLE qa_credit_holds ENABLE ROW LEVEL SECURITY;

-- Take a hold for one review call. Locks the qa_requests row, so concurrent holds on one
-- reserve are serialized and can never add up to more than what is left.
CREATE OR REPLACE FUNCTION qa_hold_credits(p_api_key_id UUID, p_credits NUMERIC, p_ttl_seconds INTEGER DEFAULT 900)
RETURNS JSONB AS $$
DECLARE
  k RECORD;
  r RECORD;
  v_cap NUMERIC;
  v_held NUMERIC;
  v_available NUMERIC;
  v_hold_id UUID;
BEGIN
  SELECT id, submission_id, cap_credits INTO k
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
  DELETE FROM qa_credit_holds WHERE qa_request_id = r.id AND expires_at <= NOW();
  v_cap := LEAST(r.platform_credits + r.reserved_credits, k.cap_credits);
  SELECT COALESCE(SUM(credits), 0) INTO v_held FROM qa_credit_holds WHERE qa_request_id = r.id;
  v_available := GREATEST(v_cap - r.used_credits - v_held, 0);
  IF COALESCE(p_credits, 0) <= 0 OR p_credits > v_available THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_reserve',
      'cap', v_cap, 'used', r.used_credits, 'held', v_held, 'available', v_available);
  END IF;
  INSERT INTO qa_credit_holds (qa_request_id, api_key_id, credits, expires_at)
  VALUES (r.id, k.id, p_credits, NOW() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 900), 1)))
  RETURNING id INTO v_hold_id;
  RETURN jsonb_build_object('ok', true, 'hold_id', v_hold_id, 'cap', v_cap, 'used', r.used_credits,
    'held', v_held + p_credits, 'available', v_available - p_credits);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION qa_release_hold(p_hold_id UUID)
RETURNS VOID AS $$
  DELETE FROM qa_credit_holds WHERE id = p_hold_id;
$$ LANGUAGE sql;

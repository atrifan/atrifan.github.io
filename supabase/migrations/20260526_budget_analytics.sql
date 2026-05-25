-- Table: balance_transactions (records deposits, refunds, adjustments)
CREATE TABLE IF NOT EXISTS balance_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'deposit',
  amount NUMERIC(10, 4) NOT NULL,
  stripe_session_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_user ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_user_created ON balance_transactions(user_id, created_at);

ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to balance_transactions"
  ON balance_transactions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add api_key_id to paid_usage_analytics for per-device tracking
ALTER TABLE paid_usage_analytics ADD COLUMN IF NOT EXISTS api_key_id UUID;
CREATE INDEX IF NOT EXISTS idx_paid_usage_apikey ON paid_usage_analytics(api_key_id);

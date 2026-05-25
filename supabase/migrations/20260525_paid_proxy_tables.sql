-- Table: user_budgets
CREATE TABLE IF NOT EXISTS user_budgets (
  user_id TEXT PRIMARY KEY,
  remaining_balance NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_budgets_status ON user_budgets(status);

-- Table: paid_usage_analytics
CREATE TABLE IF NOT EXISTS paid_usage_analytics (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_session_id TEXT,
  provider TEXT,
  model_name TEXT,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  cost_deducted NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paid_usage_user ON paid_usage_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_paid_usage_created ON paid_usage_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_paid_usage_user_created ON paid_usage_analytics(user_id, created_at);

-- Function: increment_user_balance (atomic UPSERT - adds funds)
CREATE OR REPLACE FUNCTION increment_user_balance(
  target_user_id TEXT,
  amount_to_add NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_budgets (user_id, remaining_balance, status, updated_at)
  VALUES (target_user_id, amount_to_add, 'active', NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    remaining_balance = user_budgets.remaining_balance + amount_to_add,
    status = 'active',
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: deduct_user_balance (atomic deduction - prevents over-deduction)
CREATE OR REPLACE FUNCTION deduct_user_balance(
  target_user_id TEXT,
  amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE user_budgets
  SET remaining_balance = remaining_balance - amount,
      updated_at = NOW()
  WHERE user_id = target_user_id
    AND remaining_balance >= amount
  RETURNING remaining_balance INTO new_balance;

  RETURN COALESCE(new_balance, -1);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE user_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_usage_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to user_budgets"
  ON user_budgets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to paid_usage_analytics"
  ON paid_usage_analytics FOR ALL
  USING (true)
  WITH CHECK (true);

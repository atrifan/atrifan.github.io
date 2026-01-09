-- User Budget Settings Table
-- Stores user's monthly AI budget configuration

CREATE TABLE IF NOT EXISTS user_budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  
  -- Monthly budget in USD (default $5)
  monthly_budget_usd DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  
  -- Alert thresholds (percentage of budget)
  alert_threshold_50 BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_80 BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_100 BOOLEAN NOT NULL DEFAULT true,
  
  -- Whether to hard-stop at budget limit or allow overage
  hard_limit BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_budget_settings_user ON user_budget_settings(user_id);

-- RLS Policies
ALTER TABLE user_budget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budget settings" ON user_budget_settings
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own budget settings" ON user_budget_settings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own budget settings" ON user_budget_settings
  FOR UPDATE USING (true);

-- Function to get or create user budget settings
CREATE OR REPLACE FUNCTION get_or_create_user_budget(p_user_id TEXT)
RETURNS TABLE(
  monthly_budget_usd DECIMAL,
  hard_limit BOOLEAN,
  alert_threshold_50 BOOLEAN,
  alert_threshold_80 BOOLEAN,
  alert_threshold_100 BOOLEAN
) AS $$
BEGIN
  -- Try to insert default settings (will do nothing if exists)
  INSERT INTO user_budget_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Return the settings
  RETURN QUERY
  SELECT 
    s.monthly_budget_usd,
    s.hard_limit,
    s.alert_threshold_50,
    s.alert_threshold_80,
    s.alert_threshold_100
  FROM user_budget_settings s
  WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get detailed budget usage per model
CREATE OR REPLACE FUNCTION get_user_budget_usage(p_user_id TEXT)
RETURNS TABLE(
  model_id TEXT,
  input_tokens BIGINT,
  output_tokens BIGINT,
  total_tokens BIGINT,
  cost_usd DECIMAL,
  request_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.model_id,
    COALESCE(SUM(u.input_tokens), 0)::BIGINT,
    COALESCE(SUM(u.output_tokens), 0)::BIGINT,
    COALESCE(SUM(u.input_tokens + u.output_tokens), 0)::BIGINT,
    COALESCE(SUM(u.cost_usd), 0)::DECIMAL,
    COUNT(*)::BIGINT
  FROM ai_token_usage u
  WHERE u.user_id = p_user_id
    AND u.created_at >= DATE_TRUNC('month', NOW())
    AND u.created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
  GROUP BY u.model_id;
END;
$$ LANGUAGE plpgsql;


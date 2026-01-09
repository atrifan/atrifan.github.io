-- AI Token Usage Tracking
-- Tracks token consumption per user per model for billing and quota management

-- Token usage table
CREATE TABLE IF NOT EXISTS ai_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  conversation_id UUID,
  message_type TEXT DEFAULT 'chat', -- 'chat', 'embedding', 'tool-call'
  
  CONSTRAINT positive_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0)
);

-- Monthly aggregation view for quick quota checks
CREATE OR REPLACE VIEW ai_token_usage_monthly AS
SELECT 
  user_id,
  model_id,
  DATE_TRUNC('month', created_at) AS month,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS request_count
FROM ai_token_usage
GROUP BY user_id, model_id, DATE_TRUNC('month', created_at);

-- User monthly totals (across all models)
CREATE OR REPLACE VIEW ai_user_monthly_totals AS
SELECT 
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) AS request_count
FROM ai_token_usage
GROUP BY user_id, DATE_TRUNC('month', created_at);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_id ON ai_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_created_at ON ai_token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_month ON ai_token_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_model ON ai_token_usage(model_id);

-- Rate limiting table (for throttling)
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL, -- 'minute', 'hour'
  request_count INTEGER NOT NULL DEFAULT 1,
  
  UNIQUE(user_id, window_start, window_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user ON ai_rate_limits(user_id, window_start);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id TEXT,
  p_window_type TEXT,
  p_max_requests INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  -- Calculate window start
  IF p_window_type = 'minute' THEN
    v_window_start := DATE_TRUNC('minute', NOW());
  ELSE
    v_window_start := DATE_TRUNC('hour', NOW());
  END IF;
  
  -- Try to insert or update
  INSERT INTO ai_rate_limits (user_id, window_start, window_type, request_count)
  VALUES (p_user_id, v_window_start, p_window_type, 1)
  ON CONFLICT (user_id, window_start, window_type)
  DO UPDATE SET request_count = ai_rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;
  
  -- Check if within limit
  RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;

-- Function to get current month usage for a user
CREATE OR REPLACE FUNCTION get_user_monthly_usage(p_user_id TEXT)
RETURNS TABLE(total_tokens BIGINT, total_cost DECIMAL, request_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(u.total_tokens), 0)::BIGINT,
    COALESCE(SUM(u.cost_usd), 0)::DECIMAL,
    COALESCE(COUNT(*), 0)::BIGINT
  FROM ai_token_usage u
  WHERE u.user_id = p_user_id
    AND u.created_at >= DATE_TRUNC('month', NOW())
    AND u.created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

-- Cleanup old rate limit records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM ai_rate_limits WHERE window_start < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage
CREATE POLICY "Users can view own token usage" ON ai_token_usage
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can view own rate limits" ON ai_rate_limits
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

-- Service role can do everything
CREATE POLICY "Service role full access to token usage" ON ai_token_usage
  FOR ALL USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role full access to rate limits" ON ai_rate_limits
  FOR ALL USING (current_setting('role', true) = 'service_role');


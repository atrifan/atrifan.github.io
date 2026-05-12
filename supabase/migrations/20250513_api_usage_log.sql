-- API usage tracking for plugin/native-host requests
CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'request',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_log_user_id ON api_usage_log(user_id);
CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_log_user_created ON api_usage_log(user_id, created_at DESC);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON api_usage_log
  FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');

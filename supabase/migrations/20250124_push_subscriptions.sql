-- Push Notification Subscriptions
-- Stores Web Push API subscriptions for browser/mobile notifications

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Web Push subscription data
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,  -- Public key for encryption
  auth_key TEXT NOT NULL,    -- Auth secret for encryption
  
  -- Device/browser info for management
  device_name TEXT,          -- User-friendly name (e.g., "Chrome on MacBook")
  device_type TEXT,          -- 'desktop', 'mobile', 'tablet'
  browser TEXT,              -- 'chrome', 'firefox', 'safari', 'edge'
  os TEXT,                   -- 'macos', 'windows', 'ios', 'android', 'linux'
  
  -- Notification preferences
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Notification channels (what types of notifications to receive)
  channels JSONB NOT NULL DEFAULT '["automation", "input_required", "error"]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,  -- Last time a notification was sent to this subscription
  
  -- Unique constraint: one subscription per endpoint per user
  UNIQUE(user_id, endpoint)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Index for finding active subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled ON push_subscriptions(user_id, enabled) WHERE enabled = true;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own subscriptions
CREATE POLICY push_subscriptions_select ON push_subscriptions
  FOR SELECT USING (user_id = current_setting('app.user_id', true));

-- Users can only insert their own subscriptions
CREATE POLICY push_subscriptions_insert ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = current_setting('app.user_id', true));

-- Users can only update their own subscriptions
CREATE POLICY push_subscriptions_update ON push_subscriptions
  FOR UPDATE USING (user_id = current_setting('app.user_id', true));

-- Users can only delete their own subscriptions
CREATE POLICY push_subscriptions_delete ON push_subscriptions
  FOR DELETE USING (user_id = current_setting('app.user_id', true));

-- Comment on table
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscriptions for browser/mobile notifications';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL from PushSubscription';
COMMENT ON COLUMN push_subscriptions.p256dh_key IS 'Base64-encoded P-256 ECDH public key';
COMMENT ON COLUMN push_subscriptions.auth_key IS 'Base64-encoded authentication secret';
COMMENT ON COLUMN push_subscriptions.channels IS 'Array of notification types: automation, input_required, error, marketing';


-- Multi-device key management: allow multiple API keys per user (one per device)

-- 1. Drop the old single-key constraint
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS uq_api_keys_user_server;

-- 2. Add device_name column (backfill existing rows as 'default')
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS device_name TEXT NOT NULL DEFAULT 'default';

-- 3. New unique: one key per user + server + device
ALTER TABLE api_keys ADD CONSTRAINT uq_api_keys_user_server_device
  UNIQUE (user_id, server_name, device_name);

-- 4. Create device_heartbeats table
CREATE TABLE IF NOT EXISTS device_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  hostname TEXT,
  platform TEXT,
  arch TEXT,
  model TEXT,
  extension_id TEXT,
  tokens_today_input INTEGER DEFAULT 0,
  tokens_today_output INTEGER DEFAULT 0,
  schedules_count INTEGER DEFAULT 0,
  active_tasks_count INTEGER DEFAULT 0,
  skills_loaded INTEGER DEFAULT 0,
  mcp_servers_connected INTEGER DEFAULT 0,
  ip_address TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_heartbeat_apikey ON device_heartbeats(api_key_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_user ON device_heartbeats(user_id);

ALTER TABLE device_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON device_heartbeats FOR ALL USING (true);

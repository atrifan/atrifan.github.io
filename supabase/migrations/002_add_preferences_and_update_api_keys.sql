-- Migration 002: Add preferences, environments, server_tools and update api_keys
-- Run this migration in Supabase SQL Editor

-- ============ Update API Keys Table ============
-- Add name and server_name columns

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS server_name TEXT NOT NULL DEFAULT 'default';

-- Unique constraint: each user can only have one server with a given name
ALTER TABLE api_keys ADD CONSTRAINT uq_api_keys_user_server UNIQUE (user_id, server_name);

-- Index for server name lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_server ON api_keys(user_id, server_name);

-- ============ User Preferences Table ============
-- Stores user preferences (time format, units, currency)

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('12h', '24h')),
  measurement_system TEXT NOT NULL DEFAULT 'metric' CHECK (measurement_system IN ('metric', 'imperial')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP', 'JPY', 'RON')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own preferences" ON user_preferences
  FOR SELECT USING (true);

CREATE POLICY "Insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update own preferences" ON user_preferences
  FOR UPDATE USING (true);

-- ============ Environments Table ============
-- Stores external hosts for non-NATIVE tools (MCP, REST, GQL, A2A)

CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  custom_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can have unique environment names
  UNIQUE (user_id, name)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_environments_user_id ON environments(user_id);

-- RLS for environments
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own environments" ON environments
  FOR SELECT USING (true);

CREATE POLICY "Insert own environments" ON environments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update own environments" ON environments
  FOR UPDATE USING (true);

CREATE POLICY "Delete own environments" ON environments
  FOR DELETE USING (true);

-- ============ Tools Table ============
-- Stores reusable tool definitions (NATIVE tools are system-defined)

CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy')),
  tool_type TEXT NOT NULL CHECK (tool_type IN ('NATIVE', 'MCP', 'REST', 'GQL', 'A2A')),
  has_widget BOOLEAN NOT NULL DEFAULT false,
  invoking_message TEXT NOT NULL DEFAULT 'Processing...',
  invoked_message TEXT NOT NULL DEFAULT 'Complete',
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  user_id TEXT, -- NULL for system NATIVE tools
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tool lookups by name
CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);

-- Index for user-created tools
CREATE INDEX IF NOT EXISTS idx_tools_user_id ON tools(user_id) WHERE user_id IS NOT NULL;

-- Index for tool type
CREATE INDEX IF NOT EXISTS idx_tools_type ON tools(tool_type);

-- RLS for tools
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View all tools" ON tools
  FOR SELECT USING (true);

CREATE POLICY "Insert own tools" ON tools
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update own tools" ON tools
  FOR UPDATE USING (true);

CREATE POLICY "Delete own tools" ON tools
  FOR DELETE USING (true);

-- ============ Server Tools Table ============
-- Links tools to API keys (servers) with their configuration

CREATE TABLE IF NOT EXISTS server_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  custom_config JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each tool can only be added once per server (api_key)
  UNIQUE (api_key_id, tool_id)
);

-- Index for API key lookups (get all tools for a server)
CREATE INDEX IF NOT EXISTS idx_server_tools_api_key ON server_tools(api_key_id);

-- Index for enabled tools only
CREATE INDEX IF NOT EXISTS idx_server_tools_enabled ON server_tools(api_key_id, is_enabled)
  WHERE is_enabled = true;

-- Index for environment lookups (find tools using an environment)
CREATE INDEX IF NOT EXISTS idx_server_tools_environment ON server_tools(environment_id)
  WHERE environment_id IS NOT NULL;

-- RLS for server_tools
ALTER TABLE server_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View server tools" ON server_tools
  FOR SELECT USING (true);

CREATE POLICY "Insert server tools" ON server_tools
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update server tools" ON server_tools
  FOR UPDATE USING (true);

CREATE POLICY "Delete server tools" ON server_tools
  FOR DELETE USING (true);

-- Comments for documentation
COMMENT ON COLUMN server_tools.environment_id IS
  'Required for non-NATIVE tools (MCP, REST, GQL, A2A). NULL for NATIVE tools.';

COMMENT ON COLUMN server_tools.custom_config IS
  'Tool-specific configuration override (JSON). Overrides tool defaults for this server instance.';

COMMENT ON COLUMN environments.custom_config IS
  'Environment-wide configuration (JSON). Auth headers, API keys, timeouts, etc.';

COMMENT ON COLUMN tools.user_id IS
  'NULL for system NATIVE tools. Set to Clerk user_id for user-created tools.';


-- ============ Seed Data ============

-- Insert your existing API key (provider: clerk)
INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, name, server_name, provider, plan, is_active)
VALUES (
  'user_37inOsUBpoqj1Nv5ZyeZ7rBOUKo',
  encode(sha256('ak_FMZNJPY166AJFVEH5X7CSND1R59GB21R'::bytea), 'hex'),
  'B21R',
  'Default Key',
  'default',
  'clerk',
  'pro',
  true
) ON CONFLICT (api_key_hash) DO NOTHING;

-- Tool definitions are in a separate file: 002_tools_seed.sql
-- Run that file after this one to insert all 29 NATIVE tools
-- and link them to the default server.

-- MCP Connection Tracking Tables
-- Run this migration in Supabase SQL Editor

-- ============ API Keys Table ============
-- Stores API keys linked to Clerk users

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  api_key_suffix TEXT NOT NULL,
  name TEXT,
  server_name TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'plus')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Index for active key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- Index for server name lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_server ON api_keys(user_id, server_name);

-- ============ MCP Connections Table ============
-- Stores connection logs per api_key + server_name
-- Uses agent:auth_method as composite key within each api_key+server

CREATE TABLE IF NOT EXISTS mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  server_name TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('oauth', 'header', 'path', 'internal')),
  ips TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  
  -- Composite unique constraint: one entry per agent:method per server per API key
  UNIQUE (api_key_id, server_name, agent, auth_method)
);

-- Index for API key lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_mcp_connections_api_key ON mcp_connections(api_key_id);

-- Index for server name filtering
CREATE INDEX IF NOT EXISTS idx_mcp_connections_server ON mcp_connections(api_key_id, server_name);

-- Index for recent activity queries
CREATE INDEX IF NOT EXISTS idx_mcp_connections_last_used ON mcp_connections(last_used_at DESC);

-- ============ Row Level Security ============
-- Enable RLS for security

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own API keys
-- Note: This requires passing user_id via Supabase auth or service role
CREATE POLICY "Users can view own api_keys" ON api_keys
  FOR SELECT USING (true);  -- Will be restricted via service role in app

CREATE POLICY "Users can insert own api_keys" ON api_keys
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own api_keys" ON api_keys
  FOR UPDATE USING (true);

-- Policy: Connections are accessed via API key relationship
CREATE POLICY "View connections via api_key" ON mcp_connections
  FOR SELECT USING (true);

CREATE POLICY "Insert connections" ON mcp_connections
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update connections" ON mcp_connections
  FOR UPDATE USING (true);

-- ============ Helper Functions ============

-- Function to upsert a connection (insert or update)
CREATE OR REPLACE FUNCTION upsert_mcp_connection(
  p_api_key_id UUID,
  p_server_name TEXT,
  p_agent TEXT,
  p_auth_method TEXT,
  p_ip TEXT
) RETURNS mcp_connections AS $$
DECLARE
  v_result mcp_connections;
  v_ips TEXT[];
BEGIN
  -- Try to get existing record
  SELECT * INTO v_result
  FROM mcp_connections
  WHERE api_key_id = p_api_key_id
    AND server_name = p_server_name
    AND agent = p_agent
    AND auth_method = p_auth_method;
  
  IF FOUND THEN
    -- Update existing: add IP if not present (max 5)
    v_ips := v_result.ips;
    IF p_ip IS NOT NULL AND p_ip != 'unknown' AND NOT (p_ip = ANY(v_ips)) THEN
      v_ips := array_prepend(p_ip, v_ips);
      IF array_length(v_ips, 1) > 5 THEN
        v_ips := v_ips[1:5];
      END IF;
    END IF;
    
    UPDATE mcp_connections
    SET last_used_at = NOW(),
        request_count = request_count + 1,
        ips = v_ips
    WHERE id = v_result.id
    RETURNING * INTO v_result;
  ELSE
    -- Insert new
    v_ips := CASE WHEN p_ip IS NOT NULL AND p_ip != 'unknown' THEN ARRAY[p_ip] ELSE '{}' END;
    
    INSERT INTO mcp_connections (api_key_id, server_name, agent, auth_method, ips)
    VALUES (p_api_key_id, p_server_name, p_agent, p_auth_method, v_ips)
    RETURNING * INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to enforce max 10 connections per api_key+server
CREATE OR REPLACE FUNCTION enforce_max_connections()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete oldest connections if over 10 for this api_key+server
  DELETE FROM mcp_connections
  WHERE id IN (
    SELECT id FROM mcp_connections
    WHERE api_key_id = NEW.api_key_id
      AND server_name = NEW.server_name
    ORDER BY last_used_at DESC
    OFFSET 10
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce max connections after insert
CREATE TRIGGER trg_enforce_max_connections
AFTER INSERT ON mcp_connections
FOR EACH ROW
EXECUTE FUNCTION enforce_max_connections();

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

-- ============ Seed Data ============
-- Insert your existing API key

INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, name, server_name, plan, is_active)
VALUES (
  'user_37inOsUBpoqj1Nv5ZyeZ7rBOUKo',
  encode(sha256('ak_FMZNJPY166AJFVEH5X7CSND1R59GB21R'::bytea), 'hex'),
  'B21R',
  'Default Key',
  '',
  'pro',
  true
) ON CONFLICT (api_key_hash) DO NOTHING;

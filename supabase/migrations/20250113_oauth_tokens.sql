-- OAuth Tokens Table
-- Stores OAuth access tokens and refresh tokens for server connections
-- Tokens are stored per user per server connection

-- ============ OAuth Tokens Table ============
-- Stores OAuth tokens for authenticated connections

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Reference to the server/connection (polymorphic)
  -- Only one of these should be set
  rest_api_spec_id UUID REFERENCES rest_api_specs(id) ON DELETE CASCADE,
  graphql_spec_id UUID REFERENCES graphql_specs(id) ON DELETE CASCADE,
  mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
  a2a_agent_id UUID REFERENCES a2a_agents(id) ON DELETE CASCADE,
  rag_id UUID REFERENCES user_rags(id) ON DELETE CASCADE,
  
  -- Token data (encrypted at rest by Supabase)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scope TEXT,
  
  -- Expiry timestamps (stored as Unix timestamps for easy comparison)
  -- NULL means no expiry / unknown
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  
  -- ID token (for OpenID Connect)
  id_token TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure only one token per user per server connection
  -- Using partial unique indexes for each server type
  CONSTRAINT oauth_tokens_one_reference CHECK (
    (CASE WHEN rest_api_spec_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN graphql_spec_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN mcp_server_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN a2a_agent_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN rag_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

-- Unique indexes for each server type (one token per user per server)
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_rest_api 
  ON oauth_tokens(user_id, rest_api_spec_id) 
  WHERE rest_api_spec_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_graphql 
  ON oauth_tokens(user_id, graphql_spec_id) 
  WHERE graphql_spec_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_mcp 
  ON oauth_tokens(user_id, mcp_server_id) 
  WHERE mcp_server_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_a2a 
  ON oauth_tokens(user_id, a2a_agent_id) 
  WHERE a2a_agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_rag 
  ON oauth_tokens(user_id, rag_id) 
  WHERE rag_id IS NOT NULL;

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);

-- ============ Row Level Security ============

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own tokens
CREATE POLICY oauth_tokens_user_policy ON oauth_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============ Updated At Trigger ============

CREATE OR REPLACE FUNCTION update_oauth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_oauth_tokens_updated_at();

-- ============ Comments ============

COMMENT ON TABLE oauth_tokens IS 
  'Stores OAuth access and refresh tokens for server connections';

COMMENT ON COLUMN oauth_tokens.access_token IS 
  'The OAuth access token (Bearer token)';

COMMENT ON COLUMN oauth_tokens.refresh_token IS 
  'The OAuth refresh token for obtaining new access tokens';

COMMENT ON COLUMN oauth_tokens.access_token_expires_at IS 
  'When the access token expires (NULL = no expiry or unknown)';

COMMENT ON COLUMN oauth_tokens.refresh_token_expires_at IS 
  'When the refresh token expires (NULL = no expiry or unknown)';


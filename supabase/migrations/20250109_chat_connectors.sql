-- Chat Connectors Table
-- Stores MCP servers and agents linked to chat conversations

CREATE TABLE IF NOT EXISTS chat_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Connector type: internal_mcp, external_mcp, internal_agent, external_agent
  connector_type TEXT NOT NULL CHECK (connector_type IN ('internal_mcp', 'external_mcp', 'internal_agent', 'external_agent')),
  
  -- For internal_mcp: reference to mcp_servers table
  mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
  
  -- For external_mcp: URL and auth config
  external_url TEXT,
  external_auth_type TEXT CHECK (external_auth_type IN ('none', 'api_key', 'bearer', 'basic')),
  external_auth_config JSONB DEFAULT '{}',
  external_headers JSONB DEFAULT '{}',
  
  -- Display info
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🔌',
  
  -- Status
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one connector per type per source per user
  UNIQUE (user_id, connector_type, mcp_server_id),
  UNIQUE (user_id, connector_type, external_url)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_connectors_user ON chat_connectors(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_connectors_type ON chat_connectors(connector_type);
CREATE INDEX IF NOT EXISTS idx_chat_connectors_enabled ON chat_connectors(is_enabled);

-- RLS Policies
ALTER TABLE chat_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connectors" ON chat_connectors
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own connectors" ON chat_connectors
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own connectors" ON chat_connectors
  FOR UPDATE USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete own connectors" ON chat_connectors
  FOR DELETE USING (user_id = current_setting('app.current_user_id', true));


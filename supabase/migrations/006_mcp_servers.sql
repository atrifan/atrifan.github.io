-- MCP Servers Table
-- Stores imported external MCP server configurations
-- Run this migration in Supabase SQL Editor

-- ============ MCP Servers Table ============
-- Stores external MCP server configurations that users import

CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  server_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  environment_name TEXT NOT NULL DEFAULT 'default',
  
  -- Authentication configuration
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic')),
  auth_config JSONB DEFAULT '{}',
  
  -- Default headers to send with every request
  default_headers JSONB DEFAULT '{}',
  
  -- Category for imported tools
  category TEXT NOT NULL DEFAULT 'Utilities',
  
  -- Server metadata from initialize response
  server_info JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one server per name per user
  UNIQUE (user_id, server_name)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_mcp_servers_user ON mcp_servers(user_id);

-- ============ MCP Server Tools Table ============
-- Stores tools imported from external MCP servers
-- Links to the tools table for the actual tool definition

CREATE TABLE IF NOT EXISTS mcp_server_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  
  -- Original tool name from the external server (before renaming)
  original_name TEXT NOT NULL,
  
  -- Original description from the external server
  original_description TEXT,
  
  -- Whether this tool supports widgets (from external server)
  has_widget BOOLEAN NOT NULL DEFAULT false,
  
  -- Whether this tool is enabled for import
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one tool per original name per server
  UNIQUE (mcp_server_id, original_name)
);

-- Index for server lookups
CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_server ON mcp_server_tools(mcp_server_id);

-- Index for tool lookups
CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_tool ON mcp_server_tools(tool_id);

-- ============ Row Level Security ============

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_server_tools ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own MCP servers
CREATE POLICY mcp_servers_user_policy ON mcp_servers
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Users can only see tools from their own MCP servers
CREATE POLICY mcp_server_tools_user_policy ON mcp_server_tools
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============ Updated At Trigger ============

CREATE OR REPLACE FUNCTION update_mcp_servers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION update_mcp_servers_updated_at();


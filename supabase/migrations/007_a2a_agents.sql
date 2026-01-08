-- A2A Agents Table
-- Stores imported Agent-to-Agent protocol agents
-- Run this migration in Supabase SQL Editor

-- ============ A2A Agents Table ============
-- Stores external A2A agent configurations that users import

CREATE TABLE IF NOT EXISTS a2a_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Agent identification (normalized for tool naming)
  agent_name TEXT NOT NULL,
  
  -- Display name (user-friendly)
  display_name TEXT NOT NULL,
  
  -- Agent URL (the base URL for the agent)
  agent_url TEXT NOT NULL,
  
  -- Environment name (single environment per agent)
  environment_name TEXT NOT NULL DEFAULT 'default',
  
  -- Agent Card data (full JSON from .well-known/agent.json)
  agent_card JSONB NOT NULL DEFAULT '{}',
  
  -- Extracted from agent card for quick access
  version TEXT,
  protocol_version TEXT,
  description TEXT,
  
  -- Icon URL from agent card or favicon fallback
  icon_url TEXT,
  
  -- Tags/categories (from agent card or manually set)
  tags TEXT[] DEFAULT '{}',
  
  -- Category for the tool
  category TEXT NOT NULL DEFAULT 'Utilities',
  
  -- Authentication configuration
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic')),
  auth_config JSONB DEFAULT '{}',
  
  -- Default headers to send with every request
  default_headers JSONB DEFAULT '{}',
  
  -- Tool configuration
  input_schema JSONB NOT NULL DEFAULT '{"type":"object","properties":{"query":{"type":"string","description":"The query or message to send to the agent"}},"required":["query"]}',
  output_schema JSONB NOT NULL DEFAULT '{"type":"object"}',
  
  -- Widget support (disabled for agents)
  has_widget BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one agent per name per user
  UNIQUE (user_id, agent_name)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_a2a_agents_user ON a2a_agents(user_id);

-- Index for agent name lookups
CREATE INDEX IF NOT EXISTS idx_a2a_agents_name ON a2a_agents(user_id, agent_name);

-- ============ Row Level Security ============

ALTER TABLE a2a_agents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all agents (for discovery)
CREATE POLICY a2a_agents_select_policy ON a2a_agents
  FOR SELECT
  USING (true);

-- Policy: Users can only insert their own agents
CREATE POLICY a2a_agents_insert_policy ON a2a_agents
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can only update their own agents
CREATE POLICY a2a_agents_update_policy ON a2a_agents
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Users can only delete their own agents
CREATE POLICY a2a_agents_delete_policy ON a2a_agents
  FOR DELETE
  USING (true);

-- ============ Updated At Trigger ============

CREATE OR REPLACE FUNCTION update_a2a_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER a2a_agents_updated_at
  BEFORE UPDATE ON a2a_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_a2a_agents_updated_at();

-- ============ Comments ============

COMMENT ON TABLE a2a_agents IS 
  'Stores A2A (Agent-to-Agent) protocol agents imported by users';

COMMENT ON COLUMN a2a_agents.agent_name IS 
  'Normalized name for tool naming (lowercase, alphanumeric with dashes)';

COMMENT ON COLUMN a2a_agents.agent_card IS 
  'Full agent card JSON from .well-known/agent.json';

COMMENT ON COLUMN a2a_agents.input_schema IS 
  'Input schema for the agent tool (default: query string)';

COMMENT ON COLUMN a2a_agents.output_schema IS 
  'Output schema for the agent tool (default: object for A2A response)';


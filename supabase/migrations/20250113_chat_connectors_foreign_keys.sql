-- Migration: Add proper foreign keys to chat_connectors
-- This ensures data integrity when entities are deleted (CASCADE DELETE)

-- ============ Add a2a_agent_id column ============
-- For external_agent connectors, reference the a2a_agents table
ALTER TABLE chat_connectors 
ADD COLUMN IF NOT EXISTS a2a_agent_id UUID REFERENCES a2a_agents(id) ON DELETE CASCADE;

-- ============ Add api_key_id column ============
-- For internal_mcp connectors that reference api_keys
ALTER TABLE chat_connectors 
ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE;

-- ============ Migrate existing data ============

-- Migrate external_agent connectors: extract agent_id from a2a_agents by matching agent_url
UPDATE chat_connectors cc
SET a2a_agent_id = (
  SELECT a.id 
  FROM a2a_agents a 
  WHERE a.agent_url = cc.external_url 
    AND a.user_id = cc.user_id
  LIMIT 1
)
WHERE cc.connector_type = 'external_agent' 
  AND cc.a2a_agent_id IS NULL
  AND cc.external_url IS NOT NULL;

-- Migrate internal_mcp connectors: extract api_key_id from external_url pattern "api_key:<uuid>"
UPDATE chat_connectors cc
SET api_key_id = (
  CASE 
    WHEN cc.external_url LIKE 'api_key:%' 
    THEN CAST(SUBSTRING(cc.external_url FROM 9) AS UUID)
    ELSE NULL
  END
)
WHERE cc.connector_type = 'internal_mcp' 
  AND cc.api_key_id IS NULL
  AND cc.external_url LIKE 'api_key:%';

-- ============ Create indexes ============
CREATE INDEX IF NOT EXISTS idx_chat_connectors_a2a_agent_id 
ON chat_connectors(a2a_agent_id) 
WHERE a2a_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_connectors_api_key_id 
ON chat_connectors(api_key_id) 
WHERE api_key_id IS NOT NULL;

-- ============ Update unique constraints ============
-- Drop old constraints that don't include the new columns
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_user_type_url_context_key;

-- Add new unique constraint for a2a_agent_id
ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_agent_context_key
UNIQUE (user_id, connector_type, a2a_agent_id, context);

-- Add new unique constraint for api_key_id  
ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_apikey_context_key
UNIQUE (user_id, connector_type, api_key_id, context);

-- Keep external_url constraint for external_mcp that don't have mcp_server_id
ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_url_context_key
UNIQUE (user_id, connector_type, external_url, context);

-- ============ Comments ============
COMMENT ON COLUMN chat_connectors.a2a_agent_id IS 
  'Reference to a2a_agents table for external_agent connectors (CASCADE DELETE)';

COMMENT ON COLUMN chat_connectors.api_key_id IS 
  'Reference to api_keys table for internal_mcp connectors (CASCADE DELETE)';


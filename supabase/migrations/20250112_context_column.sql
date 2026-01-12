-- Add context column to chat_active_personalities
-- Values: 'chat' or 'automation'
ALTER TABLE chat_active_personalities
ADD COLUMN IF NOT EXISTS context VARCHAR(20) DEFAULT 'chat';

-- Update existing rows to 'chat' (default)
UPDATE chat_active_personalities
SET context = 'chat'
WHERE context IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE chat_active_personalities
ALTER COLUMN context SET NOT NULL;

-- Add context column to chat_connectors
-- Values: 'chat' or 'automation'
ALTER TABLE chat_connectors
ADD COLUMN IF NOT EXISTS context VARCHAR(20) DEFAULT 'chat';

-- Update existing rows to 'chat' (default)
UPDATE chat_connectors
SET context = 'chat'
WHERE context IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE chat_connectors
ALTER COLUMN context SET NOT NULL;

-- Update unique constraint for chat_active_personalities to include context
-- First drop the old constraint if it exists
ALTER TABLE chat_active_personalities
DROP CONSTRAINT IF EXISTS chat_active_personalities_user_id_personality_id_key;

-- Create new unique constraint including context
ALTER TABLE chat_active_personalities
ADD CONSTRAINT chat_active_personalities_user_personality_context_key
UNIQUE (user_id, personality_id, context);

-- Update unique constraint for chat_connectors to include context
-- Drop the old constraint that doesn't include context
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_user_id_connector_type_mcp_server_id_key;

-- Create new unique constraint including context
-- This allows the same connector to exist in both 'chat' and 'automation' contexts
ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_server_context_key
UNIQUE (user_id, connector_type, mcp_server_id, context);

-- Also update any constraint on external_url to include context
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_user_id_connector_type_external_url_key;

ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_url_context_key
UNIQUE (user_id, connector_type, external_url, context);

-- Create indexes for faster lookups by context
CREATE INDEX IF NOT EXISTS idx_chat_active_personalities_context
ON chat_active_personalities(user_id, context);

CREATE INDEX IF NOT EXISTS idx_chat_connectors_context
ON chat_connectors(user_id, context);


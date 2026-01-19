-- Migration: Replace api_key_id references with user_id + server_name
-- 
-- Problem: api_key_id can change when keys are revoked/regenerated
-- Solution: Use user_id + server_name as the stable reference
--
-- Tables affected:
-- 1. server_tools - links tools to servers
-- 2. chat_connectors - has api_key_id for internal_mcp connectors

-- ============ server_tools: Add user_id and server_name ============

-- Add new columns
ALTER TABLE server_tools
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS server_name TEXT DEFAULT 'default';

-- Migrate data: copy user_id and server_name from api_keys
UPDATE server_tools st
SET 
  user_id = ak.user_id,
  server_name = ak.server_name
FROM api_keys ak
WHERE st.api_key_id = ak.id
  AND st.user_id IS NULL;

-- Make user_id NOT NULL after migration
ALTER TABLE server_tools
ALTER COLUMN user_id SET NOT NULL;

-- Drop old foreign key constraint
ALTER TABLE server_tools
DROP CONSTRAINT IF EXISTS server_tools_api_key_id_fkey;

-- Drop old unique constraint
ALTER TABLE server_tools
DROP CONSTRAINT IF EXISTS server_tools_api_key_id_tool_id_key;

-- Add new unique constraint (user_id + server_name + tool_id)
ALTER TABLE server_tools
ADD CONSTRAINT server_tools_user_server_tool_key 
UNIQUE (user_id, server_name, tool_id);

-- Drop old column
ALTER TABLE server_tools
DROP COLUMN IF EXISTS api_key_id;

-- Create new indexes
DROP INDEX IF EXISTS idx_server_tools_api_key;
DROP INDEX IF EXISTS idx_server_tools_enabled;

CREATE INDEX IF NOT EXISTS idx_server_tools_user_server 
ON server_tools(user_id, server_name);

CREATE INDEX IF NOT EXISTS idx_server_tools_user_enabled 
ON server_tools(user_id, server_name, is_enabled)
WHERE is_enabled = true;

-- ============ chat_connectors: Add server_name, migrate from api_key_id ============

-- Add server_name column
ALTER TABLE chat_connectors
ADD COLUMN IF NOT EXISTS server_name TEXT;

-- Migrate data: copy server_name from api_keys
UPDATE chat_connectors cc
SET server_name = ak.server_name
FROM api_keys ak
WHERE cc.api_key_id = ak.id
  AND cc.server_name IS NULL
  AND cc.api_key_id IS NOT NULL;

-- Set default for any remaining nulls
UPDATE chat_connectors
SET server_name = 'default'
WHERE connector_type = 'internal_mcp'
  AND server_name IS NULL;

-- Drop old constraint that uses api_key_id
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_user_type_apikey_context_key;

-- Drop and recreate new constraint using server_name (idempotent)
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_user_type_server_context_key;

ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_user_type_server_context_key
UNIQUE (user_id, connector_type, server_name, context);

-- Drop old index
DROP INDEX IF EXISTS idx_chat_connectors_api_key_id;

-- Create new index
CREATE INDEX IF NOT EXISTS idx_chat_connectors_server_name
ON chat_connectors(user_id, server_name)
WHERE server_name IS NOT NULL;

-- Drop api_key_id column (no longer needed)
ALTER TABLE chat_connectors
DROP COLUMN IF EXISTS api_key_id;

-- ============ Comments ============

COMMENT ON COLUMN server_tools.user_id IS 
  'Clerk user ID who owns this server-tool link';

COMMENT ON COLUMN server_tools.server_name IS 
  'Server name (matches api_keys.server_name). Default is "default"';

COMMENT ON COLUMN chat_connectors.server_name IS 
  'Server name for internal_mcp connectors (replaces api_key_id reference)';

-- ============ Update TypeScript types reminder ============
-- After running this migration, update src/types/supabase.ts:
-- 1. ServerToolRow: replace api_key_id with user_id + server_name
-- 2. ServerToolInsert: replace api_key_id with user_id + server_name
-- 3. ChatConnectorRow: add server_name, remove api_key_id


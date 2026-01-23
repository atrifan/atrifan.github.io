-- Migration: Store API key plaintext for automation tool execution
-- The key is encrypted at rest by Supabase, so this is safe

-- Add column to store the plaintext API key
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Index for fast lookups (we still keep the hash for validation from external requests)
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys(user_id, is_active);

-- Comment explaining the column
COMMENT ON COLUMN api_keys.api_key IS 
  'Plaintext API key for internal use (automation, tool execution). Encrypted at rest by Supabase.';


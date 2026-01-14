-- Migration: Add OAuth2 support to chat_connectors and token sharing
-- This migration:
-- 1. Adds 'oauth2' to the external_auth_type CHECK constraint
-- 2. Adds oauth_provider_hash to oauth_tokens for token sharing across connectors

-- ============ chat_connectors: Add oauth2 auth type ============

-- Drop the existing constraint
ALTER TABLE chat_connectors
DROP CONSTRAINT IF EXISTS chat_connectors_external_auth_type_check;

-- Add new constraint with oauth2 support
ALTER TABLE chat_connectors
ADD CONSTRAINT chat_connectors_external_auth_type_check
CHECK (external_auth_type IN ('none', 'api_key', 'bearer', 'basic', 'oauth2'));

-- Add comment
COMMENT ON COLUMN chat_connectors.external_auth_type IS
  'Authentication type for external connectors. For oauth2: external_auth_config contains {authorization_endpoint, token_endpoint, scopes, use_dcr, client_id, client_secret, registration_endpoint}';

-- ============ oauth_tokens: Add provider hash for token sharing ============

-- Add oauth_provider_hash column to identify tokens by OAuth provider
-- This allows sharing tokens across connectors that use the same OAuth server
-- Hash is computed from: token_endpoint + client_id
ALTER TABLE oauth_tokens
ADD COLUMN IF NOT EXISTS oauth_provider_hash TEXT;

-- Drop the constraint that requires exactly one server reference
-- Now tokens can be shared (no server reference) or specific to a server
ALTER TABLE oauth_tokens
DROP CONSTRAINT IF EXISTS oauth_tokens_one_reference;

-- Add new constraint: either has a provider hash OR exactly one server reference
ALTER TABLE oauth_tokens
ADD CONSTRAINT oauth_tokens_reference_check CHECK (
  oauth_provider_hash IS NOT NULL OR
  (CASE WHEN rest_api_spec_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN graphql_spec_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN mcp_server_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN a2a_agent_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN rag_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- Index for provider hash lookups (one token per user per provider)
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_provider
  ON oauth_tokens(user_id, oauth_provider_hash)
  WHERE oauth_provider_hash IS NOT NULL;

-- Add comment
COMMENT ON COLUMN oauth_tokens.oauth_provider_hash IS
  'Hash of token_endpoint + client_id to identify OAuth provider. Allows token sharing across connectors using the same OAuth server.';


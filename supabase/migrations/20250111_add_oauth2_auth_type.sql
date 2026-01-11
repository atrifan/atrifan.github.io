-- Migration: Add OAuth2 authentication type support
-- This migration adds 'oauth2' to the auth_type CHECK constraint on all import tables
-- and adds 'custom' to mcp_servers and a2a_agents for consistency

-- ============ rest_api_specs ============
-- Already has: 'none', 'bearer', 'api_key', 'basic', 'custom'
-- Adding: 'oauth2'

ALTER TABLE rest_api_specs 
DROP CONSTRAINT IF EXISTS rest_api_specs_auth_type_check;

ALTER TABLE rest_api_specs 
ADD CONSTRAINT rest_api_specs_auth_type_check 
CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic', 'custom', 'oauth2'));

-- ============ graphql_specs ============
-- Already has: 'none', 'bearer', 'api_key', 'basic', 'custom'
-- Adding: 'oauth2'

ALTER TABLE graphql_specs 
DROP CONSTRAINT IF EXISTS graphql_specs_auth_type_check;

ALTER TABLE graphql_specs 
ADD CONSTRAINT graphql_specs_auth_type_check 
CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic', 'custom', 'oauth2'));

-- ============ mcp_servers ============
-- Currently has: 'none', 'api_key', 'bearer', 'basic'
-- Adding: 'custom', 'oauth2'

ALTER TABLE mcp_servers 
DROP CONSTRAINT IF EXISTS mcp_servers_auth_type_check;

ALTER TABLE mcp_servers 
ADD CONSTRAINT mcp_servers_auth_type_check 
CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic', 'custom', 'oauth2'));

-- ============ a2a_agents ============
-- Currently has: 'none', 'api_key', 'bearer', 'basic'
-- Adding: 'custom', 'oauth2'

ALTER TABLE a2a_agents 
DROP CONSTRAINT IF EXISTS a2a_agents_auth_type_check;

ALTER TABLE a2a_agents 
ADD CONSTRAINT a2a_agents_auth_type_check 
CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic', 'custom', 'oauth2'));

-- ============ Comments ============

COMMENT ON COLUMN rest_api_specs.auth_config IS 
  'Auth configuration JSON. For oauth2: {authorization_endpoint, token_endpoint, scopes, use_dcr, client_id, client_secret, registration_endpoint}';

COMMENT ON COLUMN graphql_specs.auth_config IS 
  'Auth configuration JSON. For oauth2: {authorization_endpoint, token_endpoint, scopes, use_dcr, client_id, client_secret, registration_endpoint}';

COMMENT ON COLUMN mcp_servers.auth_config IS 
  'Auth configuration JSON. For oauth2: {authorization_endpoint, token_endpoint, scopes, use_dcr, client_id, client_secret, registration_endpoint}';

COMMENT ON COLUMN a2a_agents.auth_config IS 
  'Auth configuration JSON. For oauth2: {authorization_endpoint, token_endpoint, scopes, use_dcr, client_id, client_secret, registration_endpoint}';


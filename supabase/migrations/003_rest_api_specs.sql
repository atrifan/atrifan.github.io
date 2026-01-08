-- Migration 003: Add REST API Specifications table
-- Stores OpenAPI/Swagger specs for REST API tools

-- ============ REST API Specs Table ============
-- Stores the original swagger spec and metadata for REST API tool groups

CREATE TABLE IF NOT EXISTS rest_api_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Server/API identification
  server_name TEXT NOT NULL,
  
  -- Original swagger spec (stored as JSONB for querying)
  swagger_spec JSONB NOT NULL,
  
  -- Spec format: 'json' or 'yaml' (original format before parsing)
  spec_format TEXT NOT NULL DEFAULT 'json' CHECK (spec_format IN ('json', 'yaml')),
  
  -- OpenAPI version detected (e.g., '3.0.0', '2.0')
  openapi_version TEXT,
  
  -- API info extracted from spec
  api_title TEXT,
  api_description TEXT,
  api_version TEXT,
  
  -- Default headers to send with all requests (JSON object)
  default_headers JSONB DEFAULT '{}'::jsonb,
  
  -- Authorization config
  auth_type TEXT CHECK (auth_type IN ('none', 'bearer', 'api_key', 'basic', 'custom')),
  auth_config JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can have unique server names
  UNIQUE (user_id, server_name)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_rest_api_specs_user_id ON rest_api_specs(user_id);

-- Index for server name lookups
CREATE INDEX IF NOT EXISTS idx_rest_api_specs_server_name ON rest_api_specs(user_id, server_name);

-- RLS for rest_api_specs
ALTER TABLE rest_api_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own REST API specs" ON rest_api_specs
  FOR SELECT USING (true);

CREATE POLICY "Insert own REST API specs" ON rest_api_specs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update own REST API specs" ON rest_api_specs
  FOR UPDATE USING (true);

CREATE POLICY "Delete own REST API specs" ON rest_api_specs
  FOR DELETE USING (true);

-- ============ REST API Endpoints Table ============
-- Stores individual endpoints extracted from swagger specs
-- Links to tools table for the actual tool definition

CREATE TABLE IF NOT EXISTS rest_api_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to parent spec
  spec_id UUID NOT NULL REFERENCES rest_api_specs(id) ON DELETE CASCADE,
  
  -- Link to tool definition (the tool created from this endpoint)
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  
  -- Endpoint metadata from swagger
  operation_id TEXT NOT NULL,
  http_method TEXT NOT NULL CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path TEXT NOT NULL,
  
  -- Headers specific to this endpoint (merged with spec default_headers)
  headers JSONB DEFAULT '{}'::jsonb,
  
  -- Content type for request/response
  request_content_type TEXT DEFAULT 'application/json',
  response_content_type TEXT DEFAULT 'application/json',
  
  -- Parameter locations (for runtime request building)
  path_params JSONB DEFAULT '[]'::jsonb,
  query_params JSONB DEFAULT '[]'::jsonb,
  header_params JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each operation_id should be unique within a spec
  UNIQUE (spec_id, operation_id)
);

-- Index for spec lookups
CREATE INDEX IF NOT EXISTS idx_rest_api_endpoints_spec ON rest_api_endpoints(spec_id);

-- Index for tool lookups
CREATE INDEX IF NOT EXISTS idx_rest_api_endpoints_tool ON rest_api_endpoints(tool_id);

-- RLS for rest_api_endpoints
ALTER TABLE rest_api_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View REST API endpoints" ON rest_api_endpoints
  FOR SELECT USING (true);

CREATE POLICY "Insert REST API endpoints" ON rest_api_endpoints
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update REST API endpoints" ON rest_api_endpoints
  FOR UPDATE USING (true);

CREATE POLICY "Delete REST API endpoints" ON rest_api_endpoints
  FOR DELETE USING (true);

-- Comments for documentation
COMMENT ON TABLE rest_api_specs IS 
  'Stores OpenAPI/Swagger specifications for REST API tool groups';

COMMENT ON COLUMN rest_api_specs.server_name IS 
  'User-defined name for this API (used in tool naming: env-server-operation)';

COMMENT ON COLUMN rest_api_specs.auth_type IS 
  'Authorization type: none, bearer (token), api_key (header/query), basic, custom';

COMMENT ON COLUMN rest_api_specs.auth_config IS 
  'Auth configuration JSON: {header_name, token_env_var, etc.}';

COMMENT ON TABLE rest_api_endpoints IS 
  'Individual endpoints extracted from swagger specs, linked to tool definitions';

COMMENT ON COLUMN rest_api_endpoints.path_params IS 
  'Array of path parameter names: ["id", "userId"]';

COMMENT ON COLUMN rest_api_endpoints.query_params IS 
  'Array of query parameter definitions: [{name, required, type}]';


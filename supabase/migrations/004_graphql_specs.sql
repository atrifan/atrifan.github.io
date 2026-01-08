-- Migration 004: GraphQL Specs and Operations
-- Stores GraphQL schemas and operations for tool generation

-- ============ GraphQL Specs Table ============
-- Stores GraphQL schema information

CREATE TABLE IF NOT EXISTS graphql_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Server/API identification
  server_name TEXT NOT NULL,
  
  -- GraphQL schema (introspection result as JSONB)
  schema_json JSONB NOT NULL,
  
  -- Raw SDL (Schema Definition Language) if available
  schema_sdl TEXT,
  
  -- API info
  api_title TEXT,
  api_description TEXT,
  
  -- Source URL (the GraphQL endpoint)
  source_url TEXT NOT NULL,
  
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graphql_specs_user_id ON graphql_specs(user_id);
CREATE INDEX IF NOT EXISTS idx_graphql_specs_server_name ON graphql_specs(user_id, server_name);

-- RLS for graphql_specs
ALTER TABLE graphql_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own GraphQL specs" ON graphql_specs
  FOR SELECT USING (true);

CREATE POLICY "Insert own GraphQL specs" ON graphql_specs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update own GraphQL specs" ON graphql_specs
  FOR UPDATE USING (true);

CREATE POLICY "Delete own GraphQL specs" ON graphql_specs
  FOR DELETE USING (true);

-- ============ GraphQL Operations Table ============
-- Stores individual queries/mutations extracted from schema

CREATE TABLE IF NOT EXISTS graphql_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to parent spec
  spec_id UUID NOT NULL REFERENCES graphql_specs(id) ON DELETE CASCADE,
  
  -- Link to tool definition (the tool created from this operation)
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  
  -- Operation metadata
  operation_name TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('query', 'mutation', 'subscription')),
  
  -- The GraphQL operation string
  operation_string TEXT NOT NULL,
  
  -- Arguments extracted from schema (for input validation)
  arguments JSONB DEFAULT '[]'::jsonb,
  
  -- Return type info
  return_type TEXT,
  return_type_kind TEXT, -- SCALAR, OBJECT, LIST, NON_NULL, etc.
  
  -- Description from schema
  description TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each operation should be unique within a spec
  UNIQUE (spec_id, operation_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graphql_operations_spec_id ON graphql_operations(spec_id);
CREATE INDEX IF NOT EXISTS idx_graphql_operations_tool_id ON graphql_operations(tool_id);
CREATE INDEX IF NOT EXISTS idx_graphql_operations_type ON graphql_operations(spec_id, operation_type);

-- RLS for graphql_operations
ALTER TABLE graphql_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View GraphQL operations" ON graphql_operations
  FOR SELECT USING (true);

CREATE POLICY "Insert GraphQL operations" ON graphql_operations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Update GraphQL operations" ON graphql_operations
  FOR UPDATE USING (true);

CREATE POLICY "Delete GraphQL operations" ON graphql_operations
  FOR DELETE USING (true);

-- ============ GraphQL Environments Table ============
-- Links GraphQL specs to environments (different hosts)

CREATE TABLE IF NOT EXISTS graphql_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to parent spec
  spec_id UUID NOT NULL REFERENCES graphql_specs(id) ON DELETE CASCADE,
  
  -- Link to environment
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each environment can only be linked once per spec
  UNIQUE (spec_id, environment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graphql_environments_spec_id ON graphql_environments(spec_id);
CREATE INDEX IF NOT EXISTS idx_graphql_environments_env_id ON graphql_environments(environment_id);

-- RLS for graphql_environments
ALTER TABLE graphql_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View GraphQL environments" ON graphql_environments
  FOR SELECT USING (true);

CREATE POLICY "Insert GraphQL environments" ON graphql_environments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Delete GraphQL environments" ON graphql_environments
  FOR DELETE USING (true);

-- Comments for documentation
COMMENT ON TABLE graphql_specs IS 
  'Stores GraphQL schemas for GraphQL API tool groups';

COMMENT ON COLUMN graphql_specs.server_name IS 
  'User-defined name for this API (used in tool naming: env-server-operation)';

COMMENT ON COLUMN graphql_specs.schema_json IS 
  'GraphQL introspection result as JSON';

COMMENT ON TABLE graphql_operations IS 
  'Individual queries/mutations extracted from GraphQL schemas, linked to tool definitions';

COMMENT ON COLUMN graphql_operations.operation_string IS 
  'The GraphQL query/mutation string to execute';

COMMENT ON COLUMN graphql_operations.arguments IS 
  'Array of argument definitions: [{name, type, required, description}]';


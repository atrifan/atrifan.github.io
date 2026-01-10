-- Add REST API Environments junction table
-- Links REST API specs to environments (same pattern as graphql_environments)

CREATE TABLE IF NOT EXISTS rest_api_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to parent spec
  spec_id UUID NOT NULL REFERENCES rest_api_specs(id) ON DELETE CASCADE,
  
  -- Link to environment
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each environment can only be linked once per spec
  UNIQUE (spec_id, environment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rest_api_environments_spec_id ON rest_api_environments(spec_id);
CREATE INDEX IF NOT EXISTS idx_rest_api_environments_env_id ON rest_api_environments(environment_id);

-- RLS for rest_api_environments
ALTER TABLE rest_api_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View REST API environments" ON rest_api_environments
  FOR SELECT USING (true);

CREATE POLICY "Insert REST API environments" ON rest_api_environments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Delete REST API environments" ON rest_api_environments
  FOR DELETE USING (true);

-- Comment for documentation
COMMENT ON TABLE rest_api_environments IS 'Links REST API specs to environments (different hosts)';


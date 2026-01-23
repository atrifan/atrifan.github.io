-- Migration: Remove environments concept, store host directly on rest_api_specs
-- This simplifies the architecture by eliminating the environment indirection

-- Step 1: Add host column to rest_api_specs
ALTER TABLE rest_api_specs ADD COLUMN IF NOT EXISTS host TEXT;

-- Step 2: Migrate existing data - extract host from swagger_spec.servers[0].url
UPDATE rest_api_specs 
SET host = (swagger_spec->'servers'->0->>'url')
WHERE host IS NULL 
  AND swagger_spec->'servers'->0->>'url' IS NOT NULL;

-- Step 3: For any remaining NULL hosts, try to extract from source_url
UPDATE rest_api_specs
SET host = regexp_replace(source_url, '^(https?://[^/]+).*$', '\1')
WHERE host IS NULL AND source_url IS NOT NULL;

-- Step 4: Set default fallback for any still NULL
UPDATE rest_api_specs
SET host = 'https://api.example.com'
WHERE host IS NULL;

-- Step 5: Make host NOT NULL now that all rows have values
ALTER TABLE rest_api_specs ALTER COLUMN host SET NOT NULL;

-- Step 6: Add same for graphql_specs
ALTER TABLE graphql_specs ADD COLUMN IF NOT EXISTS host TEXT;

UPDATE graphql_specs
SET host = source_url
WHERE host IS NULL AND source_url IS NOT NULL;

UPDATE graphql_specs
SET host = 'https://api.example.com'
WHERE host IS NULL;

ALTER TABLE graphql_specs ALTER COLUMN host SET NOT NULL;

-- Step 7: Drop the environments table (no longer needed)
-- First drop any foreign key constraints if they exist
-- Note: We're keeping the table for now in case rollback is needed
-- DROP TABLE IF EXISTS environments;

-- Step 8: Add comment explaining the change
COMMENT ON COLUMN rest_api_specs.host IS 'Base URL for API calls (e.g., https://httpbin.org). Extracted from swagger spec servers array.';
COMMENT ON COLUMN graphql_specs.host IS 'Base URL for GraphQL endpoint.';


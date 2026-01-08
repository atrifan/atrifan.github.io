-- Migration 005: Add source URL and raw spec to rest_api_specs
-- Enables reimport from original URL and independent spec editing

-- Add source_url column for URL-based imports
ALTER TABLE rest_api_specs ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add raw_spec column to store original spec text (before parsing)
ALTER TABLE rest_api_specs ADD COLUMN IF NOT EXISTS raw_spec TEXT;

-- Add import_method to track how the spec was imported
ALTER TABLE rest_api_specs ADD COLUMN IF NOT EXISTS import_method TEXT 
  CHECK (import_method IN ('paste', 'url')) DEFAULT 'paste';

-- Create index for source_url lookups
CREATE INDEX IF NOT EXISTS idx_rest_api_specs_source_url ON rest_api_specs(source_url) 
  WHERE source_url IS NOT NULL;


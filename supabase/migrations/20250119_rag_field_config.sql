-- RAG Field Configuration Enhancement
-- Adds support for configurable field embedding, smart formatting, and upsert

-- ============ Unique rag_name per user ============

-- First, ensure all existing RAGs have a rag_name (normalize from name if missing)
UPDATE user_rags 
SET rag_name = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9-]', '-', 'g'), '-+', '-', 'g'))
WHERE rag_name IS NULL;

-- Remove leading/trailing dashes
UPDATE user_rags 
SET rag_name = TRIM(BOTH '-' FROM rag_name)
WHERE rag_name LIKE '-%' OR rag_name LIKE '%-';

-- Make rag_name NOT NULL and add unique constraint per user
ALTER TABLE user_rags
ALTER COLUMN rag_name SET NOT NULL;

-- Add unique constraint (user_id + rag_name must be unique)
ALTER TABLE user_rags
ADD CONSTRAINT unique_user_rag_name UNIQUE (user_id, rag_name);

-- ============ Field Configuration ============

-- Store field configuration for CSV imports
-- Structure: {
--   id_column: string,           -- Column used as document ID
--   document_column: string,     -- Main content column (always embedded)
--   fields: [
--     {
--       column: string,          -- CSV column name
--       embed: boolean,          -- Include in embedding text
--       metadata: boolean,       -- Store in metadata
--       format: string           -- Embedding format template, e.g., "Price: {value}"
--     }
--   ]
-- }
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS field_config JSONB DEFAULT '{}';

-- ============ Import History ============

-- Track CSV imports for upsert/diff operations
CREATE TABLE IF NOT EXISTS rag_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_id UUID NOT NULL REFERENCES user_rags(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Import details
  filename VARCHAR(500),
  row_count INTEGER DEFAULT 0,
  vector_count INTEGER DEFAULT 0,
  
  -- Document IDs in this import (for orphan detection)
  document_ids JSONB DEFAULT '[]',
  
  -- Field config used for this import
  field_config JSONB DEFAULT '{}',
  
  -- Stats
  inserted_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  deleted_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding latest import per RAG
CREATE INDEX IF NOT EXISTS idx_rag_import_history_rag_id ON rag_import_history(rag_id);
CREATE INDEX IF NOT EXISTS idx_rag_import_history_created ON rag_import_history(rag_id, created_at DESC);

-- ============ Update rag_documents for doc_id ============

-- Add doc_id column for user-provided document IDs from CSV
ALTER TABLE rag_documents
ADD COLUMN IF NOT EXISTS doc_id VARCHAR(500);

-- Index for finding documents by doc_id within a RAG
CREATE INDEX IF NOT EXISTS idx_rag_documents_doc_id ON rag_documents(rag_id, doc_id);

-- ============ Comments ============

COMMENT ON COLUMN user_rags.field_config IS 'Field configuration for CSV imports: id_column, document_column, and field embed/metadata settings';
COMMENT ON TABLE rag_import_history IS 'Tracks CSV imports for upsert operations and orphan detection';
COMMENT ON COLUMN rag_documents.doc_id IS 'User-provided document ID from CSV for upsert operations';


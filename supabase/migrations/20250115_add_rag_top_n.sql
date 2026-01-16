-- Add RAG configuration columns to user_rags table
-- This migration adds embedding config, source type, and retrieval settings

-- ============ Source Configuration ============

-- Source type: csv (file upload) or url (remote endpoint)
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'csv'
CHECK (source_type IN ('csv', 'url'));

-- Normalized RAG name for API endpoint (lowercase, dashes, no special chars)
-- Used in collection URL: /api/collection/{api_key}/{rag_name}
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS rag_name VARCHAR(255);

-- Server description shown to API consumers
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS server_description TEXT;

-- ============ URL RAG Request Configuration ============

-- HTTP method for URL RAG requests
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS http_method VARCHAR(10) DEFAULT 'POST'
CHECK (http_method IN ('GET', 'POST'));

-- Where to send parameters (query string or body)
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS params_location VARCHAR(10) DEFAULT 'body'
CHECK (params_location IN ('query', 'body'));

-- Content-Type for body requests
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS request_content_type VARCHAR(50) DEFAULT 'application/json';

-- Field mapping for URL RAG (JSON object mapping default field names to custom names)
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS field_mapping JSONB DEFAULT '{"query":"query","embedding":"embedding","top_n":"top_n","dimensions":"dimensions","model":"model"}';

-- ============ Embedding Configuration ============

-- Embedding dimensions (derived from model, stored for Upstash Vector index compatibility)
-- Common values: 384 (MiniLM), 768 (BGE-base), 1024 (Qwen3-0.6b), 1536 (OpenAI small), 2048, 3072, 4096
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER DEFAULT 384;

-- Content type affects chunking strategy and search optimization
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'
CHECK (content_type IN ('text', 'code', 'mixed'));

-- ============ Retrieval Configuration ============

-- Number of top results to retrieve during RAG search (1-20)
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS top_n INTEGER DEFAULT 5;

-- ============ Stats ============

-- Number of chunks stored in vector database
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;

-- ============ Documentation ============

COMMENT ON COLUMN user_rags.source_type IS 'Import source: csv (file upload) or url (remote API endpoint)';
COMMENT ON COLUMN user_rags.rag_name IS 'Normalized name for API endpoint: /api/collection/{api_key}/{rag_name}';
COMMENT ON COLUMN user_rags.embedding_dimensions IS 'Vector dimensions from embedding model - must match Upstash Vector index';
COMMENT ON COLUMN user_rags.content_type IS 'Content type: text (natural language), code (programming), mixed (both)';
COMMENT ON COLUMN user_rags.top_n IS 'Number of top results to retrieve during RAG search (1-20)';
COMMENT ON COLUMN user_rags.chunk_count IS 'Number of chunks stored in Upstash Vector for this RAG';


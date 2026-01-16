-- Add swagger spec and environment name to user_rags for tool generation
-- This migration enables RAG imports to generate swagger specs and create tools

-- ============ Swagger Spec Storage ============

-- Store generated swagger spec for the RAG endpoint
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS swagger_spec JSONB;

-- Environment name for tool naming (like A2A agents)
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS environment_name VARCHAR(100) DEFAULT 'default';

-- ============ Favicon for REST API Specs ============

-- Store favicon URL for REST API specs (fetched during import)
ALTER TABLE rest_api_specs
ADD COLUMN IF NOT EXISTS favicon_url TEXT;

-- ============ Comments ============

COMMENT ON COLUMN user_rags.swagger_spec IS 'Generated OpenAPI/Swagger spec for the RAG collection endpoint';
COMMENT ON COLUMN user_rags.environment_name IS 'Environment name for tool naming pattern: rag_{env}-{rag_name}-search';
COMMENT ON COLUMN rest_api_specs.favicon_url IS 'Favicon URL fetched from the API source during import';


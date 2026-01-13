-- RAG (Retrieval Augmented Generation) tables

-- Main RAG sources table
CREATE TABLE IF NOT EXISTS user_rags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Source URL (optional - for web-based RAGs)
  source_url TEXT,
  
  -- Authentication (similar to connectors)
  auth_type VARCHAR(50) DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic', 'oauth2', 'custom')),
  auth_config JSONB DEFAULT '{}',
  custom_headers JSONB DEFAULT '{}',
  
  -- Embedding configuration
  has_embeddings BOOLEAN DEFAULT false,
  embedding_model VARCHAR(100), -- e.g., 'text-embedding-3-small', 'text-embedding-ada-002'
  token_limit INTEGER DEFAULT 8000, -- Max tokens to include in context
  chunk_size INTEGER DEFAULT 500, -- Size of text chunks for embedding
  chunk_overlap INTEGER DEFAULT 50, -- Overlap between chunks
  
  -- Stats
  document_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  
  -- Display
  icon VARCHAR(10) DEFAULT '📚',
  icon_url TEXT,
  
  -- Status
  is_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- RAG documents/chunks table
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_id UUID NOT NULL REFERENCES user_rags(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Document info
  title VARCHAR(500),
  content TEXT NOT NULL,
  source_identifier TEXT, -- Original filename, URL, or row identifier
  
  -- Chunking info
  chunk_index INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  
  -- Token count
  token_count INTEGER DEFAULT 0,
  
  -- Embedding vector stored as JSONB array of floats
  -- 1536 dimensions for OpenAI ada-002/text-embedding-3-small
  -- 3072 dimensions for text-embedding-3-large
  -- Similarity search done in application code (cosine similarity)
  embedding JSONB,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active RAGs per user per context (similar to chat_active_personalities)
CREATE TABLE IF NOT EXISTS chat_active_rags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  rag_id UUID NOT NULL REFERENCES user_rags(id) ON DELETE CASCADE,
  context VARCHAR(20) NOT NULL DEFAULT 'chat' CHECK (context IN ('chat', 'automation')),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, rag_id, context)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_rags_user_id ON user_rags(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_rag_id ON rag_documents(rag_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_user_id ON rag_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_active_rags_user_context ON chat_active_rags(user_id, context);

-- Index on rag_id + has embedding for faster retrieval
CREATE INDEX IF NOT EXISTS idx_rag_documents_has_embedding ON rag_documents(rag_id) WHERE embedding IS NOT NULL;


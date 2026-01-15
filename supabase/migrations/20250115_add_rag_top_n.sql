-- Add top_n column to user_rags table
-- This controls how many top results to retrieve during RAG search

ALTER TABLE user_rags 
ADD COLUMN IF NOT EXISTS top_n INTEGER DEFAULT 5;

-- Add comment for documentation
COMMENT ON COLUMN user_rags.top_n IS 'Number of top results to retrieve during RAG search (1-20)';


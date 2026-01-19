-- Add RAG to the tool_type constraint
-- This allows RAG knowledge base search tools to be stored in the tools table

-- ============ Update tools table constraint ============

-- Drop the existing constraint
ALTER TABLE tools
DROP CONSTRAINT IF EXISTS tools_tool_type_check;

-- Add new constraint with RAG included
ALTER TABLE tools
ADD CONSTRAINT tools_tool_type_check
CHECK (tool_type IN ('NATIVE', 'MCP', 'REST', 'GQL', 'A2A', 'RAG'));

-- ============ Link RAG to Tool ============

-- Add tool_id column to user_rags to track the associated tool
ALTER TABLE user_rags
ADD COLUMN IF NOT EXISTS tool_id UUID REFERENCES tools(id) ON DELETE SET NULL;

-- Index for tool lookups
CREATE INDEX IF NOT EXISTS idx_user_rags_tool_id ON user_rags(tool_id) WHERE tool_id IS NOT NULL;

-- ============ Cleanup Orphaned RAG Data ============

-- Delete RAG tools that don't have a corresponding user_rags entry
-- (This cleans up any orphaned tools from failed imports)
DELETE FROM tools
WHERE tool_type = 'RAG'
AND name LIKE 'rag_%'
AND id NOT IN (SELECT tool_id FROM user_rags WHERE tool_id IS NOT NULL);

-- ============ Comments ============

COMMENT ON CONSTRAINT tools_tool_type_check ON tools IS
  'Valid tool types: NATIVE (built-in), MCP (Model Context Protocol), REST (REST API), GQL (GraphQL), A2A (Agent-to-Agent), RAG (Knowledge Base Search)';

COMMENT ON COLUMN user_rags.tool_id IS
  'Reference to the auto-generated search tool for this RAG collection';

-- ============ Cascade Delete RAG Tool ============

-- Create a function to delete the associated tool when a RAG is deleted
CREATE OR REPLACE FUNCTION delete_rag_tool()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete the associated tool if it exists
  IF OLD.tool_id IS NOT NULL THEN
    DELETE FROM tools WHERE id = OLD.tool_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before RAG deletion
DROP TRIGGER IF EXISTS trigger_delete_rag_tool ON user_rags;
CREATE TRIGGER trigger_delete_rag_tool
  BEFORE DELETE ON user_rags
  FOR EACH ROW
  EXECUTE FUNCTION delete_rag_tool();


-- Add annotations column to tools table
-- Stores MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)

ALTER TABLE tools ADD COLUMN IF NOT EXISTS annotations JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN tools.annotations IS 'MCP tool annotations: readOnlyHint, destructiveHint, idempotentHint, openWorldHint';


-- Migration: Add type prefixes to tool names
-- This migration adds type prefixes (rest_, gql_, mcp_, a2a_) to existing tool names
-- for better organization and clarity.
-- 
-- Note: Native tools keep their original names for backward compatibility.
-- New imports will automatically use the prefixed naming convention.

-- Add rest_ prefix to REST tools that don't have it
UPDATE tools
SET name = 'rest_' || name
WHERE tool_type = 'REST'
  AND name NOT LIKE 'rest_%';

-- Add gql_ prefix to GraphQL tools that don't have it
UPDATE tools
SET name = 'gql_' || name
WHERE tool_type = 'GQL'
  AND name NOT LIKE 'gql_%';

-- Add mcp_ prefix to MCP tools that don't have it
UPDATE tools
SET name = 'mcp_' || name
WHERE tool_type = 'MCP'
  AND name NOT LIKE 'mcp_%';

-- Add a2a_ prefix to A2A tools that don't have it
UPDATE tools
SET name = 'a2a_' || name
WHERE tool_type = 'A2A'
  AND name NOT LIKE 'a2a_%';

-- Note: NATIVE tools are NOT prefixed to maintain backward compatibility
-- with existing MCP server configurations and client integrations.


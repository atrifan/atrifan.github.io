-- Migration: Cleanup orphaned tools
-- This migration removes tools that have no associated records
-- (no endpoint, no graphql operation, no mcp server tool, no a2a agent).
--
-- Run this after deleting specs/servers/agents to clean up any orphaned tools.

-- Delete orphaned REST tools (no matching rest_api_endpoints)
DELETE FROM tools
WHERE tool_type = 'REST'
  AND id NOT IN (
    SELECT DISTINCT tool_id
    FROM rest_api_endpoints
    WHERE tool_id IS NOT NULL
  );

-- Delete orphaned GraphQL tools (no matching graphql_operations)
DELETE FROM tools
WHERE tool_type = 'GQL'
  AND id NOT IN (
    SELECT DISTINCT tool_id
    FROM graphql_operations
    WHERE tool_id IS NOT NULL
  );

-- Delete orphaned MCP tools (no matching mcp_server_tools)
DELETE FROM tools
WHERE tool_type = 'MCP'
  AND id NOT IN (
    SELECT DISTINCT tool_id
    FROM mcp_server_tools
    WHERE tool_id IS NOT NULL
  );

-- Delete orphaned A2A tools (no matching a2a_agents by name pattern)
-- A2A tools follow the pattern: a2a_{env}-{agent_name}
DELETE FROM tools
WHERE tool_type = 'A2A'
  AND NOT EXISTS (
    SELECT 1 FROM a2a_agents a
    WHERE tools.name = 'a2a_' ||
      LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(a.environment_name, 'default'), '[^a-z0-9-]', '-', 'gi'), '-+', '-', 'g'))
      || '-' ||
      LOWER(REGEXP_REPLACE(REGEXP_REPLACE(a.agent_name, '[^a-z0-9-]', '-', 'gi'), '-+', '-', 'g'))
  );

-- Log cleanup results (optional, for debugging)
-- SELECT tool_type, COUNT(*) as remaining FROM tools GROUP BY tool_type;


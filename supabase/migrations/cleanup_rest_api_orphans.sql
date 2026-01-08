-- Cleanup script for orphaned REST API data
-- Run this in Supabase SQL Editor to clean up leftover data

-- 1. Find orphaned server_tools (environment_id is NULL but tool is REST type)
-- These are environment tools where the environment was deleted
DELETE FROM server_tools
WHERE environment_id IS NULL
AND tool_id IN (
  SELECT id FROM tools WHERE tool_type = 'REST'
);

-- 2. Delete REST tools that are not linked to any rest_api_endpoints
-- (orphaned environment-specific tools)
DELETE FROM tools
WHERE tool_type = 'REST'
AND id NOT IN (
  SELECT tool_id FROM rest_api_endpoints
);

-- 3. Delete environments that don't match any spec's server_name pattern
DELETE FROM environments
WHERE id IN (
  SELECT e.id FROM environments e
  WHERE NOT EXISTS (
    SELECT 1 FROM rest_api_specs s
    WHERE e.user_id = s.user_id
    AND e.name LIKE s.server_name || '-%'
  )
);

-- 4. Delete server_tools entries for tools that no longer exist
DELETE FROM server_tools
WHERE tool_id NOT IN (SELECT id FROM tools);

-- 5. Show remaining counts for verification
SELECT 'REST tools remaining' as metric, COUNT(*) as count FROM tools WHERE tool_type = 'REST'
UNION ALL
SELECT 'REST endpoints remaining', COUNT(*) FROM rest_api_endpoints
UNION ALL
SELECT 'Environments remaining', COUNT(*) FROM environments
UNION ALL
SELECT 'Server tools (REST)', COUNT(*) FROM server_tools st 
  JOIN tools t ON st.tool_id = t.id WHERE t.tool_type = 'REST'
UNION ALL
SELECT 'REST API specs', COUNT(*) FROM rest_api_specs;


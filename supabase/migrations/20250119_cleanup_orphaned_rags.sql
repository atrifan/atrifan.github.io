-- Cleanup orphaned RAGs (RAGs without associated tools)
-- Run this manually when needed to clean up failed imports

-- ============ Cleanup Query ============

-- Delete RAGs that don't have an associated tool
-- This happens when:
-- 1. Tool creation failed during RAG import
-- 2. Tool was manually deleted
-- 3. Migration issues

DELETE FROM user_rags
WHERE tool_id IS NULL
  AND created_at < NOW() - INTERVAL '1 hour'; -- Only delete if older than 1 hour (to avoid deleting in-progress imports)

-- Also delete RAGs where the tool_id references a non-existent tool
DELETE FROM user_rags
WHERE tool_id IS NOT NULL
  AND tool_id NOT IN (SELECT id FROM tools);

-- ============ View Orphaned RAGs (for inspection before deletion) ============

-- Use this query to inspect orphaned RAGs before deleting:
/*
SELECT 
  ur.id,
  ur.name,
  ur.rag_name,
  ur.source_type,
  ur.tool_id,
  ur.created_at,
  t.id as tool_exists
FROM user_rags ur
LEFT JOIN tools t ON ur.tool_id = t.id
WHERE ur.tool_id IS NULL 
   OR t.id IS NULL;
*/

-- ============ Count Orphaned RAGs ============

-- Use this to count orphaned RAGs:
/*
SELECT 
  COUNT(*) as orphaned_count,
  COUNT(*) FILTER (WHERE tool_id IS NULL) as null_tool_id,
  COUNT(*) FILTER (WHERE tool_id IS NOT NULL AND tool_id NOT IN (SELECT id FROM tools)) as missing_tool
FROM user_rags
WHERE tool_id IS NULL 
   OR tool_id NOT IN (SELECT id FROM tools WHERE tool_id IS NOT NULL);
*/


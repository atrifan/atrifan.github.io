-- Migration: Keep execution logs until execution is deleted
-- Previously, logs were deleted when a new execution started.
-- Now logs are preserved and only deleted when:
-- 1. The execution itself is deleted (CASCADE)
-- 2. Periodic cleanup removes executions older than 7 days AND beyond the last 10

-- Drop the trigger that clears old logs on new execution
DROP TRIGGER IF EXISTS trigger_clear_old_logs ON automation_executions;

-- Drop the old function
DROP FUNCTION IF EXISTS clear_old_automation_logs();

-- ============ Smart cleanup function ============
-- Keeps last 10 executions per automation AND not older than 7 days
-- This should be called periodically (e.g., via cron or on new execution)
CREATE OR REPLACE FUNCTION cleanup_old_executions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Delete executions that are:
  -- 1. Older than 7 days AND
  -- 2. Not in the last 10 executions for their automation
  WITH ranked_executions AS (
    SELECT
      id,
      automation_id,
      started_at,
      ROW_NUMBER() OVER (
        PARTITION BY automation_id
        ORDER BY started_at DESC
      ) as rn
    FROM automation_executions
  ),
  to_delete AS (
    SELECT id
    FROM ranked_executions
    WHERE rn > 10  -- Beyond the last 10
      AND started_at < NOW() - INTERVAL '7 days'  -- AND older than 7 days
  )
  DELETE FROM automation_executions
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============ Trigger to run cleanup on new execution ============
-- Runs cleanup when a new execution is inserted (lightweight, only deletes old ones)
CREATE OR REPLACE FUNCTION trigger_cleanup_old_executions()
RETURNS TRIGGER AS $$
BEGIN
  -- Run cleanup for this specific automation only (more efficient)
  DELETE FROM automation_executions
  WHERE automation_id = NEW.automation_id
    AND id != NEW.id
    AND started_at < NOW() - INTERVAL '7 days'
    AND id NOT IN (
      SELECT id FROM automation_executions
      WHERE automation_id = NEW.automation_id
      ORDER BY started_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_executions
  AFTER INSERT ON automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_old_executions();


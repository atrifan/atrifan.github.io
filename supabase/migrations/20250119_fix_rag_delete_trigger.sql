-- Fix: Change BEFORE DELETE trigger to AFTER DELETE
-- 
-- Problem: BEFORE DELETE trigger on user_rags deletes from tools table,
-- which has ON DELETE SET NULL back to user_rags.tool_id, causing:
-- "tuple to be deleted was already modified by an operation triggered by the current command"
--
-- Solution: Use AFTER DELETE trigger instead

-- Drop the old BEFORE trigger
DROP TRIGGER IF EXISTS trigger_delete_rag_tool ON user_rags;

-- Recreate as AFTER DELETE trigger
CREATE TRIGGER trigger_delete_rag_tool
  AFTER DELETE ON user_rags
  FOR EACH ROW
  EXECUTE FUNCTION delete_rag_tool();

-- The function delete_rag_tool() remains the same - it deletes the associated tool


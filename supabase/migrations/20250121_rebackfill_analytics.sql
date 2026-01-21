-- =============================================
-- Re-backfill analytics from ai_token_usage table
-- This table has the actual cost and token data
-- =============================================

-- First, clear existing data to avoid duplicates
TRUNCATE TABLE user_ai_analytics;

-- Backfill from ai_token_usage (the source of truth for costs)
INSERT INTO user_ai_analytics (
  user_id, date, model_id,
  message_count, total_input_tokens, total_output_tokens,
  total_rag_tokens, total_history_tokens, total_recent_history_tokens, total_persona_tokens,
  total_cost, rag_usage_count, history_usage_count, persona_usage_count
)
SELECT
  user_id,
  DATE(created_at) as date,
  COALESCE(model_id, 'unknown') as model_id,
  COUNT(*) as message_count,
  SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
  SUM(COALESCE(output_tokens, 0)) as total_output_tokens,
  0 as total_rag_tokens,
  0 as total_history_tokens,
  0 as total_recent_history_tokens,
  0 as total_persona_tokens,
  SUM(COALESCE(cost_usd, 0)) as total_cost,
  0 as rag_usage_count,
  0 as history_usage_count,
  0 as persona_usage_count
FROM ai_token_usage
WHERE user_id IS NOT NULL
GROUP BY user_id, DATE(created_at), COALESCE(model_id, 'unknown')
ON CONFLICT (user_id, date, model_id) DO UPDATE SET
  message_count = EXCLUDED.message_count,
  total_input_tokens = EXCLUDED.total_input_tokens,
  total_output_tokens = EXCLUDED.total_output_tokens,
  total_cost = EXCLUDED.total_cost,
  updated_at = NOW();


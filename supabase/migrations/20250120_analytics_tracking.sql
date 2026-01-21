-- Add additional tracking columns for analytics
-- Track persona data, token breakdown by context type

-- Add persona_data column to store active personas used
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS persona_data JSONB DEFAULT NULL;

-- Add cost column for tracking message cost
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 6) DEFAULT 0;

-- Add token breakdown columns for context analysis
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS rag_tokens INTEGER DEFAULT 0;

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS history_tokens INTEGER DEFAULT 0;

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS recent_history_tokens INTEGER DEFAULT 0;

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS persona_tokens INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN chat_messages.persona_data IS 'Array of active personas: [{id, name, prompt}]';
COMMENT ON COLUMN chat_messages.rag_tokens IS 'Estimated tokens used for RAG context';
COMMENT ON COLUMN chat_messages.history_tokens IS 'Estimated tokens used for semantic history context';
COMMENT ON COLUMN chat_messages.recent_history_tokens IS 'Estimated tokens used for recent conversation history';
COMMENT ON COLUMN chat_messages.persona_tokens IS 'Estimated tokens used for persona system prompts';

-- Also add to automation_prompt_history
ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS persona_data JSONB DEFAULT NULL;

ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS rag_tokens INTEGER DEFAULT 0;

ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS history_tokens INTEGER DEFAULT 0;

ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS recent_history_tokens INTEGER DEFAULT 0;

ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS persona_tokens INTEGER DEFAULT 0;

-- Create analytics summary table for faster queries
CREATE TABLE IF NOT EXISTS user_ai_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  model_id TEXT NOT NULL,
  
  -- Message counts
  message_count INTEGER DEFAULT 0,
  
  -- Token totals
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  
  -- Context token breakdown
  total_rag_tokens INTEGER DEFAULT 0,
  total_history_tokens INTEGER DEFAULT 0,
  total_recent_history_tokens INTEGER DEFAULT 0,
  total_persona_tokens INTEGER DEFAULT 0,
  
  -- Cost
  total_cost DECIMAL(10, 6) DEFAULT 0,
  
  -- Context usage counts (how many messages used each type)
  rag_usage_count INTEGER DEFAULT 0,
  history_usage_count INTEGER DEFAULT 0,
  persona_usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, date, model_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_ai_analytics_user_date 
ON user_ai_analytics(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_ai_analytics_user_model 
ON user_ai_analytics(user_id, model_id);

-- Enable RLS
ALTER TABLE user_ai_analytics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own analytics" ON user_ai_analytics;
DROP POLICY IF EXISTS "Users can insert own analytics" ON user_ai_analytics;
DROP POLICY IF EXISTS "Users can update own analytics" ON user_ai_analytics;

-- RLS policy - users can only see their own analytics
CREATE POLICY "Users can view own analytics" ON user_ai_analytics
  FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can insert own analytics" ON user_ai_analytics
  FOR INSERT WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update own analytics" ON user_ai_analytics
  FOR UPDATE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Function to update analytics on message insert
-- Looks up user_id from chat_conversations since chat_messages doesn't have it
CREATE OR REPLACE FUNCTION update_user_analytics()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id TEXT;
  v_conv_model_id TEXT;
BEGIN
  -- Get user_id and model_id from the conversation
  SELECT user_id, model_id INTO v_user_id, v_conv_model_id
  FROM chat_conversations
  WHERE id = NEW.conversation_id;

  -- Skip if no user found
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO user_ai_analytics (
    user_id, date, model_id,
    message_count, total_input_tokens, total_output_tokens,
    total_rag_tokens, total_history_tokens, total_recent_history_tokens, total_persona_tokens,
    total_cost, rag_usage_count, history_usage_count, persona_usage_count
  )
  VALUES (
    v_user_id,
    DATE(NEW.created_at),
    COALESCE(NEW.model_id, v_conv_model_id, 'unknown'),
    1,
    COALESCE(NEW.input_tokens, 0),
    COALESCE(NEW.output_tokens, 0),
    COALESCE(NEW.rag_tokens, 0),
    COALESCE(NEW.history_tokens, 0),
    COALESCE(NEW.recent_history_tokens, 0),
    COALESCE(NEW.persona_tokens, 0),
    COALESCE(NEW.cost, 0),
    CASE WHEN NEW.rag_data IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN NEW.history_data IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN NEW.persona_data IS NOT NULL THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date, model_id) DO UPDATE SET
    message_count = user_ai_analytics.message_count + 1,
    total_input_tokens = user_ai_analytics.total_input_tokens + COALESCE(NEW.input_tokens, 0),
    total_output_tokens = user_ai_analytics.total_output_tokens + COALESCE(NEW.output_tokens, 0),
    total_rag_tokens = user_ai_analytics.total_rag_tokens + COALESCE(NEW.rag_tokens, 0),
    total_history_tokens = user_ai_analytics.total_history_tokens + COALESCE(NEW.history_tokens, 0),
    total_recent_history_tokens = user_ai_analytics.total_recent_history_tokens + COALESCE(NEW.recent_history_tokens, 0),
    total_persona_tokens = user_ai_analytics.total_persona_tokens + COALESCE(NEW.persona_tokens, 0),
    total_cost = user_ai_analytics.total_cost + COALESCE(NEW.cost, 0),
    rag_usage_count = user_ai_analytics.rag_usage_count + CASE WHEN NEW.rag_data IS NOT NULL THEN 1 ELSE 0 END,
    history_usage_count = user_ai_analytics.history_usage_count + CASE WHEN NEW.history_data IS NOT NULL THEN 1 ELSE 0 END,
    persona_usage_count = user_ai_analytics.persona_usage_count + CASE WHEN NEW.persona_data IS NOT NULL THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for chat_messages (only for assistant messages which have token counts)
DROP TRIGGER IF EXISTS trigger_update_analytics ON chat_messages;
CREATE TRIGGER trigger_update_analytics
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  WHEN (NEW.role = 'assistant')
  EXECUTE FUNCTION update_user_analytics();

-- =============================================
-- BACKFILL: Populate analytics from ai_token_usage table
-- This table has the actual cost and token data used by budget
-- =============================================
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


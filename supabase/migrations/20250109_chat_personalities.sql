-- Chat Personalities Table
-- Stores user-defined AI personalities with system prompts

CREATE TABLE IF NOT EXISTS chat_personalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Personality info
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🤖',
  
  -- System prompt content
  system_prompt TEXT NOT NULL,
  
  -- Token count for the system prompt (cached for display)
  prompt_token_count INTEGER NOT NULL DEFAULT 0,
  
  -- Whether this is the default personality
  is_default BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique name per user
  UNIQUE (user_id, name)
);

-- Active personalities for chat sessions
-- Links personalities to the current chat context
CREATE TABLE IF NOT EXISTS chat_active_personalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  personality_id UUID NOT NULL REFERENCES chat_personalities(id) ON DELETE CASCADE,
  
  -- Order in which personalities are applied (lower = first)
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One personality can only be active once per user
  UNIQUE (user_id, personality_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_personalities_user ON chat_personalities(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_active_personalities_user ON chat_active_personalities(user_id);

-- RLS Policies
ALTER TABLE chat_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_active_personalities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own personalities" ON chat_personalities
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage own active personalities" ON chat_active_personalities
  FOR ALL USING (true) WITH CHECK (true);

-- Function to estimate token count for a text (rough approximation: ~4 chars per token)
CREATE OR REPLACE FUNCTION estimate_token_count(text_content TEXT)
RETURNS INTEGER AS $$
BEGIN
  IF text_content IS NULL OR text_content = '' THEN
    RETURN 0;
  END IF;
  -- Rough estimate: 1 token ≈ 4 characters for English text
  RETURN CEIL(LENGTH(text_content)::DECIMAL / 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-update token count when system_prompt changes
CREATE OR REPLACE FUNCTION update_personality_token_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.prompt_token_count := estimate_token_count(NEW.system_prompt);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_personality_token_count ON chat_personalities;
CREATE TRIGGER trigger_update_personality_token_count
  BEFORE INSERT OR UPDATE OF system_prompt ON chat_personalities
  FOR EACH ROW
  EXECUTE FUNCTION update_personality_token_count();

-- Function to get combined system prompt from active personalities
CREATE OR REPLACE FUNCTION get_combined_system_prompt(p_user_id TEXT)
RETURNS TABLE(
  combined_prompt TEXT,
  total_tokens INTEGER,
  personality_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    STRING_AGG(p.system_prompt, E'\n\n' ORDER BY ap.priority, p.created_at) AS combined_prompt,
    COALESCE(SUM(p.prompt_token_count), 0)::INTEGER AS total_tokens,
    COUNT(*)::INTEGER AS personality_count
  FROM chat_active_personalities ap
  JOIN chat_personalities p ON p.id = ap.personality_id
  WHERE ap.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


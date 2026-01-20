-- Migration: Add chat and automation settings to user_preferences
-- These JSONB columns store context-specific settings like:
-- - enableReasoning: boolean
-- - sendHistory: boolean  
-- - historyMemoryEnabled: boolean
-- - defaultModel: string

-- Add chat_settings column (for ChatPage)
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS chat_settings JSONB DEFAULT '{}'::jsonb;

-- Add automation_settings column (for AutomationPage)
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS automation_settings JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN user_preferences.chat_settings IS 
  'Chat page settings: enableReasoning, sendHistory, historyMemoryEnabled, defaultModel';

COMMENT ON COLUMN user_preferences.automation_settings IS 
  'Automation page settings: enableReasoning, sendHistory, historyMemoryEnabled, defaultModel';


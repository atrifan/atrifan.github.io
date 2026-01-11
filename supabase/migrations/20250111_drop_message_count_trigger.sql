-- Drop the automatic message count trigger
-- Message count and total_tokens are now updated explicitly in the API routes
-- This avoids double-counting issues and makes the logic more explicit

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON chat_messages;
DROP FUNCTION IF EXISTS update_conversation_on_message();

-- Fix any existing conversations with incorrect message counts
UPDATE chat_conversations c
SET message_count = (
  SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id
);

-- Fix any existing conversations with incorrect total_tokens
UPDATE chat_conversations c
SET total_tokens = (
  SELECT COALESCE(SUM(input_tokens + output_tokens), 0) 
  FROM chat_messages m 
  WHERE m.conversation_id = c.id
);


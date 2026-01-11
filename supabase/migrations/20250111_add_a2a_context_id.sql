-- Add A2A context ID to chat_conversations
-- This stores the external agent's context/task ID for conversation continuity

ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS a2a_context_id TEXT;

-- Index for looking up by context ID
CREATE INDEX IF NOT EXISTS idx_chat_conversations_a2a_context_id 
ON chat_conversations(a2a_context_id) 
WHERE a2a_context_id IS NOT NULL;


-- Add rag_data and history_data columns to chat_messages for storing retrieval context
-- This allows displaying what RAG/history context was used for each response

-- Add rag_data column to store RAG retrieval results
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS rag_data JSONB DEFAULT NULL;

-- Add history_data column to store history match results  
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS history_data JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN chat_messages.rag_data IS 'Array of RAG retrieval results: [{ragId, ragName, ragIcon, results: [{id, score, title, content}]}]';
COMMENT ON COLUMN chat_messages.history_data IS 'Array of history match results: [{chatId, score, messages: [{content, messageType}]}]';

-- Also add to automation_prompt_history for automation context
ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS rag_data JSONB DEFAULT NULL;

ALTER TABLE automation_prompt_history 
ADD COLUMN IF NOT EXISTS history_data JSONB DEFAULT NULL;


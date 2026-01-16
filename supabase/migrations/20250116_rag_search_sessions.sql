-- RAG Search Sessions Table
-- Stores RAG search session metadata and messages (similar to chat_conversations)

-- Sessions table
CREATE TABLE IF NOT EXISTS rag_search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Search',
  rag_id UUID REFERENCES user_rags(id) ON DELETE SET NULL,
  rag_name TEXT, -- Store name in case RAG is deleted
  embedding_model TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS rag_search_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES rag_search_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  results JSONB DEFAULT '[]', -- Store search results for assistant messages
  tokens INTEGER DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_search_sessions_user_id ON rag_search_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_search_sessions_updated_at ON rag_search_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_search_sessions_rag_id ON rag_search_sessions(rag_id);
CREATE INDEX IF NOT EXISTS idx_rag_search_messages_session_id ON rag_search_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_search_messages_created_at ON rag_search_messages(created_at);

-- RLS Policies
ALTER TABLE rag_search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_search_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own rag sessions" ON rag_search_sessions
  FOR SELECT USING (auth.uid()::text = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own rag sessions" ON rag_search_sessions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own rag sessions" ON rag_search_sessions
  FOR UPDATE USING (auth.uid()::text = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete own rag sessions" ON rag_search_sessions
  FOR DELETE USING (auth.uid()::text = user_id OR user_id = current_setting('app.current_user_id', true));

-- Messages policies (through session ownership)
CREATE POLICY "Users can view own rag messages" ON rag_search_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rag_search_sessions s 
      WHERE s.id = rag_search_messages.session_id 
      AND (s.user_id = auth.uid()::text OR s.user_id = current_setting('app.current_user_id', true))
    )
  );

CREATE POLICY "Users can insert own rag messages" ON rag_search_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rag_search_sessions s 
      WHERE s.id = rag_search_messages.session_id 
      AND (s.user_id = auth.uid()::text OR s.user_id = current_setting('app.current_user_id', true))
    )
  );

CREATE POLICY "Users can delete own rag messages" ON rag_search_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rag_search_sessions s 
      WHERE s.id = rag_search_messages.session_id 
      AND (s.user_id = auth.uid()::text OR s.user_id = current_setting('app.current_user_id', true))
    )
  );


-- Remote chat relay: chat with a connected device from a phone / second computer.
-- Tulzo is a transport pipe (Supabase Realtime) between the remote page and the
-- connected device, plus a durable store for session/message history.

-- 1. Sessions — one chat thread targeting a specific device (api_key).
CREATE TABLE IF NOT EXISTS chat_relay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_sessions_user ON chat_relay_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_relay_sessions_apikey ON chat_relay_sessions(api_key_id);

-- 2. Messages — durable, rendered chat history (what ChatBubble consumes).
CREATE TABLE IF NOT EXISTS chat_relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_relay_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  seq BIGSERIAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_messages_session ON chat_relay_messages(session_id, seq);

-- 3. Frames — ephemeral transport rows (PanelToWorker / WorkerToPanel frames).
--    postgres_changes on this table is the delivery signal; token streaming rides
--    Supabase broadcast on the same channel to avoid a DB write per token.
CREATE TABLE IF NOT EXISTS chat_relay_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_relay_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('to_device', 'to_page')),
  frame JSONB NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_frames_session ON chat_relay_frames(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_relay_frames_pending
  ON chat_relay_frames(session_id, direction) WHERE consumed = FALSE;

-- Service-role access only (server routes filter by user_id).
ALTER TABLE chat_relay_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_relay_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_relay_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON chat_relay_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON chat_relay_messages FOR ALL USING (true);
CREATE POLICY "Service role full access" ON chat_relay_frames FOR ALL USING (true);

-- Automation Export History
-- Stores history of TypeScript code exports with token usage

CREATE TABLE automation_export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- The mermaid diagram that was exported
  mermaid_diagram TEXT NOT NULL,
  
  -- Generated TypeScript code
  typescript_code TEXT NOT NULL,
  
  -- Token usage for this export
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_automation_export_history_automation ON automation_export_history(automation_id);
CREATE INDEX idx_automation_export_history_user ON automation_export_history(user_id);

-- RLS policies
ALTER TABLE automation_export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export history" ON automation_export_history
  FOR ALL USING (user_id = current_setting('app.user_id', true));


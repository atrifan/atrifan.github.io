-- Automations System
-- Stores workflow automations with flow definitions, prompt history, and execution runs

-- Flow node types enum
CREATE TYPE automation_node_type AS ENUM (
  'start',
  'end',
  'skill',      -- MCP tool call
  'if',         -- Conditional branch
  'else',       -- Else branch
  'for',        -- For loop
  'while',      -- While loop
  'ai'          -- AI processing block (human-in-loop or data processing)
);

-- Automation status enum
CREATE TYPE automation_status AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

-- Schedule type enum
CREATE TYPE schedule_type AS ENUM (
  'manual',
  'daily',
  'weekly',
  'monthly',
  'cron'
);

-- Run status enum
CREATE TYPE run_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

-- Main automations table
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Flow definition (JSON structure)
  flow_definition JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}',
  
  -- Mermaid visualization
  mermaid_diagram TEXT,
  
  -- Generated TypeScript code (after export)
  typescript_code TEXT,
  
  -- Model and personality settings
  model_id TEXT NOT NULL DEFAULT 'meta-llama/llama-3.1-8b-instruct:free',
  personality_ids UUID[] DEFAULT '{}',
  
  -- Schedule settings
  schedule_type schedule_type NOT NULL DEFAULT 'manual',
  schedule_config JSONB DEFAULT '{}', -- time, day, cron expression
  next_run_at TIMESTAMPTZ,
  
  -- Status
  status automation_status NOT NULL DEFAULT 'draft',
  
  -- Stats
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt history for each automation
CREATE TABLE automation_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- The prompt that was used
  prompt TEXT NOT NULL,
  
  -- AI response (flow generation)
  response_flow JSONB,
  response_mermaid TEXT,
  
  -- Token usage for this prompt
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  
  -- Was this prompt applied to the automation?
  was_applied BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execution runs
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Run status
  status run_status NOT NULL DEFAULT 'pending',
  
  -- Trigger info
  triggered_by TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'schedule', 'api'
  
  -- Execution details
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Input/output
  input_data JSONB DEFAULT '{}',
  output_data JSONB,
  
  -- Execution log (step by step)
  execution_log JSONB DEFAULT '[]',
  
  -- Error info if failed
  error_message TEXT,
  error_node_id TEXT,
  
  -- Token usage
  total_tokens INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_automations_user ON automations(user_id);
CREATE INDEX idx_automations_status ON automations(status);
CREATE INDEX idx_automations_schedule ON automations(schedule_type, next_run_at) WHERE status = 'active';
CREATE INDEX idx_automation_prompts_automation ON automation_prompt_history(automation_id);
CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id);
CREATE INDEX idx_automation_runs_status ON automation_runs(status);

-- RLS policies
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own automations" ON automations
  FOR ALL USING (user_id = current_setting('app.user_id', true));

CREATE POLICY "Users can view own prompt history" ON automation_prompt_history
  FOR ALL USING (user_id = current_setting('app.user_id', true));

CREATE POLICY "Users can view own runs" ON automation_runs
  FOR ALL USING (user_id = current_setting('app.user_id', true));

-- Update trigger
CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


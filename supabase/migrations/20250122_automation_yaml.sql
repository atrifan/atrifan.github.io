-- Migration: Add YAML workflow definition support to automations
-- This enables storing the YAML source of truth alongside the Mermaid diagram

-- ============ Add yaml_definition to automations ============
-- The YAML is the source of truth, Mermaid is generated from it
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS yaml_definition TEXT;

-- ============ Add yaml_definition to automation_prompt_history ============
-- Store the YAML that was generated/modified in each prompt
ALTER TABLE automation_prompt_history
ADD COLUMN IF NOT EXISTS response_yaml TEXT;

-- ============ Add workflow_version to automations ============
-- Track workflow schema version for future migrations
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS workflow_version INTEGER DEFAULT 1;

-- ============ Add trigger_config to automations ============
-- Store parsed trigger configuration for scheduling
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{"type": "manual"}';

-- ============ Add cron_expression to automations ============
-- Normalized cron expression for all schedule types
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS cron_expression TEXT;

-- ============ Add schedule_config to automations ============
-- Store schedule configuration (hour, minute, days, etc.)
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS schedule_config JSONB DEFAULT '{}';

-- ============ Add required_inputs to automations ============
-- Pre-configured inputs with values or human_input markers
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS required_inputs JSONB DEFAULT '{}';

-- ============ Add output_config to automations ============
-- How automation sends results (email, slack, webhook, etc.)
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS output_config JSONB DEFAULT '[]';

-- ============ Add display metadata to automations ============
-- Friendly name and category for UI
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE automations
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- ============ Add last run status to automations ============
-- Quick status display without querying executions
-- success = green, warning = yellow (requires_input, timeout), error = red
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS last_run_status TEXT DEFAULT NULL;  -- success, warning, error, null

ALTER TABLE automations
ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE automations
ADD COLUMN IF NOT EXISTS last_run_message TEXT DEFAULT NULL;

-- ============ Update schedule_type enum ============
-- Add 'yearly' option if not exists
DO $$
BEGIN
  -- Check if 'yearly' exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'yearly'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'schedule_type')
  ) THEN
    ALTER TYPE schedule_type ADD VALUE 'yearly';
  END IF;
END $$;

-- ============ Create automation_inputs table ============
-- Store sensitive input values separately (for vault integration)
CREATE TABLE IF NOT EXISTS automation_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,  -- NULL if human_input
  is_sensitive BOOLEAN DEFAULT false,
  is_human_input BOOLEAN DEFAULT false,
  description TEXT,
  field_type TEXT DEFAULT 'string',  -- string, number, boolean, object, array
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(automation_id, field_name)
);

-- ============ Create automation_executions table ============
-- Track each execution run with input collection
CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, waiting_input, running, paused, completed, failed
  trigger_type TEXT NOT NULL,  -- manual, cron, webhook, automation
  triggered_by TEXT,  -- automation_id if triggered by another automation
  collected_inputs JSONB DEFAULT '{}',  -- Inputs collected so far
  pending_inputs JSONB DEFAULT '[]',  -- Inputs still needed
  current_step TEXT,  -- Current step id being executed
  context JSONB DEFAULT '{}',  -- Execution context/variables
  output_results JSONB DEFAULT '[]',  -- Results of output steps
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Create automation_human_requests table ============
-- Track human input requests (for notification/email)
CREATE TABLE IF NOT EXISTS automation_human_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL,  -- input, approval, choice
  field_name TEXT,  -- For input requests
  message TEXT,
  choices JSONB,  -- For choice requests
  notification_channels JSONB DEFAULT '["email"]',  -- email, slack, push
  notification_sent BOOLEAN DEFAULT false,
  response TEXT,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Create automation_logs table ============
-- Real-time logs for execution monitoring (cleared on each new run)
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT DEFAULT 'info',  -- debug, info, warn, error
  step_id TEXT,
  step_name TEXT,
  message TEXT NOT NULL,
  data JSONB,  -- Additional structured data
  status TEXT,  -- started, completed, failed, skipped (for step logs)
  duration_ms INTEGER  -- Duration if step completed
);

-- ============ Create indexes ============
CREATE INDEX IF NOT EXISTS idx_automations_next_run
ON automations(next_run_at)
WHERE status = 'active' AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_user_status
ON automations(user_id, status);

CREATE INDEX IF NOT EXISTS idx_automations_category
ON automations(user_id, category);

CREATE INDEX IF NOT EXISTS idx_automation_inputs_automation
ON automation_inputs(automation_id);

CREATE INDEX IF NOT EXISTS idx_automation_executions_automation
ON automation_executions(automation_id);

CREATE INDEX IF NOT EXISTS idx_automation_executions_status
ON automation_executions(status);

CREATE INDEX IF NOT EXISTS idx_automation_executions_user
ON automation_executions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_human_requests_execution
ON automation_human_requests(execution_id);

CREATE INDEX IF NOT EXISTS idx_automation_human_requests_pending
ON automation_human_requests(user_id, responded_at)
WHERE responded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_automation_logs_execution
ON automation_logs(execution_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
ON automation_logs(automation_id, timestamp DESC);

-- ============ Enable Realtime for logs ============
-- This allows the frontend to subscribe to log updates
DO $$
BEGIN
  -- Add automation_logs to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'automation_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE automation_logs;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if publication doesn't exist or table already added
  NULL;
END $$;

DO $$
BEGIN
  -- Add automation_executions to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE automation_executions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if publication doesn't exist or table already added
  NULL;
END $$;

-- ============ Function to clear old logs on new execution ============
-- When a new execution starts, clear logs from previous runs
CREATE OR REPLACE FUNCTION clear_old_automation_logs()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete logs from previous executions of this automation
  DELETE FROM automation_logs
  WHERE automation_id = NEW.automation_id
    AND execution_id != NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to clear old logs when new execution starts
DROP TRIGGER IF EXISTS trigger_clear_old_logs ON automation_executions;
CREATE TRIGGER trigger_clear_old_logs
  AFTER INSERT ON automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION clear_old_automation_logs();

-- ============ Function to update automation last_run status ============
CREATE OR REPLACE FUNCTION update_automation_last_run()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update when execution completes or fails
  IF NEW.status IN ('completed', 'failed', 'waiting_input', 'paused') THEN
    UPDATE automations
    SET
      last_run_at = NOW(),
      last_run_status = CASE
        WHEN NEW.status = 'completed' THEN 'success'
        WHEN NEW.status = 'failed' THEN 'error'
        WHEN NEW.status IN ('waiting_input', 'paused') THEN 'warning'
        ELSE NULL
      END,
      last_run_message = CASE
        WHEN NEW.status = 'failed' THEN NEW.error
        WHEN NEW.status = 'waiting_input' THEN 'Waiting for input'
        WHEN NEW.status = 'paused' THEN 'Paused'
        ELSE 'Completed successfully'
      END
    WHERE id = NEW.automation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_run status
DROP TRIGGER IF EXISTS trigger_update_last_run ON automation_executions;
CREATE TRIGGER trigger_update_last_run
  AFTER UPDATE ON automation_executions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_automation_last_run();

-- ============ Comment on columns ============
COMMENT ON COLUMN automations.yaml_definition IS 'YAML workflow definition - source of truth for the automation';
COMMENT ON COLUMN automations.workflow_version IS 'Schema version of the YAML workflow (for future migrations)';
COMMENT ON COLUMN automations.trigger_config IS 'Parsed trigger configuration from YAML';
COMMENT ON COLUMN automations.cron_expression IS 'Normalized cron expression for scheduling (5-field format)';
COMMENT ON COLUMN automations.required_inputs IS 'Pre-configured inputs: {fieldName: {value, sensitive, humanInput, description}}';
COMMENT ON COLUMN automations.output_config IS 'Output configuration: [{type, channel, template}]';
COMMENT ON COLUMN automations.display_name IS 'User-friendly display name for the automation';
COMMENT ON COLUMN automations.category IS 'Category for grouping automations (e.g., marketing, sales, ops)';
COMMENT ON COLUMN automations.last_run_status IS 'Status of last run: success (green), warning (yellow), error (red)';
COMMENT ON COLUMN automation_prompt_history.response_yaml IS 'YAML workflow generated/modified by this prompt';

COMMENT ON TABLE automation_inputs IS 'Stores pre-configured input values, with sensitive flag for vault integration';
COMMENT ON TABLE automation_executions IS 'Tracks each automation run with input collection and step progress';
COMMENT ON TABLE automation_human_requests IS 'Pending human input/approval requests with notification tracking';
COMMENT ON TABLE automation_logs IS 'Real-time execution logs, cleared on each new run for the automation';

-- ============ Add notification_config to automations ============
-- Stores detected notification tools and user preferences
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS notification_config JSONB DEFAULT '{"channels": [], "preferences": {}}';

-- ============ Add webhook_secret to automations ============
-- Secret for validating webhook calls to /api/ai/automations/[id]/hook
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- ============ Add webhook_enabled to automations ============
-- Whether webhook trigger is enabled
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN DEFAULT false;

-- ============ Add input_url to automation_human_requests ============
-- The URL where user can provide input
ALTER TABLE automation_human_requests
ADD COLUMN IF NOT EXISTS input_url TEXT;

-- ============ Add required_fields to automation_human_requests ============
-- List of fields that need input
ALTER TABLE automation_human_requests
ADD COLUMN IF NOT EXISTS required_fields JSONB DEFAULT '[]';

-- ============ Create index for webhook lookups ============
CREATE INDEX IF NOT EXISTS idx_automations_webhook
ON automations(id, webhook_enabled)
WHERE webhook_enabled = true;

-- ============ Create index for pending human requests ============
CREATE INDEX IF NOT EXISTS idx_automation_human_requests_user_pending
ON automation_human_requests(user_id, created_at DESC)
WHERE responded_at IS NULL;

-- ============ Enable Realtime for human requests ============
-- So frontend can show pending input requests
DO $$
BEGIN
  -- Add automation_human_requests to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'automation_human_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE automation_human_requests;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if publication doesn't exist or table already added
  NULL;
END $$;

-- ============ Comments ============
COMMENT ON COLUMN automations.notification_config IS 'Detected notification tools and user preferences: {channels: [{type, connector_id, tool_name}], preferences: {}}';
COMMENT ON COLUMN automations.webhook_secret IS 'Secret for validating webhook calls (compare with X-Webhook-Secret header)';
COMMENT ON COLUMN automations.webhook_enabled IS 'Whether the automation can be triggered via webhook';
COMMENT ON COLUMN automation_human_requests.input_url IS 'URL for user to provide input: /automation/{id}/running/{runId}/input';
COMMENT ON COLUMN automation_human_requests.required_fields IS 'Fields requiring input: [{name, type, description}]';

-- Extend packages to support 'mcp' type and store MCP config as JSON

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_type_check
  CHECK (type IN ('plugin', 'skill', 'practitioner', 'mcp'));

ALTER TABLE packages ADD COLUMN IF NOT EXISTS config_json JSONB;

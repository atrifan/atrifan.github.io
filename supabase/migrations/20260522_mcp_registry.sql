-- Extend packages to support 'mcp' type and store MCP config as JSON

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_type_check
  CHECK (type IN ('plugin', 'skill', 'practitioner', 'mcp'));

ALTER TABLE packages ADD COLUMN IF NOT EXISTS config_json JSONB;

-- Track which users installed which MCP servers on their devices
CREATE TABLE IF NOT EXISTS user_mcp_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_mcp UNIQUE (user_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mcp_installs_user ON user_mcp_installs(user_id);
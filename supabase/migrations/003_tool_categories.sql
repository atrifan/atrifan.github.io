-- ============ Tool Categories Table ============
-- Dynamic categories that can be added by users

CREATE TABLE IF NOT EXISTS tool_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '📦',
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  user_id TEXT, -- NULL for system categories
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tool_categories_user_id ON tool_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_categories_is_system ON tool_categories(is_system);

-- Insert default system categories
INSERT INTO tool_categories (name, icon, description, is_system, user_id) VALUES
  ('Health & Fitness', '💪', 'Health, fitness, and wellness tools', true, NULL),
  ('Finance', '💰', 'Financial calculations and tools', true, NULL),
  ('Date & Time', '📅', 'Date, time, and timezone tools', true, NULL),
  ('Fun & Games', '🎲', 'Entertainment and gaming tools', true, NULL),
  ('Utilities', '🔧', 'General utility tools', true, NULL),
  ('Astronomy', '🌟', 'Space and astronomy tools', true, NULL)
ON CONFLICT (name) DO NOTHING;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_tool_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tool_categories_updated_at ON tool_categories;
CREATE TRIGGER trigger_tool_categories_updated_at
  BEFORE UPDATE ON tool_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_categories_updated_at();

-- Note: We're keeping the CHECK constraint on tools.category for now
-- In a future migration, we could remove it and use a foreign key instead
-- ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_category_check;
-- ALTER TABLE tools ADD CONSTRAINT tools_category_fk FOREIGN KEY (category) REFERENCES tool_categories(name);


-- Remove restrictive CHECK constraint and add Notifications category
-- This migration removes the CHECK constraint that limits tool categories to a fixed list,
-- allowing dynamic categories to be created via the tool_categories table

-- Drop the existing CHECK constraint to allow any category value
ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_category_check;

-- Add Notifications to tool_categories table
INSERT INTO tool_categories (name, icon, description, is_system, user_id) VALUES
  ('Notifications', '🔔', 'Notification and messaging tools', true, NULL)
ON CONFLICT (name) DO NOTHING;

-- Note: We're intentionally NOT adding a foreign key constraint to allow flexibility
-- Tools can reference categories that may be added later or by different users
-- The application layer should validate categories against tool_categories when needed

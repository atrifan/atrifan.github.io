-- ============ Multiple Categories per Tool ============
-- Add categories array column to tools table

-- Add categories array column (keeping category for backward compatibility)
ALTER TABLE tools ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- Migrate existing category to categories array
UPDATE tools SET categories = ARRAY[category] WHERE categories = '{}' OR categories IS NULL;

-- Create index for array searches
CREATE INDEX IF NOT EXISTS idx_tools_categories ON tools USING GIN(categories);

-- Note: We keep the original 'category' column for backward compatibility
-- The 'category' column will be the primary/first category
-- The 'categories' column will contain all categories including the primary one


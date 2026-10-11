-- Marketplace surface: new package kinds, catalog wire-format fields, verification and the
-- catalog view the marketplace pages page/sort/filter over.
--
-- Names are NOT schema-qualified (applies to `public` in Supabase and to a throwaway schema in
-- tests). Requires 20260521_packages.sql, 20260522_mcp_registry.sql and
-- 20260703_package_ratings_discovery.sql. Additive only, except that the packages.type CHECK is
-- widened with 'a2a', 'subagent' and 'workflow'.

-- 1. Kinds: A2A agents, sub-agents and workflows.
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_type_check
  CHECK (type IN ('plugin', 'skill', 'practitioner', 'mcp', 'a2a', 'subagent', 'workflow'));

-- 2. Catalog fields.
--    tags            capability tags (filter chips, search); lower-case slugs
--    category        one of the fixed categories in src/lib/marketplace/kinds.ts
--    publisher_name  display name of the publisher at publish time (owner_user_id stays the key)
--    long_description  Markdown, rendered sanitised on the detail page
--    files_hash      sha256 of the latest artifact (zip bytes, or canonical config JSON)
--    provenance      e.g. {"translated_from": "claude-code:feature-dev"}; NULL = first-party
--    verified_at/by  set when an admin approves the package
ALTER TABLE packages ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS publisher_name TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS files_hash TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS provenance JSONB;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS verified_by TEXT;
CREATE INDEX IF NOT EXISTS idx_packages_tags ON packages USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category);

ALTER TABLE package_versions ADD COLUMN IF NOT EXISTS files_hash TEXT;

-- 3. Packages joined with their aggregate rating, so the catalog can sort by rating and page
--    with one query.
CREATE OR REPLACE VIEW package_catalog AS
  SELECT p.*,
         s.avg_rating,
         COALESCE(s.rating_count, 0) AS rating_count
  FROM packages p
  LEFT JOIN package_rating_stats s ON s.package_id = p.id;

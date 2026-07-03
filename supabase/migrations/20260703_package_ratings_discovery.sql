-- Marketplace: ratings/reviews, install tracking, ownership, and moderation.
-- Enables discover/publish/install via API + MCP, plus a publisher analytics view.

-- ============ Ratings / reviews ============
CREATE TABLE IF NOT EXISTS package_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_package_rating_user UNIQUE (package_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_package_ratings_pkg ON package_ratings(package_id);

-- ============ Package columns for marketplace ============
-- Denormalized install/download counter (incremented far more than aggregated).
ALTER TABLE packages ADD COLUMN IF NOT EXISTS install_count INTEGER NOT NULL DEFAULT 0;
-- Publisher/owner for API-key publishing (admin uploads may leave this null).
ALTER TABLE packages ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
-- Moderation gate. Admin uploads default 'public'; API-key publishes land 'pending'.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'pending', 'private'));
CREATE INDEX IF NOT EXISTS idx_packages_owner ON packages(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_packages_visibility ON packages(visibility);

-- ============ Install/download event log (for publisher analytics over time) ============
CREATE TABLE IF NOT EXISTS package_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_package_installs_pkg ON package_installs(package_id);
CREATE INDEX IF NOT EXISTS idx_package_installs_pkg_created ON package_installs(package_id, created_at DESC);

-- ============ Aggregate rating view ============
CREATE OR REPLACE VIEW package_rating_stats AS
  SELECT package_id,
         ROUND(AVG(rating)::numeric, 2) AS avg_rating,
         COUNT(*)::int AS rating_count
  FROM package_ratings
  GROUP BY package_id;

-- ============ Atomic install-count increment ============
CREATE OR REPLACE FUNCTION increment_install_count(pkg_id TEXT)
RETURNS void LANGUAGE sql AS $$
  UPDATE packages SET install_count = install_count + 1 WHERE id = pkg_id;
$$;

-- ============ RLS (service role bypasses; app filters by user_id) ============
ALTER TABLE package_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access ratings" ON package_ratings FOR ALL USING (true);

ALTER TABLE package_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access installs" ON package_installs FOR ALL USING (true);

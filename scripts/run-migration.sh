e#!/bin/bash
# Run a SQL migration file against Supabase
# Usage: ./scripts/run-migration.sh <migration-file.sql>

set -e

# Load .env.local
if [ -f .env.local ]; then
  export $(grep -E '^STORAGE_POSTGRES_URL=' .env.local | xargs)
fi

if [ -z "$STORAGE_POSTGRES_URL" ]; then
  echo "Error: STORAGE_POSTGRES_URL not found in .env.local"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <migration-file.sql>"
  echo "Example: $0 supabase/migrations/003_remove_deprecated_tools.sql"
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "Error: File not found: $1"
  exit 1
fi

echo "Running migration: $1"
psql "$STORAGE_POSTGRES_URL" -f "$1"
echo "Migration complete!"


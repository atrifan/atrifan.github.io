/**
 * Writing packages before the 20261205 migration is applied. Pure.
 *
 * The publish path writes the new catalog columns (tags, files_hash, provenance, …). Against a
 * database without them PostgREST answers PGRST204 (Postgres: 42703); the service then retries
 * with the legacy columns only, so API-key publishing keeps working during a deploy that lands
 * before the migration.
 */

export const LEGACY_PACKAGE_COLUMNS = [
  'id', 'name', 'description', 'type', 'latest_version', 'blob_url', 'created_at', 'updated_at', 'created_by',
  'config_json', 'install_count', 'owner_user_id', 'visibility',
] as const;

export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST204' || error.code === '42703');
}

export function legacyRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([k]) => (LEGACY_PACKAGE_COLUMNS as readonly string[]).includes(k)),
  );
}

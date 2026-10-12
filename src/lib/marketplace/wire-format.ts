/**
 * Package rows -> the discover response (catalog wire format) and the catalog cards. Pure apart
 * from node:crypto for hashing.
 *
 * Discover keeps every field it always had and adds the catalog wire format the assistant reads
 * (assistant docs/plans/tulzo-marketplace-and-claude-integration.md, Wave A): `kind`, `title`,
 * `capabilities`, `files_hash`, `install_url`, `provenance` (omitted for first-party packages)
 * and `badges`.
 */
import { createHash } from 'node:crypto';
import { installMode, wireKind, type PackageKind } from './kinds';

/** A `packages` row, or a `package_catalog` view row (which adds avg_rating / rating_count). */
export interface PackageRecord {
  id: string;
  name: string;
  description: string | null;
  type: PackageKind;
  latest_version: string;
  blob_url: string;
  config_json: Record<string, unknown> | null;
  install_count: number;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
  visibility: string;
  // 20261205 columns (absent before the migration)
  tags?: string[] | null;
  category?: string | null;
  publisher_name?: string | null;
  long_description?: string | null;
  files_hash?: string | null;
  provenance?: unknown;
  verified_at?: string | null;
  // package_catalog view
  avg_rating?: number | string | null;
  rating_count?: number | null;
}

export interface RatingStats {
  avg_rating: number | string | null;
  rating_count: number;
}

export interface Provenance {
  translated_from: string;
}

export interface DiscoverResult {
  id: string;
  name: string;
  description: string | null;
  type: PackageKind;
  version: string;
  rating: number | null;
  rating_count: number;
  install_count: number;
  install: {
    source_type: 'archive' | 'mcp' | 'a2a';
    blob_url?: string;
    config_json?: Record<string, unknown> | null;
  };
  updated_at: string;
  // Catalog wire format
  kind: string;
  title: string;
  capabilities: string[];
  files_hash: string | null;
  install_url: string | null;
  provenance?: Provenance;
  badges: string[];
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function provenanceOf(value: unknown): Provenance | undefined {
  const t = (value as Record<string, unknown> | null | undefined)?.translated_from;
  return typeof t === 'string' && t ? { translated_from: t } : undefined;
}

export function publisherName(row: Pick<PackageRecord, 'owner_user_id'> & { publisher_name?: string | null }): string {
  const name = row.publisher_name?.trim();
  if (name) return name;
  return row.owner_user_id ? 'Community publisher' : 'Tulzo';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** Where the installable artifact lives: the zip, the MCP endpoint, or the A2A agent card. */
function installUrl(row: PackageRecord): string | null {
  const mode = installMode(row.type);
  const cfg = row.config_json ?? {};
  if (mode === 'archive') return str(row.blob_url);
  if (mode === 'a2a') return str(cfg.card_url);
  return cfg.transport === 'stdio' ? null : str(cfg.url);
}

function badgesOf(row: PackageRecord): string[] {
  const badges: string[] = [];
  if (row.verified_at) badges.push('verified');
  if (provenanceOf(row.provenance)) badges.push('translated');
  return badges;
}

export function toDiscoverResult(row: PackageRecord, stats?: RatingStats): DiscoverResult {
  const mode = installMode(row.type);
  const provenance = provenanceOf(row.provenance);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    type: row.type,
    version: row.latest_version,
    rating: toNumber(stats ? stats.avg_rating : row.avg_rating),
    rating_count: (stats ? stats.rating_count : row.rating_count) ?? 0,
    install_count: row.install_count ?? 0,
    install:
      mode === 'archive'
        ? { source_type: 'archive', blob_url: row.blob_url }
        : { source_type: mode, config_json: row.config_json ?? null },
    updated_at: row.updated_at,
    kind: wireKind(row.type),
    title: row.name,
    capabilities: row.tags ?? [],
    files_hash: row.files_hash ?? null,
    install_url: installUrl(row),
    ...(provenance ? { provenance } : {}),
    badges: badgesOf(row),
  };
}

/** What the catalog cards and the detail page render. */
export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  longDescription: string | null;
  type: PackageKind;
  version: string;
  publisher: string;
  ownerUserId: string | null;
  category: string | null;
  tags: string[];
  rating: number | null;
  ratingCount: number;
  installs: number;
  verified: boolean;
  translatedFrom: string | null;
  blobUrl: string;
  config: Record<string, unknown> | null;
  filesHash: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export function toCatalogItem(row: PackageRecord): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    longDescription: row.long_description ?? null,
    type: row.type,
    version: row.latest_version,
    publisher: publisherName(row),
    ownerUserId: row.owner_user_id,
    category: row.category ?? null,
    tags: row.tags ?? [],
    rating: toNumber(row.avg_rating),
    ratingCount: row.rating_count ?? 0,
    installs: row.install_count ?? 0,
    verified: !!row.verified_at,
    translatedFrom: provenanceOf(row.provenance)?.translated_from ?? null,
    blobUrl: row.blob_url,
    config: row.config_json ?? null,
    filesHash: row.files_hash ?? null,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** JSON with object keys sorted at every level, so equal configs hash equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function configFilesHash(config: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(canonicalJson(config)).digest('hex')}`;
}

export function bytesFilesHash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

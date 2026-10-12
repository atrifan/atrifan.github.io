/**
 * Marketplace Service
 *
 * Single implementation of discover / catalog / detail / publish / install-report / publisher
 * stats / moderation, shared by the HTTP routes (app/api/marketplace/*, app/api/packages/*), the
 * MCP tools (marketplace_discover / marketplace_publish / marketplace_install in /api/mcp) and the
 * marketplace pages (app/(marketplace)/marketplace/*).
 *
 * Auth (API-key gating) is handled by the callers via `authenticateApiKey` below, which reuses
 * the same Bearer -> SHA-256 hash -> api_keys lookup as the plugin endpoints
 * (app/api/oauth/plugin/verify). Signed-in web callers are resolved in
 * src/lib/marketplace/web-auth.ts.
 *
 * Every publish lands `pending`; an admin makes it public (and verified) with moderatePackage.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getApiKeyByHash, hashApiKey } from './supabase-services';
import { isFreePlan } from '../config/billing.config';
import { CATALOG_PAGE_SIZE, pageCount, type CatalogQuery } from './marketplace/catalog-query';
import { isMissingColumnError, legacyRow } from './marketplace/db-compat';
import { installMode, isPackageKind, slugify, type PackageKind } from './marketplace/kinds';
import { validatePublishInput } from './marketplace/publish-validation';
import { enqueue, type NotificationType, type PayloadInput } from './notify';
import { bucketStart } from './notify/inapp';
import {
  configFilesHash,
  toCatalogItem,
  toDiscoverResult,
  type CatalogItem,
  type DiscoverResult,
  type PackageRecord,
} from './marketplace/wire-format';

export { parseCatalogQuery } from './marketplace/catalog-query';
export type { DiscoverResult } from './marketplace/wire-format';

// Untyped client against the STORAGE project (same one the packages routes use), because the
// ratings/installs tables, the rating-stats and catalog views aren't in the Database type.
// Reads are never served from Next's fetch cache: the catalog must show approvals at once.
function getClient(): SupabaseClient {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) },
    },
  );
}

export interface MarketplaceAuth {
  userId: string;
  plan: 'free' | 'pro' | 'plus' | 'super';
}

export type AuthOutcome =
  | { ok: true; auth: MarketplaceAuth }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Validate a Tulzo API key from an Authorization: Bearer header value and
 * require a paid plan. Mirrors app/api/oauth/plugin/verify/route.ts.
 */
export async function authenticateApiKey(authHeader: string | null): Promise<AuthOutcome> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }
  const key = authHeader.slice(7).trim();
  if (!key) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  const record = await getApiKeyByHash(hashApiKey(key));
  if (!record || !record.is_active) {
    return { ok: false, status: 401, error: 'Invalid or revoked API key' };
  }
  if (isFreePlan(record.plan)) {
    return { ok: false, status: 403, error: 'plan_required' };
  }
  return { ok: true, auth: { userId: record.user_id, plan: record.plan } };
}

/**
 * Search text safe inside a PostgREST `or=(…ilike…)` filter. `null` means the caller typed
 * something but nothing searchable is left (e.g. only `%`), which matches nothing.
 */
function searchTerm(q: string | undefined): string | null | undefined {
  if (!q) return undefined;
  const safe = q.replace(/[%,()*\\:"]/g, ' ').replace(/\s+/g, ' ').trim();
  return safe || null;
}

async function ratingStats(supabase: SupabaseClient, ids: string[]) {
  const { data: stats } = await supabase.from('package_rating_stats').select('*').in('package_id', ids);
  const byId = new Map<string, { avg_rating: number | null; rating_count: number }>();
  for (const s of stats || []) byId.set(s.package_id, { avg_rating: s.avg_rating, rating_count: s.rating_count });
  return byId;
}

// ============ Discover (API key / MCP) ============

export interface DiscoverParams {
  q?: string;
  type?: string;
  tag?: string;
  limit?: number;
}

/**
 * List public, installable marketplace packages, most-installed first, in the catalog wire
 * format. Reads the packages table (not the catalog view) so it keeps working on a database
 * without the 20261205 migration.
 */
export async function discoverPackages(params: DiscoverParams): Promise<DiscoverResult[]> {
  const supabase = getClient();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const term = searchTerm(params.q);
  if (term === null) return [];

  let query = supabase
    .from('packages')
    .select('*')
    .eq('visibility', 'public')
    .order('install_count', { ascending: false })
    .limit(limit);

  if (params.type && isPackageKind(params.type)) query = query.eq('type', params.type);
  if (params.tag) query = query.contains('tags', [slugify(params.tag)]);
  if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);

  const { data: packages, error } = await query;
  if (error) throw new Error(error.message);
  if (!packages || packages.length === 0) return [];

  const stats = await ratingStats(supabase, packages.map((p) => p.id));
  return packages.map((p) => toDiscoverResult(p as PackageRecord, stats.get(p.id) ?? { avg_rating: null, rating_count: 0 }));
}

// ============ Catalog (public pages + /api/marketplace/catalog) ============

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/**
 * One page of public packages from the package_catalog view (packages + rating), filtered and
 * sorted like the catalog URL says. `ids` restricts to those packages (the "installed" filter,
 * whose ids come from the device).
 */
export async function queryCatalog(
  query: CatalogQuery & { ids?: string[] },
  opts: { pageSize?: number } = {},
): Promise<CatalogPage> {
  const pageSize = opts.pageSize ?? CATALOG_PAGE_SIZE;
  const empty: CatalogPage = { items: [], total: 0, page: query.page, pageSize, pages: 1 };
  const term = searchTerm(query.q);
  if (term === null || (query.ids && query.ids.length === 0)) return empty;

  const supabase = getClient();
  let q = supabase.from('package_catalog').select('*', { count: 'exact' }).eq('visibility', 'public');
  if (query.kind) q = q.eq('type', query.kind);
  if (query.category) q = q.eq('category', query.category);
  if (query.tag) q = q.contains('tags', [query.tag]);
  if (query.ids) q = q.in('id', query.ids.slice(0, 200));
  if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);

  if (query.sort === 'new') {
    q = q.order('created_at', { ascending: false });
  } else if (query.sort === 'top') {
    q = q
      .order('avg_rating', { ascending: false, nullsFirst: false })
      .order('rating_count', { ascending: false })
      .order('install_count', { ascending: false });
  } else {
    q = q.order('install_count', { ascending: false });
  }
  q = q.order('name', { ascending: true });

  const from = (query.page - 1) * pageSize;
  const { data, count, error } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return {
    items: (data ?? []).map((r) => toCatalogItem(r as PackageRecord)),
    total,
    page: query.page,
    pageSize,
    pages: pageCount(total, pageSize),
  };
}

/** Public packages for the marketplace sitemap (id, visibility, last change); [] on any error. */
export async function listPackagesForSitemap(limit = 1000): Promise<Array<{ id: string; visibility: string; updatedAt: string }>> {
  try {
    const { data, error } = await getClient()
      .from('package_catalog')
      .select('id, visibility, updated_at')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; visibility: string; updated_at: string }>).map((r) => ({ id: r.id, visibility: r.visibility, updatedAt: r.updated_at }));
  } catch (err) {
    console.error('[marketplace] sitemap packages failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ============ Package detail ============

export interface PackageDetail {
  item: CatalogItem;
  versions: Array<{ version: string; changelog: string | null; created_at: string }>;
  reviews: Array<{ rating: number; review: string | null; created_at: string }>;
}

/** A public package by id, or by the slug of its name (`github-tools`). Null when not public. */
export async function getPackageDetail(slugOrId: string): Promise<PackageDetail | null> {
  const supabase = getClient();
  const { data: byId } = await supabase
    .from('package_catalog')
    .select('*')
    .eq('id', slugOrId)
    .eq('visibility', 'public')
    .maybeSingle();
  let row = byId as PackageRecord | null;
  if (!row) {
    const slug = slugify(slugOrId);
    if (!slug) return null;
    const { data: candidates } = await supabase
      .from('package_catalog')
      .select('*')
      .eq('visibility', 'public')
      .ilike('name', `%${slug.split('-').join('%')}%`)
      .limit(50);
    row = ((candidates ?? []) as PackageRecord[]).find((c) => slugify(c.name) === slug) ?? null;
  }
  if (!row) return null;

  const [{ data: versions }, { data: reviews }] = await Promise.all([
    supabase
      .from('package_versions')
      .select('version, changelog, created_at')
      .eq('package_id', row.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('package_ratings')
      .select('rating, review, created_at')
      .eq('package_id', row.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  return { item: toCatalogItem(row), versions: versions ?? [], reviews: reviews ?? [] };
}

// ============ Publish ============

export interface PublishInput {
  id: string;
  name: string;
  description?: string;
  type: string;
  version?: string;
  /** For type='mcp' and type='a2a' */
  config_json?: Record<string, unknown> | null;
  /** For archive types: a blob URL already uploaded by the caller. */
  blob_url?: string;
  tags?: string[] | string;
  category?: string;
  long_description?: string;
  /** sha256 of the uploaded archive (computed by the route); config kinds are hashed here. */
  files_hash?: string;
  provenance?: Record<string, unknown> | null;
}

export type PublishOutcome =
  | { ok: true; id: string; version: string; visibility: string; url?: string }
  | { ok: false; status: 400 | 403; error: string };

/** Upsert, retrying with the legacy columns if the 20261205 migration isn't applied yet. */
async function upsertCompat(
  supabase: SupabaseClient,
  table: 'packages' | 'package_versions',
  row: Record<string, unknown>,
  onConflict?: string,
) {
  const opts = onConflict ? { onConflict } : undefined;
  const first = await supabase.from(table).upsert(row, opts);
  if (!isMissingColumnError(first.error)) return first;
  const legacy = table === 'packages' ? legacyRow(row) : Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'files_hash'));
  return supabase.from(table).upsert(legacy, opts);
}

/**
 * Validate and upsert a package (new package or new version). Every publish lands as
 * `visibility: 'pending'` and unverified until an admin approves it. A non-owner can't overwrite
 * someone else's package. `publisherName` (signed-in web publishes) is shown on the cards.
 */
export async function publishPackage(
  auth: MarketplaceAuth,
  input: PublishInput,
  opts: { publisherName?: string | null } = {},
): Promise<PublishOutcome> {
  const checked = validatePublishInput(input as unknown as Record<string, unknown>);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  const v = checked.value;
  const supabase = getClient();

  const { data: existing } = await supabase
    .from('packages')
    .select('id, owner_user_id')
    .eq('id', v.id)
    .maybeSingle();
  if (existing && existing.owner_user_id && existing.owner_user_id !== auth.userId) {
    return { ok: false, status: 403, error: 'not_owner' };
  }

  const filesHash = v.files_hash ?? (v.config_json ? configFilesHash(v.config_json) : null);
  const row: Record<string, unknown> = {
    id: v.id,
    name: v.name,
    description: v.description,
    type: v.type,
    latest_version: v.version,
    blob_url: v.blob_url,
    updated_at: new Date().toISOString(),
    created_by: auth.userId,
    owner_user_id: auth.userId,
    visibility: 'pending',
    config_json: v.config_json,
    tags: v.tags,
    category: v.category,
    long_description: v.long_description,
    files_hash: filesHash,
    provenance: v.provenance,
    verified_at: null,
    verified_by: null,
    ...(opts.publisherName ? { publisher_name: opts.publisherName } : {}),
  };
  const { error: pkgError } = await upsertCompat(supabase, 'packages', row);
  if (pkgError) return { ok: false, status: 400, error: pkgError.message };

  await upsertCompat(
    supabase,
    'package_versions',
    { package_id: v.id, version: v.version, blob_url: v.blob_url, files_hash: filesHash },
    'package_id,version',
  );

  return { ok: true, id: v.id, version: v.version, visibility: 'pending', url: v.blob_url || undefined };
}

// ============ Install report ============

/**
 * Record a successful install/download: logs an event row and bumps the denormalized
 * install_count. Called after the client actually installs. `requirePublic` (web installs)
 * refuses packages that aren't in the public catalog.
 */
export async function recordInstall(
  auth: Pick<MarketplaceAuth, 'userId'>,
  packageId: string,
  version?: string,
  opts: { requirePublic?: boolean } = {},
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const supabase = getClient();

  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, latest_version, visibility, owner_user_id')
    .eq('id', packageId)
    .maybeSingle();
  if (!pkg || (opts.requirePublic && pkg.visibility !== 'public')) {
    return { ok: false, status: 404, error: 'Package not found' };
  }

  const installedVersion = version || pkg.latest_version;
  await supabase.from('package_installs').insert({
    package_id: packageId,
    user_id: auth.userId,
    version: installedVersion,
  });
  await supabase.rpc('increment_install_count', { pkg_id: packageId });

  // Tell the publisher (never who installed). In-app aggregates per package per hour, so the
  // email key is per hour too; the email itself is off unless the publisher switches it on.
  if (pkg.owner_user_id && pkg.owner_user_id !== auth.userId) {
    await notifySafe(
      pkg.owner_user_id,
      'package_installed',
      { packageId, packageName: pkg.name || packageId, version: installedVersion || undefined },
      `package_installed:${packageId}:${bucketStart(new Date()).toISOString()}`,
    );
  }
  return { ok: true };
}

/** Best effort: a notification that can't be queued never fails the marketplace action. */
async function notifySafe<T extends NotificationType>(userId: string, type: T, payload: PayloadInput<T>, dedupeKey: string): Promise<void> {
  try {
    await enqueue(userId, type, payload, dedupeKey);
  } catch (err) {
    console.error(`[marketplace] could not notify ${type}:`, err instanceof Error ? err.message : String(err));
  }
}

// ============ Publisher stats ============

export interface PublisherPackageStats {
  id: string;
  name: string;
  type: PackageKind;
  visibility: string;
  latest_version: string;
  install_count: number;
  avg_rating: number | null;
  rating_count: number;
  /** For "New version" in the publisher page. */
  description: string;
  config_json: Record<string, unknown> | null;
  tags: string[];
  category: string | null;
  long_description: string | null;
}

/**
 * Per-package analytics for packages owned by `userId`: total downloads and ratings. Powers the
 * publisher page.
 */
export async function getPublisherStats(userId: string): Promise<PublisherPackageStats[]> {
  const supabase = getClient();

  const { data: packages, error } = await supabase
    .from('packages')
    .select('*')
    .eq('owner_user_id', userId)
    .order('install_count', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!packages || packages.length === 0) return [];

  const stats = await ratingStats(supabase, packages.map((p) => p.id));
  return packages.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    visibility: p.visibility,
    latest_version: p.latest_version,
    install_count: p.install_count ?? 0,
    avg_rating: stats.get(p.id)?.avg_rating != null ? Number(stats.get(p.id)!.avg_rating) : null,
    rating_count: stats.get(p.id)?.rating_count ?? 0,
    description: p.description ?? '',
    config_json: p.config_json ?? null,
    tags: p.tags ?? [],
    category: p.category ?? null,
    long_description: p.long_description ?? null,
  }));
}

// ============ Install / publish activity ============

/** An install event without the installer: the only shape activity views ever see. */
export interface AnonymousInstall {
  packageId: string;
  version: string | null;
  at: string;
}

const ACTIVITY_LIMIT = 10_000;

/** The user's packages and every install of them (anonymous: user_id is never selected). */
export async function getPublisherInstallEvents(userId: string): Promise<{ packages: Array<{ id: string; name: string }>; installs: AnonymousInstall[] }> {
  const supabase = getClient();
  const { data: packages, error } = await supabase.from('packages').select('id, name').eq('owner_user_id', userId).order('name');
  if (error) throw new Error(error.message);
  const ids = (packages ?? []).map((p) => p.id as string);
  if (ids.length === 0) return { packages: [], installs: [] };
  const { data: installs, error: installsError } = await supabase
    .from('package_installs')
    .select('package_id, version, created_at')
    .in('package_id', ids)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (installsError) throw new Error(installsError.message);
  return {
    packages: (packages ?? []).map((p) => ({ id: p.id as string, name: (p.name as string) || (p.id as string) })),
    installs: (installs ?? []).map((i) => ({ packageId: i.package_id as string, version: (i.version as string | null) ?? null, at: i.created_at as string })),
  };
}

export interface PackageActivityRow {
  packageId: string;
  packageName: string;
  version: string | null;
  at: string;
}

/**
 * Admin: installs and published versions in [start, end) (newest first, up to `limit` rows each)
 * plus the exact counts. Installs stay anonymous here too.
 */
export async function getMarketplaceActivity(
  start: string,
  end: string,
  limit = 100,
): Promise<{ installs: PackageActivityRow[]; installCount: number; publishes: Array<PackageActivityRow & { visibility: string }>; publishCount: number }> {
  const supabase = getClient();
  const [installs, publishes] = await Promise.all([
    supabase.from('package_installs').select('package_id, version, created_at', { count: 'exact' }).gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).limit(limit),
    supabase.from('package_versions').select('package_id, version, created_at', { count: 'exact' }).gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).limit(limit),
  ]);
  if (installs.error) throw new Error(installs.error.message);
  if (publishes.error) throw new Error(publishes.error.message);
  const ids = [...new Set([...(installs.data ?? []), ...(publishes.data ?? [])].map((r) => r.package_id as string))];
  const { data: pkgs, error } = ids.length ? await supabase.from('packages').select('id, name, visibility').in('id', ids) : { data: [], error: null };
  if (error) throw new Error(error.message);
  const byId = new Map((pkgs ?? []).map((p) => [p.id as string, p as { id: string; name: string | null; visibility: string }]));
  const row = (r: Record<string, unknown>): PackageActivityRow => ({
    packageId: r.package_id as string,
    packageName: byId.get(r.package_id as string)?.name || (r.package_id as string),
    version: (r.version as string | null) ?? null,
    at: r.created_at as string,
  });
  return {
    installs: (installs.data ?? []).map(row),
    installCount: installs.count ?? 0,
    publishes: (publishes.data ?? []).map((r) => ({ ...row(r), visibility: byId.get(r.package_id as string)?.visibility ?? 'unknown' })),
    publishCount: publishes.count ?? 0,
  };
}

// ============ Moderation (admin) ============

export const VISIBILITIES = ['pending', 'public', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export function isVisibility(v: unknown): v is Visibility {
  return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v);
}

/** Packages with one visibility (newest change first) plus the count per visibility. */
export async function listModerationQueue(
  visibility: Visibility,
): Promise<{ items: CatalogItem[]; counts: Record<Visibility, number> }> {
  const supabase = getClient();
  const [{ data, error }, ...counts] = await Promise.all([
    supabase.from('package_catalog').select('*').eq('visibility', visibility).order('updated_at', { ascending: false }).limit(200),
    ...VISIBILITIES.map((vis) => supabase.from('packages').select('id', { count: 'exact', head: true }).eq('visibility', vis)),
  ]);
  if (error) throw new Error(error.message);
  return {
    items: (data ?? []).map((r) => toCatalogItem(r as PackageRecord)),
    counts: Object.fromEntries(VISIBILITIES.map((vis, i) => [vis, counts[i].count ?? 0])) as Record<Visibility, number>,
  };
}

/** Set a package's visibility. Approving (public) verifies it; anything else clears that. */
export async function moderatePackage(
  id: string,
  visibility: Visibility,
  adminUserId: string,
): Promise<{ ok: true } | { ok: false; status: 404 | 500; error: string }> {
  const supabase = getClient();
  const now = new Date().toISOString();
  const { data: before } = await supabase.from('packages').select('name, visibility, owner_user_id, latest_version').eq('id', id).maybeSingle();
  const update: Record<string, unknown> = {
    visibility,
    updated_at: now,
    verified_at: visibility === 'public' ? now : null,
    verified_by: visibility === 'public' ? adminUserId : null,
  };
  let res = await supabase.from('packages').update(update).eq('id', id).select('id');
  if (isMissingColumnError(res.error)) {
    res = await supabase.from('packages').update({ visibility, updated_at: now }).eq('id', id).select('id');
  }
  if (res.error) return { ok: false, status: 500, error: res.error.message };
  if (!res.data || res.data.length === 0) return { ok: false, status: 404, error: 'Package not found' };

  // A pending publish that an admin decides on: tell the owner.
  if (before?.owner_user_id && before.visibility === 'pending' && visibility !== 'pending') {
    const payload = { packageId: id, packageName: before.name || id };
    const key = `${id}:${before.latest_version ?? ''}`;
    if (visibility === 'public') await notifySafe(before.owner_user_id, 'package_approved', payload, `package_approved:${key}`);
    else await notifySafe(before.owner_user_id, 'package_rejected', payload, `package_rejected:${key}`);
  }
  return { ok: true };
}

/** Delete a package and return its versions' blob URLs (the caller deletes the blobs). */
export async function deletePackage(id: string): Promise<{ ok: true; blobUrls: string[] } | { ok: false; error: string }> {
  const supabase = getClient();
  const { data: versions } = await supabase.from('package_versions').select('blob_url').eq('package_id', id);
  const { error } = await supabase.from('packages').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, blobUrls: (versions ?? []).map((v) => v.blob_url).filter(Boolean) };
}

/** True for kinds installed from an uploaded archive (the publish route uploads those). */
export function needsArchive(type: string): boolean {
  return isPackageKind(type) && installMode(type) === 'archive';
}

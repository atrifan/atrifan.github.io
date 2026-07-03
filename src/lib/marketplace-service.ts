/**
 * Marketplace Service
 *
 * Single implementation of discover / publish / install-report / publisher-stats,
 * shared by the HTTP routes (app/api/marketplace/*) and the MCP tools
 * (marketplace_discover / marketplace_publish / marketplace_install in /api/mcp).
 *
 * Auth (API-key gating) is handled by the callers via `authenticateApiKey` below,
 * which reuses the same Bearer -> SHA-256 hash -> api_keys lookup as the plugin
 * endpoints (app/api/oauth/plugin/verify).
 */

import { createClient } from '@supabase/supabase-js';
import { getApiKeyByHash, hashApiKey } from './supabase-services';
import { isFreePlan } from '../config/billing.config';
import type { PackageType } from '../types/supabase';

// Untyped client against the STORAGE project (same one the packages routes use),
// because the ratings/installs tables + rating-stats view aren't in the Database type.
function getClient() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface MarketplaceAuth {
  userId: string;
  plan: 'free' | 'pro' | 'plus';
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

// ============ Discover ============

export interface DiscoverParams {
  q?: string;
  type?: string;
  limit?: number;
}

export interface DiscoverResult {
  id: string;
  name: string;
  description: string | null;
  type: PackageType;
  version: string;
  rating: number | null;
  rating_count: number;
  install_count: number;
  install: {
    source_type: 'archive' | 'mcp';
    blob_url?: string;
    config_json?: Record<string, unknown> | null;
  };
  updated_at: string;
}

const VALID_TYPES: PackageType[] = ['plugin', 'skill', 'practitioner', 'mcp'];

/**
 * List public, installable marketplace packages, most-installed first.
 * Merges aggregate ratings from the package_rating_stats view.
 */
export async function discoverPackages(params: DiscoverParams): Promise<DiscoverResult[]> {
  const supabase = getClient();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  let query = supabase
    .from('packages')
    .select('*')
    .eq('visibility', 'public')
    .order('install_count', { ascending: false })
    .limit(limit);

  if (params.type && VALID_TYPES.includes(params.type as PackageType)) {
    query = query.eq('type', params.type);
  }
  if (params.q) {
    const safe = params.q.replace(/[%,]/g, ' ').trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data: packages, error } = await query;
  if (error) throw new Error(error.message);
  if (!packages || packages.length === 0) return [];

  // Merge aggregate ratings for these ids.
  const ids = packages.map((p) => p.id);
  const { data: stats } = await supabase
    .from('package_rating_stats')
    .select('*')
    .in('package_id', ids);

  const statsById = new Map<string, { avg_rating: number | null; rating_count: number }>();
  for (const s of stats || []) {
    statsById.set(s.package_id, { avg_rating: s.avg_rating, rating_count: s.rating_count });
  }

  return packages.map((p) => {
    const stat = statsById.get(p.id);
    const isMcp = p.type === 'mcp';
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      type: p.type,
      version: p.latest_version,
      rating: stat?.avg_rating ?? null,
      rating_count: stat?.rating_count ?? 0,
      install_count: p.install_count ?? 0,
      install: isMcp
        ? { source_type: 'mcp' as const, config_json: p.config_json ?? null }
        : { source_type: 'archive' as const, blob_url: p.blob_url },
      updated_at: p.updated_at,
    };
  });
}

// ============ Publish ============

export interface PublishInput {
  id: string;
  name: string;
  description?: string;
  type: string;
  version?: string;
  /** For type='mcp' */
  config_json?: Record<string, unknown> | null;
  /** For archive types: a blob URL already uploaded by the caller. */
  blob_url?: string;
}

export type PublishOutcome =
  | { ok: true; id: string; version: string; visibility: string; url?: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Validate and upsert a package published via API key. User-published packages
 * land as `visibility: 'pending'` and require admin moderation to go public.
 * A non-admin may only create a new package or update one they own.
 */
export async function publishPackage(
  auth: MarketplaceAuth,
  input: PublishInput
): Promise<PublishOutcome> {
  if (!input.id || !input.name || !input.type) {
    return { ok: false, status: 400, error: 'Missing required fields: id, name, type' };
  }
  if (!VALID_TYPES.includes(input.type as PackageType)) {
    return { ok: false, status: 400, error: 'Invalid type. Must be plugin, skill, practitioner, or mcp' };
  }

  const version = input.version || '1.0.0';
  const supabase = getClient();

  let configJson: Record<string, unknown> | null = null;
  if (input.type === 'mcp') {
    const cfg = input.config_json as { transport?: string; url?: string; command?: string } | null;
    if (!cfg) {
      return { ok: false, status: 400, error: 'MCP type requires config_json' };
    }
    if (!cfg.transport || !['http', 'sse', 'stdio'].includes(cfg.transport)) {
      return { ok: false, status: 400, error: 'config_json must include transport (http, sse, or stdio)' };
    }
    if ((cfg.transport === 'http' || cfg.transport === 'sse') && !cfg.url) {
      return { ok: false, status: 400, error: 'config_json must include url for http/sse transport' };
    }
    if (cfg.transport === 'stdio' && !cfg.command) {
      return { ok: false, status: 400, error: 'config_json must include command for stdio transport' };
    }
    configJson = input.config_json ?? null;
  } else if (!input.blob_url) {
    return { ok: false, status: 400, error: 'Missing package archive (blob_url)' };
  }

  // Ownership check: block overwriting a package owned by someone else.
  const { data: existing } = await supabase
    .from('packages')
    .select('id, owner_user_id')
    .eq('id', input.id)
    .maybeSingle();

  if (existing && existing.owner_user_id && existing.owner_user_id !== auth.userId) {
    return { ok: false, status: 403, error: 'not_owner' };
  }

  const blobUrl = input.blob_url || '';

  const { error: pkgError } = await supabase.from('packages').upsert({
    id: input.id,
    name: input.name,
    description: input.description || '',
    type: input.type,
    latest_version: version,
    blob_url: blobUrl,
    updated_at: new Date().toISOString(),
    created_by: auth.userId,
    owner_user_id: auth.userId,
    visibility: 'pending',
    ...(configJson ? { config_json: configJson } : {}),
  });
  if (pkgError) return { ok: false, status: 400, error: pkgError.message };

  if (blobUrl) {
    await supabase
      .from('package_versions')
      .upsert({ package_id: input.id, version, blob_url: blobUrl }, { onConflict: 'package_id,version' });
  }

  return { ok: true, id: input.id, version, visibility: 'pending', url: blobUrl || undefined };
}

// ============ Install report ============

/**
 * Record a successful install/download: logs an event row and bumps the
 * denormalized install_count. Called after the client actually installs.
 */
export async function recordInstall(
  auth: MarketplaceAuth,
  packageId: string,
  version?: string
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const supabase = getClient();

  const { data: pkg } = await supabase
    .from('packages')
    .select('id, latest_version')
    .eq('id', packageId)
    .maybeSingle();
  if (!pkg) return { ok: false, status: 404, error: 'Package not found' };

  await supabase.from('package_installs').insert({
    package_id: packageId,
    user_id: auth.userId,
    version: version || pkg.latest_version,
  });
  await supabase.rpc('increment_install_count', { pkg_id: packageId });

  return { ok: true };
}

// ============ Publisher stats ============

export interface PublisherPackageStats {
  id: string;
  name: string;
  type: PackageType;
  visibility: string;
  latest_version: string;
  install_count: number;
  avg_rating: number | null;
  rating_count: number;
}

/**
 * Per-package analytics for packages owned by `userId`: total downloads and
 * ratings. Powers the publisher view in the control panel.
 */
export async function getPublisherStats(userId: string): Promise<PublisherPackageStats[]> {
  const supabase = getClient();

  const { data: packages, error } = await supabase
    .from('packages')
    .select('*')
    .eq('owner_user_id', userId)
    .order('install_count', { ascending: false });
  if (error) throw new Error(error.message);
  if (!packages || packages.length === 0) return [];

  const ids = packages.map((p) => p.id);
  const { data: stats } = await supabase
    .from('package_rating_stats')
    .select('*')
    .in('package_id', ids);
  const statsById = new Map<string, { avg_rating: number | null; rating_count: number }>();
  for (const s of stats || []) {
    statsById.set(s.package_id, { avg_rating: s.avg_rating, rating_count: s.rating_count });
  }

  return packages.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    visibility: p.visibility,
    latest_version: p.latest_version,
    install_count: p.install_count ?? 0,
    avg_rating: statsById.get(p.id)?.avg_rating ?? null,
    rating_count: statsById.get(p.id)?.rating_count ?? 0,
  }));
}

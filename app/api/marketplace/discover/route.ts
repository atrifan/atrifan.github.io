import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, discoverPackages } from '@/src/lib/marketplace-service';
import { serviceSupabase } from '@/src/lib/service-supabase';

/**
 * Marketplace discovery — API-key-gated (paid plan required).
 *
 * The browser assistant calls this as a tool to find installable skills, plugins, MCP servers,
 * A2A agents, sub-agents and workflows. Each result carries the catalog wire format (kind,
 * title, capabilities, files_hash, install_url, provenance, badges) next to the original fields.
 *
 *   GET /api/marketplace/discover?q=<search>&type=<kind>&tag=<capability>&limit=<n>
 *   Authorization: Bearer <tulzo_api_key>
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateApiKey(req.headers.get('authorization'));
  if (!authResult.ok) {
    const body =
      authResult.status === 403
        ? { valid: false, error: 'plan_required', plan: 'free' }
        : { error: authResult.error };
    return NextResponse.json(body, { status: authResult.status });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || undefined;
  const type = searchParams.get('type') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const limitRaw = searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

  let results;
  try {
    results = await discoverPackages({ q, type, tag, limit: Number.isNaN(limit) ? undefined : limit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Discovery failed' }, { status: 500 });
  }

  // Best-effort usage logging (uses the main app DB where api_usage_log lives).
  try {
    const usageDb = serviceSupabase();
    await usageDb.from('api_usage_log').insert({
      user_id: authResult.auth.userId,
      event_type: 'marketplace_discover',
      metadata: { q, type, count: results.length },
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ results, count: results.length, plan: authResult.auth.plan });
}

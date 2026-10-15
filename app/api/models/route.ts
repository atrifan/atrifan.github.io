import { NextRequest, NextResponse } from 'next/server';
import { serviceSupabase } from '@/src/lib/service-supabase';
import { authenticatePluginKey } from '@/src/lib/plugin-auth';
import { buildCatalog, fetchVercelListing } from '@/src/lib/models/catalog';
import { chatBillingMarkup } from '@/src/lib/ai-gateway';

/**
 * GET /api/models: every chat model the Vercel AI Gateway offers, as callable through /api/chat, with
 * context window, output limit, capabilities and the per-1M price Tulzo bills (Vercel × markup).
 * Auth: Authorization: Bearer <api key> (same rules as /api/plugin/config). See docs/models-api.md.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticatePluginKey(req, serviceSupabase());
  if (auth instanceof NextResponse) return auth;
  const listing = await fetchVercelListing();
  return NextResponse.json(
    { object: 'list', data: buildCatalog(listing, chatBillingMarkup()) },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}

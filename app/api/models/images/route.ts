import { NextRequest, NextResponse } from 'next/server';
import { serviceSupabase } from '@/src/lib/service-supabase';
import { authenticatePluginKey } from '@/src/lib/plugin-auth';
import { buildImageCatalog, fetchVercelListing } from '@/src/lib/models/catalog';
import { chatBillingMarkup } from '@/src/lib/ai-gateway';

/**
 * GET /api/models/images: every model Tulzo can call through /api/images/generations,
 * including image-only models and language models with image output capability,
 * with the price Tulzo bills and the route's response formats.
 * Auth: Authorization: Bearer <api key> (same rules as /api/plugin/config).
 */
export async function GET(req: NextRequest) {
  const auth = await authenticatePluginKey(req, serviceSupabase());
  if (auth instanceof NextResponse) return auth;
  const listing = await fetchVercelListing();
  return NextResponse.json(
    { object: 'list', data: buildImageCatalog(listing, chatBillingMarkup()) },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}

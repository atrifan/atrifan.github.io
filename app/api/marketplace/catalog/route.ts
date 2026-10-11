import { NextRequest, NextResponse } from 'next/server';
import { parseCatalogQuery, queryCatalog } from '@/src/lib/marketplace-service';

/**
 * The public catalog (no auth): the same filters, sort and paging as the /marketplace page URL.
 * `ids=a,b,c` restricts to those packages; the page uses it for "Installed only", with ids the
 * device reported through the extension bridge.
 *
 *   GET /api/marketplace/catalog?q=&kind=&category=&tag=&sort=popular|new|top&page=&ids=
 *   → { items, total, page, pageSize, pages }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = parseCatalogQuery(searchParams);
  const idsParam = searchParams.get('ids');
  const ids = idsParam === null ? undefined : idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const page = await queryCatalog({ ...query, ids: query.installed && ids === undefined ? [] : ids });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Catalog unavailable' }, { status: 500 });
  }
}

import type { Metadata } from 'next';
import { catalogSearch, hasActiveFilters, parseCatalogQuery } from '@/src/lib/marketplace/catalog-query';
import { queryCatalog } from '@/src/lib/marketplace-service';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { Catalog, type CatalogPageData } from '@/src/views/marketplace/Catalog';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Record<string, string | string[] | undefined> };

const DESCRIPTION =
  'Find and install skills, MCP servers, A2A agents, sub-agents, plugins and workflows for the Tulzo assistant.';

export function generateMetadata({ searchParams }: Props): Metadata {
  const query = parseCatalogQuery(searchParams);
  // Each filtered view is its own shareable page; "installed" is per device, so it isn't indexed.
  const canonical = absoluteSurfaceUrl('marketplace', `/${catalogSearch({ ...query, installed: false })}`);
  return {
    title: 'Marketplace',
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: { title: 'Tulzo Marketplace', description: DESCRIPTION, url: canonical },
    ...(query.installed || (hasActiveFilters(query) && query.q) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** The public catalog (marketplace.tulzo.online/, or /marketplace in path-prefix mode). */
export default async function MarketplacePage({ searchParams }: Props) {
  const query = parseCatalogQuery(searchParams);
  let initial: CatalogPageData | null = null;
  if (!query.installed) {
    try {
      const page = await queryCatalog(query);
      initial = { items: page.items, total: page.total, page: page.page, pages: page.pages };
    } catch (e) {
      console.error('[marketplace] catalog query failed', e);
    }
  }
  return <Catalog query={query} initial={initial} />;
}

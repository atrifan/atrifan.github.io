import type { MetadataRoute } from 'next';
import { seoEnv, sitemapFor } from '@/src/lib/seo';
import { requestSurface } from '@/src/lib/request-surface';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { GIGS_DOC_PAGES, gigsJobSitemapEntries } from '@/src/lib/jobs/client/seo';
import { loadOpenJobsForSitemap } from '@/src/lib/jobs/ui/loaders';
import { marketplaceSitemapEntries } from '@/src/lib/marketplace/sitemap';
import { listPackagesForSitemap } from '@/src/lib/marketplace-service';

// Lists the open gigs jobs and the public marketplace packages, read per request, for this host's surface.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const surface = requestSurface();
  const env = seoEnv(surface);
  const entries: MetadataRoute.Sitemap = [...sitemapFor(surface, env)];
  if (surface === null || surface === 'marketplace') {
    entries.push(...marketplaceSitemapEntries(await listPackagesForSitemap(), env));
  }
  if (surface === null || surface === 'gigs') {
    const docs = GIGS_DOC_PAGES.map((p) => ({ url: absoluteSurfaceUrl('gigs', p, env), changeFrequency: 'weekly' as const }));
    entries.push(...docs, ...gigsJobSitemapEntries(await loadOpenJobsForSitemap(), env));
  }
  return entries;
}

import type { MetadataRoute } from 'next';
import { sitemapFor } from '@/src/lib/seo';
import { resolveSurface } from '@/src/lib/surface-routing';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { GIGS_DOC_PAGES, gigsJobSitemapEntries } from '@/src/lib/jobs/client/seo';
import { loadOpenJobsForSitemap } from '@/src/lib/jobs/ui/loaders';

// Lists the open gigs jobs, read per request.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const surface = resolveSurface(process.env.TULZO_SURFACE);
  const entries = sitemapFor(surface);
  if (surface !== null && surface !== 'gigs') return entries;
  const docs = GIGS_DOC_PAGES.map((p) => ({ url: absoluteSurfaceUrl('gigs', p), changeFrequency: 'weekly' as const }));
  return [...entries, ...docs, ...gigsJobSitemapEntries(await loadOpenJobsForSitemap())];
}

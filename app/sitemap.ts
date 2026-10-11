import type { MetadataRoute } from 'next';
import { sitemapFor } from '@/src/lib/seo';
import { resolveSurface } from '@/src/lib/surface-routing';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(resolveSurface(process.env.TULZO_SURFACE));
}

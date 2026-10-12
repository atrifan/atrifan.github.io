/** Sitemap entries for public marketplace package pages (app/sitemap.ts). Pure. */
import { absoluteSurfaceUrl } from '../site-url';

type Env = Record<string, string | undefined>;

export interface SitemapPackage {
  id: string;
  visibility: string;
  updatedAt: string;
}

/** One entry per public package, at the detail page's canonical URL (same as its metadata). */
export function marketplaceSitemapEntries(
  packages: readonly SitemapPackage[],
  env: Env = process.env,
): Array<{ url: string; lastModified: string; changeFrequency: 'weekly' }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; lastModified: string; changeFrequency: 'weekly' }> = [];
  for (const p of packages) {
    if (p.visibility !== 'public' || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ url: absoluteSurfaceUrl('marketplace', `/${encodeURIComponent(p.id)}`, env), lastModified: p.updatedAt, changeFrequency: 'weekly' });
  }
  return out;
}

/**
 * SEO helpers for the public gigs pages: JobPosting-like JSON-LD, the MCP endpoint URLs
 * shown in the docs, and sitemap entries for open jobs. Pure (env passed in).
 */
import { absoluteSurfaceUrl } from '../../site-url';
import { surfaceUrl } from '../../surface-url';
import { categoryLabel } from './format';

type Env = Record<string, string | undefined>;

/** Public docs pages on the gigs surface (surface-local paths), for the sitemap. */
export const GIGS_DOC_PAGES: readonly string[] = ['/docs/mcp'];

/** Job statuses whose page is public and worth indexing. */
const INDEXED_STATUSES = new Set(['open']);

export interface SeoJob {
  id: string;
  title: string;
  description: string;
  category: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  status: string;
}

function salary(min: number | null, max: number | null) {
  if (min == null && max == null) return undefined;
  const euros = (c: number) => c / 100;
  const value =
    min != null && max != null && min !== max
      ? { '@type': 'QuantitativeValue', minValue: euros(min), maxValue: euros(max), unitText: 'PROJECT' }
      : { '@type': 'QuantitativeValue', value: euros((max ?? min) as number), unitText: 'PROJECT' };
  return { '@type': 'MonetaryAmount', currency: 'EUR', value };
}

export function jobPostingJsonLd(job: SeoJob, url: string): Record<string, unknown> {
  const pay = salary(job.budget_min_cents, job.budget_max_cents);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.created_at,
    ...(job.deadline ? { validThrough: job.deadline } : {}),
    employmentType: 'CONTRACTOR',
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' },
    directApply: true,
    ...(job.category ? { industry: categoryLabel(job.category) } : {}),
    url,
    identifier: { '@type': 'PropertyValue', name: 'Tulzo Gigs', value: job.id },
    hiringOrganization: { '@type': 'Organization', name: 'Tulzo Gigs', sameAs: url },
    ...(pay ? { baseSalary: pay } : {}),
  };
}

const UNSAFE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** JSON for a <script type="application/ld+json">, safe against `</script>` injection. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => UNSAFE[ch]);
}

/**
 * API routes are not under the surface prefix, so in path-prefix mode (no root domain)
 * they live on this deploy's own origin.
 */
function apiUrl(surface: 'gigs' | 'hub', path: string, env: Env): string {
  const rootDomain = (env.NEXT_PUBLIC_ROOT_DOMAIN ?? '').trim();
  if (rootDomain) return surfaceUrl(surface, path, { rootDomain });
  return absoluteSurfaceUrl('hub', path, env);
}

export function jobsMcpUrl(env: Env = process.env): string {
  return apiUrl('gigs', '/api/jobs/mcp', env);
}

export function adminQaMcpUrl(env: Env = process.env): string {
  return apiUrl('hub', '/api/admin/qa/mcp', env);
}

export function gigsJobSitemapEntries(
  jobs: readonly SeoJob[],
  env: Env = process.env,
): Array<{ url: string; lastModified: string; changeFrequency: 'daily' }> {
  return jobs
    .filter((j) => INDEXED_STATUSES.has(j.status))
    .map((j) => ({ url: absoluteSurfaceUrl('gigs', `/jobs/${j.id}`, env), lastModified: j.updated_at, changeFrequency: 'daily' as const }));
}

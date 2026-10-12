import { describe, expect, it } from 'vitest';
import {
  GIGS_DOC_PAGES,
  adminQaMcpUrl,
  gigsJobSitemapEntries,
  jobPostingJsonLd,
  jobsMcpUrl,
  serializeJsonLd,
} from '@/src/lib/jobs/client/seo';

const job = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'CSV import endpoint',
  description: 'Build an endpoint that imports CSV files.',
  category: 'development',
  budget_min_cents: 20000,
  budget_max_cents: 40000,
  deadline: '2027-03-01T12:00:00.000Z',
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-02T09:00:00.000Z',
  status: 'open',
};

describe('jobPostingJsonLd', () => {
  it('describes an open job as a remote contractor JobPosting with a EUR budget', () => {
    expect(jobPostingJsonLd(job, 'https://gigs.tulzo.online/jobs/x')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'CSV import endpoint',
      description: 'Build an endpoint that imports CSV files.',
      datePosted: '2026-10-01T09:00:00.000Z',
      validThrough: '2027-03-01T12:00:00.000Z',
      employmentType: 'CONTRACTOR',
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' },
      directApply: true,
      industry: 'Development',
      url: 'https://gigs.tulzo.online/jobs/x',
      identifier: { '@type': 'PropertyValue', name: 'Tulzo Gigs', value: job.id },
      hiringOrganization: { '@type': 'Organization', name: 'Tulzo Gigs', sameAs: 'https://gigs.tulzo.online/jobs/x' },
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'EUR',
        value: { '@type': 'QuantitativeValue', minValue: 200, maxValue: 400, unitText: 'PROJECT' },
      },
    });
  });

  it('leaves out the deadline and budget when there are none', () => {
    const ld = jobPostingJsonLd({ ...job, deadline: null, budget_min_cents: null, budget_max_cents: null, category: null }, 'u');
    expect(ld).not.toHaveProperty('validThrough');
    expect(ld).not.toHaveProperty('baseSalary');
    expect(ld).not.toHaveProperty('industry');
  });

  it('uses a single value for a one-sided or fixed budget', () => {
    expect(jobPostingJsonLd({ ...job, budget_min_cents: null }, 'u').baseSalary).toEqual({
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', value: 400, unitText: 'PROJECT' },
    });
    expect(jobPostingJsonLd({ ...job, budget_max_cents: null }, 'u').baseSalary).toMatchObject({ value: { value: 200 } });
    expect(jobPostingJsonLd({ ...job, budget_min_cents: 30050, budget_max_cents: 30050 }, 'u').baseSalary).toMatchObject({ value: { value: 300.5 } });
  });
});

describe('serializeJsonLd', () => {
  it('escapes characters that could close the script tag', () => {
    const out = serializeJsonLd({ title: '</script><script>alert(1)</script> & \u2028' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c/script\\u003e');
    expect(out).toContain('\\u0026');
    expect(out).toContain('\\u2028');
    expect(JSON.parse(out)).toEqual({ title: '</script><script>alert(1)</script> & \u2028' });
  });
});

describe('MCP URLs', () => {
  it('puts the Jobs MCP on the gigs host and the admin QA MCP on the hub', () => {
    const env = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' };
    expect(jobsMcpUrl(env)).toBe('https://gigs.tulzo.online/api/jobs/mcp');
    expect(adminQaMcpUrl(env)).toBe('https://tulzo.online/api/admin/qa/mcp');
  });

  it('uses this deploy origin in path-prefix mode (APIs are not under /gigs)', () => {
    expect(jobsMcpUrl({ PORT: '3100' })).toBe('http://localhost:3100/api/jobs/mcp');
    expect(jobsMcpUrl({ VERCEL_URL: 'preview.vercel.app' })).toBe('https://preview.vercel.app/api/jobs/mcp');
    expect(adminQaMcpUrl({})).toBe('http://localhost:3000/api/admin/qa/mcp');
  });
});

describe('sitemap entries', () => {
  it('lists the public docs pages', () => {
    expect(GIGS_DOC_PAGES).toEqual(['/docs/mcp']);
  });

  it('lists open jobs at their canonical URL with their last change', () => {
    const env = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' };
    expect(gigsJobSitemapEntries([job], env)).toEqual([
      { url: `https://gigs.tulzo.online/jobs/${job.id}`, lastModified: '2026-10-02T09:00:00.000Z', changeFrequency: 'daily' },
    ]);
    expect(gigsJobSitemapEntries([job], { PORT: '3100' })[0].url).toBe(`http://localhost:3100/gigs/jobs/${job.id}`);
  });

  it('never lists jobs that are not public', () => {
    const rows = ['draft', 'cancelled', 'open', 'awarded'].map((status, i) => ({ ...job, id: String(i), status }));
    expect(gigsJobSitemapEntries(rows, { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' }).map((e) => e.url)).toEqual([
      'https://gigs.tulzo.online/jobs/2',
    ]);
  });
});

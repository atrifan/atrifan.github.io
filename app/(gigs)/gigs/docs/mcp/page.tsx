import type { Metadata } from 'next';
import { McpDocs } from '@/src/views/gigs/McpDocs';
import { jobsMcpUrl, serializeJsonLd } from '@/src/lib/jobs/client/seo';
import { percentFromBps } from '@/src/lib/jobs/client/pricing';
import { gigsConfig } from '@/src/lib/jobs/ui/config';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { surfaceUrl } from '@/src/lib/surface-url';

const TITLE = 'Jobs MCP: connect your AI agent to Tulzo Gigs';
const DESCRIPTION =
  'Set up the Tulzo Jobs MCP in Claude Code, Claude Desktop, Cursor, the Tex assistant or any MCP client. Sign in with OAuth, link Stripe, bid on jobs and submit work for QA.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteSurfaceUrl('gigs', '/docs/mcp') },
  openGraph: { type: 'article', url: absoluteSurfaceUrl('gigs', '/docs/mcp'), title: TITLE, description: DESCRIPTION },
};

export default function Page() {
  const { base, bps } = gigsConfig();
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: TITLE,
    description: DESCRIPTION,
    url: absoluteSurfaceUrl('gigs', '/docs/mcp'),
    publisher: { '@type': 'Organization', name: 'Tulzo' },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <McpDocs mcpUrl={jobsMcpUrl()} profileUrl={surfaceUrl('hub', '/profile')} base={base} commissionPercent={percentFromBps(bps)} />
    </>
  );
}

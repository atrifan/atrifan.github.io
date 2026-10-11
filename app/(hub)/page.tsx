import type { Metadata } from 'next';
import { HubHome } from '@/src/views/hub/HubHome';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';
import { organizationJsonLd } from '@/src/lib/hub-seo';

const TITLE = 'Tulzo: your AI assistant, its tools and its work';
const DESCRIPTION =
  'Run Tex, a sandboxed AI assistant, manage keys and usage, install skills and MCP servers, hire AI agents for software gigs and chat from anywhere.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/' },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function Home() {
  const jsonLd = organizationJsonLd(absoluteSurfaceUrl('hub', '/'));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <HubHome />
    </>
  );
}

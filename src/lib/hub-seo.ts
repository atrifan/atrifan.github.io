import type { Metadata } from 'next';

/** Organization JSON-LD for the hub landing, as a string safe to put in a <script>. */
export function organizationJsonLd(siteUrl: string): string {
  const url = siteUrl.replace(/\/+$/, '') + '/';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tulzo',
    url,
    logo: new URL('/tulzo-logo.png', url).toString(),
    description: 'Tulzo is home to Tex, a sandboxed AI assistant, plus a marketplace of skills and gigs for AI agents.',
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Signed-in or admin pages: never indexed. */
export const NOINDEX: Metadata['robots'] = { index: false, follow: false };

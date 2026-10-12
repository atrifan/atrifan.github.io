/** Small link helpers shared by the legal documents. */
import type { ReactNode } from 'react';
import type { LegalFacts } from '@/src/lib/legal/facts';
import { surfaceUrl } from '@/src/lib/surface-url';
import type { LegalSlug } from './types';

export const IUBENDA_PRIVACY_URL = 'https://www.iubenda.com/privacy-policy/11077306';
export const IUBENDA_COOKIE_URL = 'https://www.iubenda.com/privacy-policy/11077306/cookie-policy';
export const EU_CONSUMER_DISPUTES_URL = 'https://consumer-redress.ec.europa.eu/index_en';

export const legalHref = (slug: LegalSlug | null, hash?: string) =>
  surfaceUrl('hub', slug ? `/legal/${slug}${hash ? `#${hash}` : ''}` : '/legal');

/** A link to another legal document (or a section of it). */
export function DocLink({ slug, hash, children }: { slug: LegalSlug; hash?: string; children: ReactNode }) {
  return <a href={legalHref(slug, hash)}>{children}</a>;
}

/** The support address as a mailto link, or the complaints form when it isn't configured. */
export function ContactEmail({ facts }: { facts: LegalFacts }) {
  if (facts.contactEmail) return <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>;
  return <a href={legalHref('complaints', 'form')}>our contact form</a>;
}

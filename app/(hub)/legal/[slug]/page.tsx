import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { legalFacts } from '@/src/lib/legal/facts';
import { LEGAL_DOCS, LEGAL_ORDER } from '@/src/views/legal/content';
import { LegalDocView } from '@/src/views/legal/LegalDocView';
import { ComplaintForm } from '@/src/views/legal/ComplaintForm';
import type { LegalSlug } from '@/src/views/legal/types';

/**
 * Hub /legal/<slug>: terms, payments, disclaimers, acceptable-use, marketplace-publishers,
 * complaints, imprint. Rendered per request so the numbers (auto-accept and claim days,
 * commission) and the contact/operator lines follow the deploy's env (src/lib/legal/facts.ts).
 */
export const dynamic = 'force-dynamic';

const isSlug = (s: string): s is LegalSlug => (LEGAL_ORDER as string[]).includes(s);

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  if (!isSlug(params.slug)) return {};
  const doc = LEGAL_DOCS[params.slug](legalFacts());
  const path = `/legal/${params.slug}`;
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: path },
    openGraph: { title: `${doc.title} | Tulzo`, description: doc.description, url: path },
  };
}

export default function LegalDocument({ params }: { params: { slug: string } }) {
  if (!isSlug(params.slug)) notFound();
  const facts = legalFacts();
  const doc = LEGAL_DOCS[params.slug](facts);
  const complaints = params.slug === 'complaints';
  return (
    <LegalDocView doc={doc} facts={facts} extraToc={complaints ? [{ id: 'form', title: 'Send a complaint or report' }] : []}>
      {complaints ? <ComplaintForm responseDays={facts.complaintResponseDays} /> : null}
    </LegalDocView>
  );
}

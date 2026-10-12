import type { Metadata } from 'next';
import { legalFacts } from '@/src/lib/legal/facts';
import { LEGAL_DOCS, LEGAL_ORDER } from '@/src/views/legal/content';
import { IUBENDA_COOKIE_URL, IUBENDA_PRIVACY_URL, legalHref } from '@/src/views/legal/links';

const DESCRIPTION = "Tulzo's terms, payments and refunds, disclaimers, acceptable use, publisher terms, complaints, imprint, privacy and cookies.";

export const metadata: Metadata = {
  title: 'Legal',
  description: DESCRIPTION,
  alternates: { canonical: '/legal' },
  openGraph: { title: 'Legal | Tulzo', description: DESCRIPTION, url: '/legal' },
};

export const dynamic = 'force-dynamic';

export default function Legal() {
  const facts = legalFacts();
  const docs = [
    ...LEGAL_ORDER.map((slug) => {
      const doc = LEGAL_DOCS[slug](facts);
      return { href: legalHref(slug), title: doc.title, desc: doc.description, external: false };
    }),
    {
      href: IUBENDA_PRIVACY_URL,
      title: 'Privacy policy',
      desc: 'What personal data we collect, why, and your rights under the GDPR. Hosted by iubenda.',
      external: true,
    },
    {
      href: IUBENDA_COOKIE_URL,
      title: 'Cookie policy',
      desc: 'Which cookies we use. Analytics and ads only run after you agree; change your choice with "Cookie settings" in the footer.',
      external: true,
    },
  ];
  return (
    <div className="page account-page">
      <header className="account-header">
        <h1>Legal</h1>
        <p className="muted">The rules for using Tulzo, how payments and refunds work, and how to reach us.</p>
      </header>
      <ul className="link-list" role="list">
        {docs.map((d) => (
          <li key={d.title}>
            <a href={d.href} rel={d.external ? 'noopener' : undefined} className="link-card">
              <strong>{d.title}</strong>
            </a>
            <span className="muted">{d.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

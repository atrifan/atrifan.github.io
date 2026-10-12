/**
 * One legal document in the shared layout: the documents nav (a select on narrow screens), the
 * version line, the summary box, the table of contents and the sections with anchor links.
 * `children` render after the sections (the complaints form) and `extraToc` lists their anchors.
 */
import type { ReactNode } from 'react';
import { legalDate, type LegalFacts } from '@/src/lib/legal/facts';
import { LEGAL_DOCS, LEGAL_ORDER } from './content';
import { legalHref } from './links';
import { LegalDocSelect } from './LegalDocSelect';
import type { LegalDoc } from './types';

export function legalNavItems(facts: LegalFacts) {
  return LEGAL_ORDER.map((slug) => ({ slug, href: legalHref(slug), title: LEGAL_DOCS[slug](facts).title }));
}

export function LegalDocView({
  doc,
  facts,
  children,
  extraToc = [],
}: {
  doc: LegalDoc;
  facts: LegalFacts;
  children?: ReactNode;
  extraToc?: { id: string; title: string }[];
}) {
  const nav = legalNavItems(facts);
  const toc = [...doc.sections.map(({ id, title }) => ({ id, title })), ...extraToc];
  const meta = [
    `Version ${facts.version}`,
    doc.showEffective ? `Effective ${legalDate(facts.effectiveDate)}` : null,
    `Last updated ${legalDate(facts.updatedDate)}`,
  ].filter(Boolean);

  return (
    <div className="page legal-page">
      <div className="legal-layout">
        <aside className="legal-aside">
          <nav aria-label="Legal documents" className="legal-nav">
            <a href={legalHref(null)} className="legal-nav-all">
              All legal documents
            </a>
            <ul role="list">
              {nav.map((n) => (
                <li key={n.slug}>
                  <a href={n.href} aria-current={n.slug === doc.slug ? 'page' : undefined}>
                    {n.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="legal-main">
          <LegalDocSelect options={nav} current={legalHref(doc.slug)} />
          <header className="legal-header">
            <h1>{doc.title}</h1>
            <p className="legal-meta muted">{meta.join(' · ')}</p>
          </header>

          <section className="legal-summary" aria-label="Summary">
            <p className="legal-summary-title">In short</p>
            <ul>
              {doc.summary.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <nav aria-label="On this page" className="legal-toc">
            <p className="legal-toc-title">On this page</p>
            <ol>
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`}>{t.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((s) => (
            <section key={s.id} className="legal-section">
              <div className="legal-section-head">
                <h2 id={s.id}>{s.title}</h2>
                <a href={`#${s.id}`} className="legal-anchor" aria-label={`Link to this section: ${s.title}`}>
                  #
                </a>
              </div>
              <div className="legal-body">{s.body}</div>
            </section>
          ))}
          {children}
        </article>
      </div>
    </div>
  );
}

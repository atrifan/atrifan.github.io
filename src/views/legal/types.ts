import type { ReactNode } from 'react';
import type { LegalFacts } from '@/src/lib/legal/facts';

export type LegalSlug = 'terms' | 'payments' | 'disclaimers' | 'acceptable-use' | 'marketplace-publishers' | 'complaints' | 'imprint';

export interface LegalSection {
  /** Anchor id, kebab-case, unique on the page. */
  id: string;
  /** h2 text. */
  title: string;
  body: ReactNode;
}

export interface LegalDoc {
  slug: LegalSlug;
  /** h1 and <title>. */
  title: string;
  /** Meta description, one sentence. */
  description: string;
  /** Bullet points in the "Summary" box at the top. */
  summary: ReactNode[];
  sections: LegalSection[];
  /** Show the "Effective <date>" line (terms only). */
  showEffective?: boolean;
}

export type LegalDocBuilder = (facts: LegalFacts) => LegalDoc;

/** The legal documents, in nav order. Draft: review with a qualified lawyer before relying on it. */
import type { LegalDocBuilder, LegalSlug } from '../types';
import { termsDoc } from './terms';
import { paymentsDoc } from './payments';
import { disclaimersDoc } from './disclaimers';
import { acceptableUseDoc } from './acceptable-use';
import { marketplacePublishersDoc } from './marketplace-publishers';
import { complaintsDoc } from './complaints';
import { imprintDoc } from './imprint';

export const LEGAL_ORDER: LegalSlug[] = ['terms', 'payments', 'disclaimers', 'acceptable-use', 'marketplace-publishers', 'complaints', 'imprint'];

export const LEGAL_DOCS: Record<LegalSlug, LegalDocBuilder> = {
  terms: termsDoc,
  payments: paymentsDoc,
  disclaimers: disclaimersDoc,
  'acceptable-use': acceptableUseDoc,
  'marketplace-publishers': marketplacePublishersDoc,
  complaints: complaintsDoc,
  imprint: imprintDoc,
};

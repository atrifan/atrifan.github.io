/**
 * /legal/marketplace-publishers: terms for business users (publishers and providers),
 * written to the P2B Regulation (EU) 2019/1150.
 *
 * Draft: review with a qualified lawyer before relying on it.
 *
 * Ranking parameters are what the code sorts by: marketplace-service.ts (discover: install
 * count; catalog: newest, top = average rating → rating count → installs, default installs,
 * then name), jobs/offers lists (newest first), bid comparison (price, delivery, trust score).
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { days } from '@/src/lib/legal/facts';
import { ContactEmail, DocLink } from '../links';
import type { LegalDoc } from '../types';

export function marketplacePublishersDoc(f: LegalFacts): LegalDoc {
  return {
    slug: 'marketplace-publishers',
    title: 'Terms for publishers and providers',
    description: 'Terms for business users of Tulzo: marketplace publishers and gigs providers, under the EU P2B Regulation.',
    summary: [
      'These terms apply on top of the general terms when you publish packages or provide services on Gigs.',
      'Every provider has their own Stripe account through Stripe Connect. Stripe verifies identity, tax details and bank account; Tulzo doesn’t store that data.',
      'Providers are paid the full bid as independent sellers and handle their own taxes. Earnings may be reported under DAC7.',
      `We explain how listings are ranked, and give at least ${days(f.businessNoticeDays)}' notice of changes and of most suspensions.`,
      'You can complain about any decision through our internal complaint system.',
    ],
    sections: [
      {
        id: 'scope',
        title: 'Who these terms are for',
        body: (
          <p>
            You are a business user when you publish a skill, plugin or MCP server on the Marketplace (a publisher) or bid on
            jobs or offer services on Gigs (a provider). These terms add to the{' '}
            <DocLink slug="terms">terms and conditions</DocLink> and the{' '}
            <DocLink slug="acceptable-use">acceptable use policy</DocLink>.
          </p>
        ),
      },
      {
        id: 'publishing',
        title: 'Publishing on the Marketplace',
        body: (
          <ul>
            <li>You need a paid plan to publish. Every new package and every new version starts as pending and is reviewed by an admin before it goes public.</li>
            <li>Only the owner of a package (or an admin) can publish new versions of it.</li>
            <li>
              You keep your rights and give Tulzo a non-exclusive, free licence to host, list and distribute the package while
              it is published. Say which licence users get; describe clearly what the package does and what access it needs.
            </li>
            <li>You can see installs and ratings for your packages on your publisher page.</li>
          </ul>
        ),
      },
      {
        id: 'providers',
        title: 'Providing services on Gigs',
        body: (
          <ul>
            <li>
              Before you can bid or offer services, you must set up your own Stripe account through Stripe Connect. Stripe
              verifies your identity (KYC), tax details and bank account. Tulzo doesn&apos;t collect or store that data.
            </li>
            <li>
              Customers pay through Stripe Checkout. The commission ({f.commissionPercent} at the moment) is paid by the customer on
              top of your bid; you receive the full bid, into your own Stripe account, after the customer accepts the work (or it
              is accepted automatically) or as an admin decides in a dispute.
            </li>
            <li>
              You sell as an independent seller. You are responsible for your own taxes, including VAT and income tax on your
              earnings. Under the EU DAC7 rules (Directive (EU) 2021/514) we may have to report your earnings to tax authorities,
              and we or Stripe may ask you for the information needed.
            </li>
            <li>
              You submit work from a private GitHub repository with a fine-grained token for that repository (at most 30 days
              valid). We store the token encrypted and delete it when it is no longer needed.
            </li>
            <li>
              Your trust score (0 to 100) is built from paid, completed or admin-resolved contracts: QA results, disputes, deadlines and customer reviews, weighted against self-dealing and repeat pairs and decaying over time. Customers see it and can sort bids by it.
            </li>
          </ul>
        ),
      },
      {
        id: 'ranking',
        title: 'How listings are ranked',
        body: (
          <>
            <p>Under article 5 of the P2B Regulation, these are the main parameters that decide the order you appear in:</p>
            <ul>
              <li>
                <strong>Marketplace catalog:</strong> by default, most installs first. Users can sort by newest (publish date) or
                top rated (average rating, then number of ratings, then installs). Ties are ordered by name. Search matches the
                name and description; filters by type and tag narrow the list.
              </li>
              <li>
                <strong>Marketplace discover API and MCP tool</strong> (used by assistants): most installs first, after search and
                filters.
              </li>
              <li>
                <strong>Gigs jobs and offers lists:</strong> newest first.
              </li>
              <li>
                <strong>Bids on a job:</strong> the customer chooses the order: lowest price, fastest delivery, or highest trust
                score.
              </li>
            </ul>
            <p>Nobody can pay for a better position. Only public, approved packages are listed.</p>
          </>
        ),
      },
      {
        id: 'data',
        title: 'Data access',
        body: (
          <ul>
            <li>Publishers see installs and ratings of their own packages. Providers see their contracts, payouts, reviews and trust score.</li>
            <li>
              We use data from your activity to run the service, compute trust scores, prevent fraud and meet legal duties. We
              don&apos;t give other business users access to your data, beyond what customers see on your listings, bids and
              contracts.
            </li>
            <li>
              More detail is in the <DocLink slug="terms" hash="privacy">privacy section</DocLink> of the terms.
            </li>
          </ul>
        ),
      },
      {
        id: 'suspension',
        title: 'Restriction, suspension and termination',
        body: (
          <>
            <p>We can restrict, suspend or end your use of the Marketplace or Gigs, or remove a package, if:</p>
            <ul>
              <li>you break these terms, the acceptable use policy or the law;</li>
              <li>a package is harmful, misleading, or infringes someone&apos;s rights;</li>
              <li>you repeatedly fail QA, abandon contracts, or are involved in fraud or chargeback abuse;</li>
              <li>we are required to by law or by an authority.</li>
            </ul>
            <p>
              We give you the reasons in writing. To end our relationship with you entirely, we give at least{' '}
              {days(30)}&apos; notice, except where the law lets us act at once (for example illegal content, a serious or
              repeated breach, or a legal obligation). You can explain or challenge the decision through the internal complaint
              system.
            </p>
          </>
        ),
      },
      {
        id: 'changes',
        title: 'Changes to these terms',
        body: (
          <p>
            We give business users at least {days(f.businessNoticeDays)}&apos; notice of changes, by email or in the app. You can end
            your contract before the change applies. Longer notice is given where a change needs you to make technical or
            commercial adjustments.
          </p>
        ),
      },
      {
        id: 'complaints',
        title: 'Internal complaint system',
        body: (
          <p>
            You can complain about any decision we made about you, about technical problems, or about how we apply these terms,
            free of charge, through the <DocLink slug="complaints" hash="form">complaints form</DocLink> or at{' '}
            <ContactEmail facts={f} />. We look at every complaint, reply within {days(f.complaintResponseDays)}, and tell you the
            outcome.
          </p>
        ),
      },
    ],
  };
}

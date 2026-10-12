/**
 * /legal/imprint: legal notice and operator identity.
 *
 * Draft: review with a qualified lawyer before relying on it.
 *
 * The operator's name, address, country, company and VAT numbers come from LEGAL_OPERATOR_NAME,
 * LEGAL_OPERATOR_ADDRESS, LEGAL_COUNTRY, LEGAL_COMPANY_NO and LEGAL_VAT_NO and are only shown when
 * set. Directive 2000/31/EC art. 5 needs at least the name and a geographic address before launch.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { ContactEmail, DocLink, EU_CONSUMER_DISPUTES_URL } from '../links';
import type { LegalDoc } from '../types';

export function imprintDoc(f: LegalFacts): LegalDoc {
  const o = f.operator;
  return {
    slug: 'imprint',
    title: 'Imprint',
    description: 'Legal notice: who runs Tulzo and how to contact us.',
    summary: [
      `${o.tradingName} runs this website and the Tulzo service.`,
      <>
        Contact: <ContactEmail facts={f} />
      </>,
    ],
    sections: [
      {
        id: 'operator',
        title: 'Operator',
        body: (
          <dl className="legal-facts">
            <dt>Service</dt>
            <dd>{o.tradingName}</dd>
            {o.legalName ? (
              <>
                <dt>Operated by</dt>
                <dd>{o.legalName}</dd>
              </>
            ) : null}
            {o.address ? (
              <>
                <dt>Address</dt>
                <dd>{o.address}</dd>
              </>
            ) : null}
            {o.country ? (
              <>
                <dt>Country</dt>
                <dd>{o.country}</dd>
              </>
            ) : null}
            {o.companyNo ? (
              <>
                <dt>Company registration number</dt>
                <dd>{o.companyNo}</dd>
              </>
            ) : null}
            {o.vatNo ? (
              <>
                <dt>VAT number</dt>
                <dd>{o.vatNo}</dd>
              </>
            ) : null}
            <dt>Email</dt>
            <dd>
              <ContactEmail facts={f} />
            </dd>
          </dl>
        ),
      },
      {
        id: 'contact',
        title: 'Contact',
        body: (
          <p>
            Email <ContactEmail facts={f} /> or use the <DocLink slug="complaints" hash="form">contact form</DocLink>. We reply
            within {f.complaintResponseDays} days.
          </p>
        ),
      },
      {
        id: 'payments',
        title: 'Payments',
        body: (
          <p>
            Payments are processed by Stripe. Subscriptions are billed through Clerk Billing. Gigs providers are paid into their
            own Stripe accounts as independent sellers.
          </p>
        ),
      },
      {
        id: 'disputes',
        title: 'Consumer disputes',
        body: (
          <p>
            EU consumers can find out-of-court dispute resolution bodies on the European Commission&apos;s{' '}
            <a href={EU_CONSUMER_DISPUTES_URL}>consumer redress page</a>.
          </p>
        ),
      },
    ],
  };
}

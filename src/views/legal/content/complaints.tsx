/**
 * /legal/complaints: how to complain or report. The page renders the form after these
 * sections (anchor #form).
 *
 * Draft: review with a qualified lawyer before relying on it.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { days } from '@/src/lib/legal/facts';
import { ContactEmail, DocLink, EU_CONSUMER_DISPUTES_URL } from '../links';
import type { LegalDoc } from '../types';

export function complaintsDoc(f: LegalFacts): LegalDoc {
  return {
    slug: 'complaints',
    title: 'Complaints and reports',
    description: 'How to complain, report illegal content or challenge a decision on Tulzo.',
    summary: [
      'Use the form below for any complaint, report or question. It is free.',
      'You get a reference number by email straight away.',
      `We reply within ${days(f.complaintResponseDays)}.`,
      'Reporting illegal content? Choose "Illegal content notice" and include the URL.',
    ],
    sections: [
      {
        id: 'how',
        title: 'How to reach us',
        body: (
          <p>
            Use the form below, or email <ContactEmail facts={f} />. Include your contract ID or the URL of the page you are
            writing about. Use the reference number in your subject when you write again, so we keep everything together.
          </p>
        ),
      },
      {
        id: 'illegal-content',
        title: 'Reporting illegal content',
        body: (
          <>
            <p>
              Under article 16 of the Digital Services Act (Regulation (EU) 2022/2065), anyone can tell us about content on
              Tulzo they think is illegal. To act on a notice we need:
            </p>
            <ul>
              <li>an explanation of why you think the content is illegal;</li>
              <li>the exact URL (or contract ID) of the content;</li>
              <li>your name and email address (you may leave them out only for notices about child sexual abuse material);</li>
              <li>a statement that you believe in good faith that the notice is accurate and complete.</li>
            </ul>
            <p>
              We confirm receipt, review the content, decide in a timely, careful and objective way, and tell you what we
              decided and how you can challenge it.
            </p>
          </>
        ),
      },
      {
        id: 'decisions',
        title: 'Challenging a decision we made',
        body: (
          <p>
            If we removed or hid your content, refused a package, or suspended or limited your account, you can complain about
            that decision for at least six months after we told you about it (article 20 of the Digital Services Act). Tell us
            which decision and why you think it was wrong. A person reviews it, not only an automated system, and we tell you the
            outcome.
          </p>
        ),
      },
      {
        id: 'business-users',
        title: 'Publishers and providers',
        body: (
          <p>
            If you publish packages or provide services on Gigs, this is also our internal complaint system under the P2B
            Regulation (EU) 2019/1150. See the <DocLink slug="marketplace-publishers">terms for publishers and providers</DocLink>.
          </p>
        ),
      },
      {
        id: 'gigs-disputes',
        title: 'Gigs disputes',
        body: (
          <p>
            For a problem with a delivery, open a dispute on the contract itself; it pauses the payout. Use this form for
            anything else, or if you can&apos;t open a dispute. See <DocLink slug="payments" hash="disputes">disputes and claims</DocLink>.
          </p>
        ),
      },
      {
        id: 'response-time',
        title: 'What happens next',
        body: (
          <ul>
            <li>You get an email with your reference number straight away.</li>
            <li>We reply within {days(f.complaintResponseDays)}. If we need longer, we tell you why.</li>
            <li>Please don&apos;t send passwords, API keys or card numbers.</li>
          </ul>
        ),
      },
      {
        id: 'consumer-disputes',
        title: 'If we can’t solve it',
        body: (
          <p>
            If you are a consumer in the EU, you can also contact your national consumer authority or an out-of-court dispute
            resolution body. The European Commission lists them on its{' '}
            <a href={EU_CONSUMER_DISPUTES_URL}>consumer redress page</a>. You can always go to court in your own country.
          </p>
        ),
      },
    ],
  };
}

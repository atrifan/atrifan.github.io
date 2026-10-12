/**
 * /legal/terms: the terms and conditions.
 *
 * Draft: review with a qualified lawyer before relying on it.
 *
 * Every number comes from `facts` (src/lib/legal/facts.ts), which reads the same env-backed
 * helpers the code uses. Operator details render only when their env vars are set.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { days } from '@/src/lib/legal/facts';
import { surfaceUrl } from '@/src/lib/surface-url';
import { ContactEmail, DocLink, EU_CONSUMER_DISPUTES_URL, IUBENDA_COOKIE_URL, IUBENDA_PRIVACY_URL } from '../links';
import type { LegalDoc } from '../types';

export function governingLaw(f: LegalFacts): string {
  return f.operator.country
    ? `the law of ${f.operator.country}`
    : "the law of the operator's country of establishment";
}

function OperatorLines({ facts }: { facts: LegalFacts }) {
  const o = facts.operator;
  return (
    <ul>
      <li>
        Service name: <strong>{o.tradingName}</strong>
      </li>
      {o.legalName ? <li>Operated by: {o.legalName}</li> : null}
      {o.address ? <li>Address: {o.address}</li> : null}
      {o.country ? <li>Country: {o.country}</li> : null}
      {o.companyNo ? <li>Company registration number: {o.companyNo}</li> : null}
      {o.vatNo ? <li>VAT number: {o.vatNo}</li> : null}
      <li>
        Email: <ContactEmail facts={facts} />
      </li>
    </ul>
  );
}

export function termsDoc(f: LegalFacts): LegalDoc {
  return {
    slug: 'terms',
    title: 'Terms and conditions',
    description: 'The rules for using Tulzo: accounts, plans, credits, the marketplace, gigs, AI agents and your rights.',
    showEffective: true,
    summary: [
      'You need to be 18 or older, and each account belongs to one person.',
      "Credits and subscriptions start straight away; once they do, the 14-day right of withdrawal ends (you agree to this at checkout). Credits can't be refunded.",
      `On gigs, Tulzo is an intermediary: the contract is between customer and provider. We hold the payment, run QA and handle disputes. The customer pays the bid plus a ${f.commissionPercent} platform commission.`,
      'You are responsible for what your AI agents do through your account. AI output can be wrong.',
      'Nothing in these terms takes away rights you have under the consumer law of your country.',
    ],
    sections: [
      {
        id: 'operator',
        title: '1. Who we are',
        body: (
          <>
            <p>
              Tulzo (&quot;Tulzo&quot;, &quot;we&quot;, &quot;us&quot;) runs the Tulzo hub, its surfaces and the Tulzo
              assistant. You can reach us at <ContactEmail facts={f} />. Full operator details are in the{' '}
              <DocLink slug="imprint">imprint</DocLink>.
            </p>
            <OperatorLines facts={f} />
          </>
        ),
      },
      {
        id: 'definitions',
        title: '2. Definitions',
        body: (
          <ul>
            <li>
              <strong>Hub</strong>: the main Tulzo site, with your account, pricing, credits and these documents.
            </li>
            <li>
              <strong>Surfaces</strong>: the parts of Tulzo with their own address: AI (the control panel for your
              assistant), Marketplace, Gigs and Chat.
            </li>
            <li>
              <strong>Assistant</strong>: the Tulzo browser assistant that runs on your own computer and connects to
              Tulzo with an API key.
            </li>
            <li>
              <strong>Agent</strong>: any AI agent or tool, including your assistant, that uses Tulzo through our API
              or MCP server with your key or account.
            </li>
            <li>
              <strong>Customer</strong>: a user who posts a job on Gigs and pays for it.
            </li>
            <li>
              <strong>Provider</strong>: a user who bids on jobs or offers services on Gigs and is paid for the work.
            </li>
            <li>
              <strong>Publisher</strong>: a user who publishes a skill, plugin or MCP server on the Marketplace.
            </li>
            <li>
              <strong>Credits</strong>: the prepaid unit for AI usage on Tulzo. 1 credit = $
              {f.creditValueUsd.toFixed(2)}.
            </li>
          </ul>
        ),
      },
      {
        id: 'accounts',
        title: '3. Your account',
        body: (
          <ul>
            <li>You must be at least 18 years old to create an account.</li>
            <li>An account is for one person. Don&apos;t share it, and don&apos;t create accounts for others without their permission.</li>
            <li>
              Keep your sign-in, your API keys and the devices your assistant runs on secure. Anyone who has your API key
              can act as you. Revoke a key straight away from the AI control panel if you think it has leaked.
            </li>
            <li>Give accurate information and keep it up to date.</li>
          </ul>
        ),
      },
      {
        id: 'plans',
        title: '4. Plans and subscriptions',
        body: (
          <>
            <p>
              Paid plans are billed in advance through Clerk Billing, our billing provider; card payments are processed
              by Stripe. Each plan includes a monthly amount of credits, shown on the{' '}
              <a href={surfaceUrl('hub', '/pricing')}>pricing page</a>. The Free plan has no API, MCP or marketplace
              access.
            </p>
            <ul>
              <li>You can cancel any time from your account. Cancelling stops the renewal; you keep the plan until the end of the period you paid for.</li>
              <li>We don&apos;t refund the current period, in full or pro rata, except where the law requires it.</li>
              <li>
                We may change plan prices. We tell you at least {days(f.consumerNoticeDays)} before a new price applies to
                you, and it applies from your next renewal. You can cancel before then.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'credits',
        title: '5. Credits',
        body: (
          <>
            <p>
              Credits pay for everything that calls an AI model on Tulzo: your assistant&apos;s chats and QA checks on gigs.
              1 credit = ${f.creditValueUsd.toFixed(2)}. We meter the real model cost and charge it at {f.usageMarkup} (cost
              plus {f.usageMarkupPercent}), which covers payment and gateway fees, failed calls and our margin. Top-ups
              are from ${f.minTopUpUsd} to ${f.maxTopUpUsd}.
            </p>
            <ul>
              <li>Credits you buy never expire.</li>
              <li>Monthly plan credits are for that billing period. They expire at its end and don&apos;t roll over.</li>
              <li>Credits are non-refundable, have no cash value and can&apos;t be transferred to another account.</li>
            </ul>
            <p>
              Details are in <DocLink slug="payments">Payments, credits and refunds</DocLink>.
            </p>
          </>
        ),
      },
      {
        id: 'withdrawal',
        title: '6. Your right of withdrawal',
        body: (
          <>
            <p>
              If you are a consumer in the EU, you normally have 14 days to withdraw from an online contract without giving
              a reason (Consumer Rights Directive 2011/83/EU).
            </p>
            <p>
              Credits and subscriptions are digital content and services that we supply immediately. Under articles 9 and
              16(m) of the directive, you lose the right of withdrawal only if you asked us to start right away, gave your
              prior express consent, and acknowledged that you lose the right. We ask for this with a checkbox before every
              credit top-up, before you choose a subscription, and before you pay for a gig. We record your consent with the
              date, the version of these terms and what you bought.
            </p>
            <p>
              If you don&apos;t tick the box, you can&apos;t complete the purchase. If the right of withdrawal still applies
              to a purchase (for example because no consent was recorded), tell us within 14 days at{' '}
              <ContactEmail facts={f} /> and we will handle it as the law requires.
            </p>
          </>
        ),
      },
      {
        id: 'marketplace',
        title: '7. Marketplace',
        body: (
          <>
            <p>Publishers can share skills, plugins and MCP servers that other users install.</p>
            <ul>
              <li>
                Everything you publish starts as <em>pending</em> and stays hidden until an admin approves it. Only you (or
                an admin) can publish new versions of your package.
              </li>
              <li>
                You keep the rights to what you publish. You give Tulzo a free, worldwide, non-exclusive licence to host,
                list, copy and distribute it to users for as long as it&apos;s published, and you give users the rights to
                install and use it under the licence you state (or, if you state none, to install and use it for their own
                purposes).
              </li>
              <li>
                Don&apos;t publish anything that breaks our <DocLink slug="acceptable-use">acceptable use policy</DocLink>,
                including malware, hidden data collection or content you have no right to share.
              </li>
              <li>We can refuse, hide or remove a package that breaks these terms or the law, as described in the publisher terms.</li>
              <li>
                Packages are made by third parties, not by Tulzo. They are installed and run on your own machine, at your own
                risk. We review submissions before they go public but don&apos;t guarantee that they are safe, correct or
                fit for a purpose.
              </li>
            </ul>
            <p>
              Publishers are business users: the <DocLink slug="marketplace-publishers">terms for publishers and providers</DocLink>{' '}
              apply too.
            </p>
          </>
        ),
      },
      {
        id: 'gigs',
        title: '8. Gigs',
        body: (
          <>
            <p>
              Gigs connects customers who need software work with providers (people or their agents) who do it. Tulzo is an
              intermediary. The contract for the work is between the customer and the provider; Tulzo is not a party to it
              and doesn&apos;t do the work. What we do: we take and hold the payment, run QA on the delivery, pay the
              provider, and decide disputes.
            </p>
            <h3>Payment</h3>
            <ul>
              <li>
                Customers pay through Stripe Checkout when they accept a bid: the bid plus the platform commission
                (currently {f.commissionPercent}, configurable), added on top. The provider is paid the full bid.
              </li>
              <li>
                Every provider must connect their own Stripe account through Stripe Connect before they can bid or offer
                services. Stripe verifies the provider&apos;s identity (KYC), tax details and bank account; Tulzo doesn&apos;t
                collect or store that data. Card data and payments are processed by Stripe.
              </li>
              <li>
                The payment is held by the platform until the customer accepts the work. Providers receive their earnings as
                independent sellers into their own Stripe accounts and are responsible for their own taxes. We may have to
                report provider earnings to tax authorities under the EU DAC7 rules (Directive (EU) 2021/514).
              </li>
            </ul>
            <h3>Delivery and QA</h3>
            <ul>
              <li>
                Providers submit work from a private GitHub repository with a fine-grained personal access token (PAT) for
                that one repository. Customers can receive the delivery as a download or have it pushed into an empty private
                repository of theirs with a write PAT. We store PATs encrypted and delete them when they are no longer needed
                (after a push, on acceptance or when a dispute ends in a refund).
              </li>
              <li>
                Tulzo runs QA on each submission independently of both parties: a basic check paid by us, and any deeper
                checks the customer chose, paid from the customer&apos;s credits (only the actual usage is charged; the rest of
                the reserve goes back to the balance). QA can approve the work, ask for changes, or reject it.{' '}
                <strong>QA is not a guarantee that the work is correct, secure or fit for a purpose.</strong>
              </li>
              <li>
                While the work runs, the customer can ask questions (free), request revisions (using the steering credits
                included in the bid) or ask for scope changes. A scope change needs a new price and deadline that both sides
                approve; a higher price is paid as a top-up, a lower price refunds the difference.
              </li>
            </ul>
            <h3>Acceptance, disputes and claims</h3>
            <ul>
              <li>
                After QA approves the work, the customer can accept it. If they do nothing, it is accepted automatically{' '}
                {days(f.autoAcceptDays)} after QA approval; we send a reminder {f.reminderHours} hours before.
              </li>
              <li>
                The customer can open a dispute at any time after paying and before acceptance. An open dispute stops the
                automatic acceptance and the payout.
              </li>
              <li>After acceptance, the customer can file a claim within {days(f.claimDays)}.</li>
              <li>
                If QA rejects the work, a dispute opens with a full refund as the default outcome, for an admin to confirm.
              </li>
              <li>
                An admin decides each dispute: release the payment to the provider, a partial refund, or a full refund. How
                refunds and the commission are handled is explained in{' '}
                <DocLink slug="payments" hash="gigs-refunds">Payments, credits and refunds</DocLink>.
              </li>
              <li>
                Card chargebacks are decided by the card network through Stripe, not by Tulzo. While one is open the payout is
                paused.
              </li>
            </ul>
            <h3>What can&apos;t be posted</h3>
            <p>
              Jobs and offers must follow the <DocLink slug="acceptable-use">acceptable use policy</DocLink>. Examples of
              prohibited jobs: malware, breaking into systems you don&apos;t own, evading security or licence controls,
              scraping in breach of a site&apos;s terms, academic cheating, and anything illegal.
            </p>
          </>
        ),
      },
      {
        id: 'agents',
        title: '9. AI agents acting for you',
        body: (
          <ul>
            <li>
              Agents that use Tulzo with your API key or account (through the API or the MCP server) act on your behalf. You
              are responsible for what they do, including posting jobs, bidding, publishing and spending credits.
            </li>
            <li>Set the limits you need in your assistant and revoke keys you no longer use.</li>
            <li>
              AI output can be wrong, incomplete or out of date. Check it before you rely on it. See the{' '}
              <DocLink slug="disclaimers">disclaimers</DocLink>.
            </li>
          </ul>
        ),
      },
      {
        id: 'acceptable-use',
        title: '10. Acceptable use',
        body: (
          <p>
            Use Tulzo lawfully and fairly. The <DocLink slug="acceptable-use">acceptable use policy</DocLink> lists what isn&apos;t
            allowed, including illegal content, malware, abuse of the API or MCP server, scraping, IP infringement and fraud.
            It is part of these terms.
          </p>
        ),
      },
      {
        id: 'intellectual-property',
        title: '11. Intellectual property',
        body: (
          <ul>
            <li>Tulzo, its software, design and brand belong to us or our licensors.</li>
            <li>You keep the rights to the content you bring to Tulzo.</li>
            <li>
              Gigs deliverables: unless the customer and provider agree otherwise in writing, the provider transfers the
              intellectual property rights in the deliverable to the customer once the work is accepted and paid in full. The
              provider promises they have the right to do so and that the deliverable doesn&apos;t infringe anyone else&apos;s
              rights. Third-party open-source parts stay under their own licences.
            </li>
          </ul>
        ),
      },
      {
        id: 'ads-analytics',
        title: '12. Ads and analytics',
        body: (
          <p>
            We only use analytics and ads after you agree in the cookie banner, and you can change your choice any time with
            &quot;Cookie settings&quot; in the footer. Ads are limited to one small banner shown to signed-out visitors on public
            pages. See the <a href={IUBENDA_COOKIE_URL}>cookie policy</a>.
          </p>
        ),
      },
      {
        id: 'privacy',
        title: '13. Privacy',
        body: (
          <p>
            How we handle personal data is explained in our <a href={IUBENDA_PRIVACY_URL}>privacy policy</a>.
          </p>
        ),
      },
      {
        id: 'liability',
        title: '14. Liability',
        body: (
          <>
            <p>
              We provide Tulzo with reasonable care and skill, but we don&apos;t promise that it is always available or free of
              errors. As far as the law allows:
            </p>
            <ul>
              <li>we are not liable for indirect or consequential loss, or for loss caused by third-party packages, providers, customers or AI output;</li>
              <li>our total liability to you in any 12 months is limited to what you paid us in that period.</li>
            </ul>
            <p>
              Nothing in these terms limits liability that can&apos;t be limited by law, including for death or personal injury
              caused by negligence, for fraud, for gross negligence or intent, or your rights as a consumer under EU law and the
              law of your country.
            </p>
          </>
        ),
      },
      {
        id: 'suspension',
        title: '15. Suspension and termination',
        body: (
          <ul>
            <li>You can stop using Tulzo and close your account at any time.</li>
            <li>
              We can suspend or close an account, revoke API keys or remove content if you seriously or repeatedly break these
              terms or the law, if we must by law, or to protect users or the service. We tell you why, and where the law
              requires it we give notice first. Business users get the notice described in the publisher terms.
            </li>
            <li>You can challenge a decision through our <DocLink slug="complaints">complaints process</DocLink>.</li>
          </ul>
        ),
      },
      {
        id: 'changes',
        title: '16. Changes to these terms',
        body: (
          <ul>
            <li>
              We may update these terms. Each version has a number and an effective date (this is version {f.version}).
            </li>
            <li>
              For important changes we tell you by email or in the app at least {days(f.consumerNoticeDays)} before they apply.
            </li>
            <li>
              Business users (providers and publishers) get at least {days(f.businessNoticeDays)}&apos; notice, as the P2B
              Regulation (EU) 2019/1150 requires, and can end their contract before the change applies.
            </li>
            <li>If you don&apos;t agree with a change, you can stop using Tulzo and cancel before it applies.</li>
          </ul>
        ),
      },
      {
        id: 'complaints',
        title: '17. Complaints',
        body: (
          <p>
            You can complain about anything on Tulzo, report illegal content (Digital Services Act, Regulation (EU) 2022/2065),
            or challenge a decision we made about your content or account, through the form on our{' '}
            <DocLink slug="complaints">complaints page</DocLink> or by email to <ContactEmail facts={f} />. Business users can use
            the same internal complaint system under the P2B Regulation. We reply within {days(f.complaintResponseDays)}.
          </p>
        ),
      },
      {
        id: 'governing-law',
        title: '18. Governing law and disputes',
        body: (
          <>
            <p>
              These terms are governed by {governingLaw(f)}, without depriving consumers of the mandatory protections of their
              country of residence. Consumers can also bring a claim in the courts of the country where they live.
            </p>
            <p>
              If you are a consumer in the EU, you can find out about out-of-court dispute resolution on the European
              Commission&apos;s <a href={EU_CONSUMER_DISPUTES_URL}>consumer redress page</a>.
            </p>
          </>
        ),
      },
      {
        id: 'contact',
        title: '19. Contact',
        body: (
          <p>
            Questions about these terms: <ContactEmail facts={f} />, or use the{' '}
            <DocLink slug="complaints" hash="form">contact form</DocLink>.
          </p>
        ),
      },
    ],
  };
}

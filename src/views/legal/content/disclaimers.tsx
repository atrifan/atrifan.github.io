/**
 * /legal/disclaimers.
 *
 * Draft: review with a qualified lawyer before relying on it.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { DocLink } from '../links';
import type { LegalDoc } from '../types';

export function disclaimersDoc(f: LegalFacts): LegalDoc {
  return {
    slug: 'disclaimers',
    title: 'Disclaimers',
    description: 'What Tulzo does and does not promise: AI output, agents, QA, marketplace packages, gigs and availability.',
    summary: [
      'AI output can be wrong. Check it before you rely on it.',
      'Your agents act for you, and you are responsible for what they do.',
      'QA is not a guarantee of correctness, security or fitness for a purpose.',
      'Marketplace packages are third-party software that runs on your machine, at your own risk.',
      'Tulzo is an intermediary on gigs, not a party to the work contract.',
    ],
    sections: [
      {
        id: 'ai-output',
        title: 'AI output can be wrong',
        body: (
          <p>
            Tulzo uses AI models from third parties. Their answers, summaries, code and classifications can be wrong,
            incomplete, biased or out of date, even when they sound confident. Check anything important before you act on it.
          </p>
        ),
      },
      {
        id: 'agents',
        title: 'Agents act for you',
        body: (
          <p>
            Your assistant and any other agent that uses your API key or account acts on your behalf. You are responsible for
            what it does through Tulzo, including spending credits, posting jobs, bidding and publishing. Review its settings and
            revoke keys you don&apos;t use.
          </p>
        ),
      },
      {
        id: 'qa',
        title: 'QA is not a guarantee',
        body: (
          <p>
            QA on gigs checks a delivery against its acceptance criteria with automated and human review. It lowers risk; it
            doesn&apos;t remove it. A delivery that passed QA can still contain bugs, security issues or code that isn&apos;t fit
            for your purpose. Review and test deliveries before you use them in production.
          </p>
        ),
      },
      {
        id: 'packages',
        title: 'Marketplace packages are third-party',
        body: (
          <p>
            Skills, plugins and MCP servers on the Marketplace are made by publishers, not by Tulzo. We review them before they
            go public, but we don&apos;t guarantee that they are safe, correct or maintained. They are installed and run on your
            own machine, with the access you give them. Use them at your own risk.
          </p>
        ),
      },
      {
        id: 'gigs',
        title: 'Tulzo is an intermediary on gigs',
        body: (
          <p>
            The contract for gig work is between the customer and the provider. Tulzo holds the payment, runs QA and decides
            disputes, but doesn&apos;t do the work and isn&apos;t responsible for how a provider performs it. Providers are
            independent sellers, not our employees or agents. See <DocLink slug="terms" hash="gigs">Gigs in the terms</DocLink>.
          </p>
        ),
      },
      {
        id: 'no-advice',
        title: 'No professional advice',
        body: (
          <p>
            Nothing on Tulzo, including AI output, is professional, legal, financial, tax or medical advice. Ask a qualified
            professional for that.
          </p>
        ),
      },
      {
        id: 'availability',
        title: 'Availability',
        body: (
          <p>
            We work to keep Tulzo running, but we don&apos;t guarantee that it is always available, fast or free of errors. We
            may change or pause features, for example for maintenance or security. We rely on third-party services (such as
            hosting, Clerk, Stripe and AI model providers) whose outages can affect Tulzo.
          </p>
        ),
      },
      {
        id: 'third-party-links',
        title: 'Links to third parties',
        body: (
          <p>
            Tulzo links to other sites and services, such as GitHub, Stripe and package sources. We don&apos;t control them and
            aren&apos;t responsible for their content or practices. Their own terms and privacy policies apply.
          </p>
        ),
      },
      {
        id: 'your-rights',
        title: 'Your legal rights',
        body: (
          <p>
            These disclaimers apply as far as the law allows. They don&apos;t limit rights you have as a consumer that can&apos;t
            be limited by contract. Version {f.version}.
          </p>
        ),
      },
    ],
  };
}

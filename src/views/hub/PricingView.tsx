'use client';

import { PricingTable, SignedIn, SignedOut } from '@clerk/nextjs';
import { surfaceUrl } from '@/src/lib/surface-url';
import { CREDIT_MARKUP, PLAN_CATALOG, REFERENCE_MODELS, formatTokenCount, outputTokensForCredits } from '@/src/lib/plan-catalog';
import { formatCredits, formatUsd } from '@/src/lib/format';
import { CREDIT_VALUE_USD } from '@/src/lib/credits';
import { SubscribeConsent } from './SubscribeConsent';

const opus1k = formatTokenCount(outputTokensForCredits(1000, REFERENCE_MODELS.opus));
const sonnet1k = formatTokenCount(outputTokensForCredits(1000, REFERENCE_MODELS.sonnet));
const rawPer1k = formatUsd((1000 * CREDIT_VALUE_USD) / CREDIT_MARKUP);

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What is a credit?',
    a: (
      <>
        Credits are the one unit for everything that calls an AI model on Tulzo: chatting with your assistant and QA
        checks on gigs. 1 credit = $0.01. We meter the real model cost and add {Math.round((CREDIT_MARKUP - 1) * 100)}%,
        which covers payment and gateway fees, failed calls and our margin. So 1,000 credits ($10) buy about{' '}
        {rawPer1k} of raw model usage: roughly {opus1k} output tokens on {REFERENCE_MODELS.opus.name}, or {sonnet1k} on{' '}
        {REFERENCE_MODELS.sonnet.name}. Input tokens are cheaper, so a typical chat goes further than that.
      </>
    ),
  },
  {
    q: 'Do monthly credits roll over?',
    a: 'No. Credits included in a plan are for that month. Credits you buy with a top-up never expire.',
  },
  {
    q: 'What does a top-up cost?',
    a: 'Exactly what it says: $5 buys 500 credits, $25 buys 2,500. There is no separate processing fee. The minimum top-up is $5.',
  },
  {
    q: 'How do gigs and payouts work?',
    a: 'Customers pay the bid plus the platform commission, added on top. Providers receive their full bid through Stripe once QA approves the work. You need a linked Stripe account (from your profile) to bid.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Cancel from your account; you keep the plan until the end of the billing period.',
  },
  {
    q: 'Can I get a refund?',
    a: (
      <>
        Credits are non-refundable: that covers top-ups and the monthly credits in a plan. They have no cash value and
        can&apos;t be transferred. If you cancel a plan, it stops renewing at the end of the period; the current period
        isn&apos;t refunded. Gigs payments are held until you accept the work, and disputes can end in a partial or full
        refund. Details: <a href={surfaceUrl('hub', '/legal/payments')}>Payments, credits and refunds</a>.
      </>
    ),
  },
  {
    q: 'Is my data safe?',
    a: 'Tex runs sandboxed on your machine, so your browsing and credentials stay there. Tulzo stores your keys, usage and the work you post on Gigs.',
  },
];

export function PricingView() {
  return (
    <div className="page">
      <section className="hero hero-compact">
        <h1 className="hero-title">Pricing</h1>
        <p className="hero-lede">Start free and pay as you go, or pick a plan with monthly credits. Prices in US dollars.</p>
      </section>

      <section className="section" aria-label="Plans">
        <ul className="plan-grid" role="list">
          {PLAN_CATALOG.map((p) => (
            <li key={p.key} className="plan-card" data-featured={p.key === 'pro' ? 'true' : undefined}>
              <h2 className="plan-name">{p.name}</h2>
              <p className="plan-price">
                ${p.monthlyUsd} <small>/ month</small>
              </p>
              <p className="plan-annual">
                {p.annualUsd === null ? 'Free forever' : `or ${formatUsd(p.annualUsd).replace(/\.00$/, '')} a year`}
              </p>
              <p className="plan-credits">{formatCredits(p.monthlyCredits)} a month</p>
              <ul className="plan-extras" role="list">
                {p.extras.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="subscribe-title">
        <SignedOut>
          <div className="card card-center">
            <h2 id="subscribe-title" className="section-title">
              Ready when you are
            </h2>
            <p className="muted">Create a free account, then upgrade any time.</p>
            <div className="actions">
              <a href={surfaceUrl('hub', '/sign-up')} className="btn btn-primary">
                Get started
              </a>
            </div>
          </div>
        </SignedOut>
        <SignedIn>
          <h2 id="subscribe-title" className="section-title">
            Choose your plan
          </h2>
          <SubscribeConsent>
            <PricingTable />
          </SubscribeConsent>
        </SignedIn>
      </section>

      <section className="section narrow" aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">
          Frequently asked questions
        </h2>
        <div className="stack">
          {FAQ.map((f) => (
            <details key={f.q} className="card faq">
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * /legal/payments: payments, credits and refunds.
 *
 * Draft: review with a qualified lawyer before relying on it.
 *
 * The refund maths described here is src/lib/disputes/amounts.ts (planResolution,
 * providerShareOfRefund), src/lib/disputes/scope-credit.ts and src/lib/qa/qa-credits.ts.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { days, gigsWindowsSummary } from '@/src/lib/legal/facts';
import { surfaceUrl } from '@/src/lib/surface-url';
import { ContactEmail, DocLink } from '../links';
import type { LegalDoc } from '../types';

export function paymentsDoc(f: LegalFacts): LegalDoc {
  return {
    slug: 'payments',
    title: 'Payments, credits and refunds',
    description: 'How Tulzo credits, subscriptions and gigs payments work, and when money is refunded.',
    summary: [
      "Credits can't be refunded. They have no cash value and can't be transferred. Credits you buy never expire; monthly plan credits expire at the end of the period.",
      'Subscriptions renew until you cancel. Cancelling stops the next renewal; the current period isn’t refunded.',
      `Gigs: the customer pays the bid plus a ${f.commissionPercent} platform commission. We hold the payment until the work is accepted.`,
      gigsWindowsSummary(f),
      `We remind you ${f.reminderHours} hours before a delivery is accepted automatically.`,
    ],
    sections: [
      {
        id: 'who-processes',
        title: 'Who processes your payment',
        body: (
          <p>
            All card payments are processed by Stripe. Tulzo never sees or stores your card details. Subscriptions are billed
            through Clerk Billing, which uses Stripe. Credit top-ups and gigs payments use Stripe Checkout.
          </p>
        ),
      },
      {
        id: 'credits',
        title: 'Credits',
        body: (
          <>
            <p>
              Credits pay for AI usage on Tulzo: your assistant&apos;s chats and QA checks on gigs. 1 credit = $
              {f.creditValueUsd.toFixed(2)}. Usage is metered at the real model cost times {f.usageMarkup} (cost plus{' '}
              {f.usageMarkupPercent}); there is no separate processing fee. Top-ups are from ${f.minTopUpUsd} to $
              {f.maxTopUpUsd}, in whole dollars.
            </p>
            <ul>
              <li>
                <strong>Credits can&apos;t be refunded.</strong> This applies to credits you buy and to the monthly credits in
                your plan. We don&apos;t refund unused credits.
              </li>
              <li>Credits have no cash value and can&apos;t be transferred to another account.</li>
              <li>Credits you buy never expire.</li>
              <li>Monthly plan credits expire at the end of each billing period and don&apos;t roll over.</li>
              <li>
                Before you buy, we ask you to confirm that you want the credits straight away and that you lose your 14-day
                right of withdrawal once they are delivered. See{' '}
                <DocLink slug="terms" hash="withdrawal">your right of withdrawal</DocLink>.
              </li>
            </ul>
            <p>
              Your balance and history are on the <a href={surfaceUrl('hub', '/credits')}>credits page</a>.
            </p>
          </>
        ),
      },
      {
        id: 'qa-credits',
        title: 'QA credits on gigs',
        body: (
          <p>
            When a provider submits work, QA reserves credits from the customer&apos;s balance for the deeper checks the
            customer chose (the basic check is paid by Tulzo). When QA finishes, only the actual usage is charged; the unused
            part of the reserve is released back to your balance. That release is credits returned to your balance, not a cash
            refund.
          </p>
        ),
      },
      {
        id: 'subscriptions',
        title: 'Subscriptions',
        body: (
          <ul>
            <li>Plans are billed in advance through Clerk Billing and renew automatically.</li>
            <li>
              You can cancel any time. Cancelling stops the renewal at the end of the current period; you keep the plan until
              then. The current period isn&apos;t refunded.
            </li>
            <li>
              Before you subscribe, we ask you to confirm that you want the service straight away and that you lose your 14-day
              right of withdrawal once it starts.
            </li>
          </ul>
        ),
      },
      {
        id: 'gigs-payments',
        title: 'Gigs payments',
        body: (
          <>
            <ul>
              <li>
                When you accept a bid, you pay the bid plus the platform commission, added on top. The commission is
                configurable; it is currently {f.commissionPercent}. The provider receives the full bid.
              </li>
              <li>
                Tulzo holds the payment until the work is accepted. Then the bid is paid out to the provider&apos;s own Stripe
                account.
              </li>
              <li>
                Every provider has their own Stripe account, set up through Stripe Connect before they can bid or offer. Stripe
                verifies the provider&apos;s identity, tax details and bank account; Tulzo doesn&apos;t collect or store that
                data. Providers are paid as independent sellers and are responsible for their own taxes.
              </li>
              <li>
                Before you pay, we ask you to confirm that you want the work to start right away and that you lose your 14-day
                right of withdrawal for the platform service once it starts.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'acceptance',
        title: 'Acceptance',
        body: (
          <ul>
            <li>After QA approves the delivery, you can review it and accept it.</li>
            <li>
              If you do nothing, the delivery is accepted automatically {days(f.autoAcceptDays)} after QA approved it. We send
              you a reminder {f.reminderHours} hours before.
            </li>
            <li>Acceptance completes the contract and releases the payment to the provider.</li>
          </ul>
        ),
      },
      {
        id: 'disputes',
        title: 'Disputes and claims',
        body: (
          <ul>
            <li>
              <strong>Before acceptance:</strong> you can open a dispute at any time after paying, up to acceptance. In practice
              that means within {days(f.autoAcceptDays)} of delivery, before the automatic acceptance. An open dispute pauses
              the automatic acceptance and the payout.
            </li>
            <li>
              <strong>After acceptance:</strong> you can file a claim within {days(f.claimDays)}. The provider may already have
              been paid; an admin can still order a refund.
            </li>
            <li>Only one dispute can be open on a contract at a time.</li>
            <li>
              <strong>QA rejection:</strong> if QA rejects the work, a dispute opens automatically with a full refund as the
              default outcome, for an admin to confirm.
            </li>
          </ul>
        ),
      },
      {
        id: 'gigs-refunds',
        title: 'How a dispute is resolved',
        body: (
          <>
            <p>An admin decides each dispute with one of three outcomes:</p>
            <ul>
              <li>
                <strong>Release:</strong> no refund. The provider is paid the full bid.
              </li>
              <li>
                <strong>Full refund:</strong> everything you paid that hasn&apos;t been refunded yet comes back to you,
                including the commission. The provider is paid nothing.
              </li>
              <li>
                <strong>Partial refund:</strong> you get part of your payment back. The refund is shared between the bid and the
                commission in proportion to what you paid: the provider&apos;s part is the refund times the bid divided by your
                total payment (rounded to the nearest cent), and the rest comes out of the commission. So the commission is
                refunded in the same proportion as the bid.
              </li>
            </ul>
            <p>
              If the provider has already been paid, a refund is recovered by reversing the provider&apos;s Stripe transfer by
              the provider&apos;s share.
            </p>
          </>
        ),
      },
      {
        id: 'scope-changes',
        title: 'Scope changes',
        body: (
          <ul>
            <li>A scope change that raises the price is paid as a top-up (the extra bid plus its commission).</li>
            <li>
              A scope change that lowers the price refunds the difference in your total (bid plus commission) when you approve it.
              If that refund can&apos;t be made at the time, the amount is credited to you when the provider is paid out.
            </li>
          </ul>
        ),
      },
      {
        id: 'chargebacks',
        title: 'Card chargebacks',
        body: (
          <p>
            If you dispute a payment with your card issuer, the chargeback is handled through Stripe and decided by the card
            network, not by Tulzo. While it is open, the payout to the provider is paused. Please contact us first; most
            problems are faster to solve through a dispute on the contract.
          </p>
        ),
      },
      {
        id: 'contact',
        title: 'Questions',
        body: (
          <p>
            Write to <ContactEmail facts={f} /> or use the <DocLink slug="complaints" hash="form">complaints form</DocLink>. The
            full rules are in the <DocLink slug="terms">terms and conditions</DocLink>.
          </p>
        ),
      },
    ],
  };
}

# Terms clauses for Tulzo

> **Draft: review with a qualified lawyer before relying on it.**
>
> The site renders its own legal pages under `/legal/*` (source: `src/views/legal/content/`). This file
> holds the same rules as ready-to-paste clauses, for iubenda or any other copy of the terms. Numbers
> below are the code defaults (`JOBS_AUTO_ACCEPT_DAYS` = 7, `JOBS_POST_ACCEPT_CLAIM_DAYS` = 14,
> `MARKETPLACE_COMMISSION_PERCENT` = 15, reminder 48 hours); change them here if you change the env.

## Before going live

1. Verify the Tulzo **platform** Stripe account. A sole trader / individual is fine.
2. Set `LEGAL_OPERATOR_NAME` and `LEGAL_OPERATOR_ADDRESS` for the imprint (EU e-commerce rules).
3. Confirm DAC7 reporting duties and VAT on commission and subscriptions with Stripe or an accountant.
   Stripe Tax can calculate VAT.

## Environment variables

| Variable | Used for | Notes |
|---|---|---|
| `LEGAL_CONTACT_EMAIL` | Contact address on the legal pages; complaints are emailed here; replies are sent from it | e.g. `support@example.com` |
| `LEGAL_OPERATOR_NAME` | Operator's full name on the imprint and terms | Line hidden when unset |
| `LEGAL_OPERATOR_ADDRESS` | Geographic address on the imprint and terms | Line hidden when unset |
| `LEGAL_COUNTRY` | Country line, and governing law | Unset: neutral "operator's country of establishment" wording |
| `LEGAL_COMPANY_NO` | Company registration number | Line hidden when unset |
| `LEGAL_VAT_NO` | VAT number | Line hidden when unset |
| `RESEND_WEBHOOK_SECRET` | Verifies the Resend `email.received` webhook (Svix signature) | Required for the inbox |
| `SUPPORT_FORWARD_TO` | Extra addresses (comma-separated) that get a copy of each inbound support email | Optional; admins always get one |

## Clauses

### Credits

1. Credits are a prepaid unit for AI usage on Tulzo. One credit is worth USD 0.01 of usage. Usage is metered
   at the model provider's cost multiplied by 1.3.
2. Credits bought as a top-up never expire. Credits included in a subscription plan are valid for that
   billing period only; unused plan credits expire at the end of the period and do not roll over.
3. Credits are non-refundable, have no cash value, cannot be exchanged for money and cannot be transferred
   to another account. This applies to purchased credits and to plan credits.
4. Credits reserved for QA on a gigs submission are charged only for the usage actually incurred; the unused
   part of the reserve is returned to the customer's credit balance. This is a release of credits, not a
   cash refund.

### Subscriptions

1. Paid plans are billed in advance through Clerk Billing; payments are processed by Stripe.
2. A subscription renews automatically at the end of each period until cancelled. Cancellation takes effect
   at the end of the current period. The current period is not refunded, in full or pro rata, except where
   mandatory law requires it.
3. We may change prices with at least 30 days' notice. A new price applies from the next renewal after the
   notice period; the user may cancel before it applies.

### Right of withdrawal (EU consumers)

1. Consumers in the EU have a right to withdraw from distance contracts within 14 days (Directive
   2011/83/EU).
2. Credits and subscriptions are digital content and digital services supplied immediately. Gigs payments
   start the platform's service immediately. In line with articles 9 and 16(m) of the Directive, the consumer
   loses the right of withdrawal once supply has begun, **only** where the consumer has given prior express
   consent to immediate supply and has acknowledged that the right of withdrawal is thereby lost.
3. Tulzo collects this consent with an unticked checkbox before each credit top-up, before a subscription and
   before a gigs checkout, and records the user, the time, the terms version and what was bought.

### Gigs payments

1. Tulzo acts as an intermediary between customers and providers. The contract for the work is between the
   customer and the provider; Tulzo is not a party to it. Tulzo collects and holds the payment, runs QA on
   deliveries, pays providers and decides disputes.
2. The customer pays the provider's bid plus a platform commission, added on top of the bid. The commission
   is set by Tulzo and is currently 15%. The provider receives the full bid.
3. Each provider must have their own Stripe account, set up through Stripe Connect, before bidding or
   offering services. Stripe verifies the provider's identity, tax details and bank account; Tulzo does not
   collect or store that data. Customers pay through Stripe Checkout. Card data is processed by Stripe.
4. Payments are held by the platform until the work is accepted, then the bid is paid out to the provider's
   Stripe account. Providers act as independent sellers and are responsible for their own taxes. Tulzo may
   report provider earnings under Council Directive (EU) 2021/514 (DAC7).
5. A scope change that raises the price is paid as a top-up (price difference plus commission). A scope
   change that lowers the price refunds the reduction in the customer's total (price plus commission); where
   the refund cannot be made at once, it is credited when the provider is paid out.

### Acceptance, disputes and claims

1. After QA validates a delivery, the customer may accept it. A delivery not accepted or disputed is accepted
   automatically 7 days after validation. The customer is reminded 48 hours before.
2. The customer may open a dispute at any time after payment and before acceptance. An open dispute pauses
   automatic acceptance and the payout.
3. After acceptance, the customer may file a claim within 14 days.
4. If QA rejects the work, a dispute is opened automatically with a full refund as the default outcome, for
   an administrator to confirm.
5. An administrator resolves each dispute with one of: (a) release, with no refund and the full bid paid to
   the provider; (b) full refund of all amounts still refundable, including the commission; or (c) partial
   refund. A partial refund is shared between the bid and the commission in proportion to the amount paid:
   the provider's share equals the refund multiplied by the bid and divided by the total paid, rounded half
   up to the cent and capped at the bid.
6. Where the provider has already been paid, a refund is recovered by reversing the provider's transfer by
   the provider's share of the refund.

### Chargebacks

1. A card chargeback is handled through Stripe and decided by the card network, not by Tulzo.
2. While a chargeback is open, automatic acceptance and payouts on the contract are paused.

### Business users (P2B Regulation (EU) 2019/1150)

1. Publishers and providers are business users. Changes to the terms are notified at least 15 days in
   advance; the business user may terminate before the change applies.
2. Restriction or suspension is notified with a statement of reasons; termination of the whole service is
   notified at least 30 days in advance, except where the law allows immediate action.
3. Main ranking parameters: marketplace catalog by installs (default), newest, or rating (average rating,
   rating count, installs), ties by name; discover API by installs; gigs jobs and offers newest first; bids
   ordered by the customer's choice of price, delivery time or trust score. No paid ranking.
4. Complaints are handled free of charge through the internal complaint system at `/legal/complaints` or by
   email to `support@example.com`, with a reply within 14 days.

### Digital Services Act (Regulation (EU) 2022/2065)

1. Anyone may notify Tulzo of allegedly illegal content through `/legal/complaints`, giving an explanation,
   the exact URL, their name and email, and a statement of good faith (art. 16).
2. Tulzo informs the notifier and the affected user of its decision and the reasons (art. 17).
3. Users may complain about a moderation decision for at least six months through the internal complaint
   system; complaints are reviewed by a person (art. 20).

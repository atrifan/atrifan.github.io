import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JobSpecSchema,
  CreateJobSchema,
  UpdateJobSchema,
  CreateBidSchema,
  CreateOfferSchema,
  normalizeAiSpec,
  parseJobListQuery,
  parseOfferListQuery,
} from '../../src/lib/jobs/schemas.ts';
import {
  SUPPORTED_CONNECT_COUNTRIES,
  isSupportedConnectCountry,
  connectStatusFromAccount,
} from '../../src/lib/jobs/connect-rules.ts';
import { buildContractCheckoutParams, transferGroupFor } from '../../src/lib/jobs/checkout-params.ts';

const validSpec = {
  requirements: ['Build a CSV importer'],
  deliverables: ['Source code in a private repo'],
  acceptance_criteria: ['Imports the sample file without errors'],
  constraints: [],
  deadline: '2026-12-01T00:00:00.000Z',
  budget_min_cents: 10000,
  budget_max_cents: 50000,
  permitted_tools: ['node'],
  security: { data_sensitivity: 'internal' as const, secrets_allowed: false, notes: '' },
};

// ---------- spec schema ----------

test('a complete spec is valid', () => {
  assert.equal(JobSpecSchema.safeParse(validSpec).success, true);
});

test('requirements, deliverables and acceptance criteria need at least one item', () => {
  for (const key of ['requirements', 'deliverables', 'acceptance_criteria'] as const) {
    assert.equal(JobSpecSchema.safeParse({ ...validSpec, [key]: [] }).success, false, key);
  }
});

test('spec budget min above max is invalid', () => {
  assert.equal(JobSpecSchema.safeParse({ ...validSpec, budget_min_cents: 9, budget_max_cents: 8 }).success, false);
});

test('spec deadline must be an ISO datetime or null', () => {
  assert.equal(JobSpecSchema.safeParse({ ...validSpec, deadline: 'next week' }).success, false);
  assert.equal(JobSpecSchema.safeParse({ ...validSpec, deadline: null }).success, true);
});

test('spec security sensitivity is an enum', () => {
  assert.equal(
    JobSpecSchema.safeParse({ ...validSpec, security: { ...validSpec.security, data_sensitivity: 'secret' } }).success,
    false,
  );
});

test('AI output is normalized: bad deadline -> null, reversed budget -> max dropped, blanks trimmed out', () => {
  const out = normalizeAiSpec({
    ...validSpec,
    requirements: ['  Build it  ', '', '   '],
    deadline: 'soon',
    budget_min_cents: 50000,
    budget_max_cents: 100,
  });
  assert.deepEqual(out.requirements, ['Build it']);
  assert.equal(out.deadline, null);
  assert.equal(out.budget_min_cents, 50000);
  assert.equal(out.budget_max_cents, null);
  assert.equal(JobSpecSchema.safeParse(out).success, true);
});

test('AI output keeps a valid deadline as ISO and rounds money to integer cents', () => {
  const out = normalizeAiSpec({ ...validSpec, deadline: '2026-12-01', budget_min_cents: 100.6, budget_max_cents: -5 });
  assert.equal(out.deadline, '2026-12-01T00:00:00.000Z');
  assert.equal(out.budget_min_cents, 101);
  assert.equal(out.budget_max_cents, null);
});

// ---------- job / bid / offer input ----------

test('create job: title and description bounds, budget order', () => {
  const ok = { title: 'CSV importer', description: 'Import CSV files into Postgres.' };
  assert.equal(CreateJobSchema.safeParse(ok).success, true);
  assert.equal(CreateJobSchema.safeParse({ ...ok, title: 'ab' }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, description: 'short' }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, budget_min_cents: 2, budget_max_cents: 1 }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, budget_min_cents: 1.5 }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, budget_min_cents: -1 }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, deadline: 'tomorrow' }).success, false);
  assert.equal(CreateJobSchema.safeParse({ ...ok, deadline: '2026-12-01T00:00:00Z' }).success, true);
});

test('update job: all optional, but the same rules', () => {
  assert.equal(UpdateJobSchema.safeParse({}).success, true);
  assert.equal(UpdateJobSchema.safeParse({ title: 'ab' }).success, false);
  assert.equal(UpdateJobSchema.safeParse({ budget_min_cents: 5, budget_max_cents: 4 }).success, false);
});

test('create bid: integer cents, eta >= 1, optional lists', () => {
  assert.equal(CreateBidSchema.safeParse({ price_cents: 30000, eta_days: 5 }).success, true);
  assert.equal(CreateBidSchema.safeParse({ price_cents: 12.5, eta_days: 5 }).success, false);
  assert.equal(CreateBidSchema.safeParse({ price_cents: 30000, eta_days: 0 }).success, false);
  assert.equal(CreateBidSchema.safeParse({ price_cents: 30000, eta_days: 2, included_steering_credits: -1 }).success, false);
  const parsed = CreateBidSchema.parse({ price_cents: 30000, eta_days: 2 });
  assert.deepEqual(parsed.deliverables, []);
  assert.deepEqual(parsed.assumptions, []);
  assert.equal(parsed.included_steering_credits, 0);
});

test('create offer', () => {
  const ok = { title: 'Next.js fixes', description: 'I fix Next.js apps fast.', price_cents: 5000, delivery_days: 3 };
  assert.equal(CreateOfferSchema.safeParse(ok).success, true);
  assert.equal(CreateOfferSchema.safeParse({ ...ok, price_cents: 0 }).success, false);
  assert.equal(CreateOfferSchema.safeParse({ ...ok, delivery_days: 0 }).success, false);
  assert.deepEqual(CreateOfferSchema.parse(ok).tags, []);
});

// ---------- list queries ----------

test('job list query defaults', () => {
  const r = parseJobListQuery(new URLSearchParams());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.limit, 20);
    assert.equal(r.value.offset, 0);
    assert.equal(r.value.mine, false);
    assert.equal(r.value.status, undefined);
  }
});

test('job list query parses filters and caps the limit at 50', () => {
  const r = parseJobListQuery(new URLSearchParams({
    q: 'csv', category: 'data', min_price_cents: '100', max_price_cents: '900', status: 'open',
    deadline_before: '2026-12-01T00:00:00Z', deadline_after: '2026-11-01T00:00:00Z', mine: 'true', limit: '500', offset: '40',
  }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.q, 'csv');
    assert.equal(r.value.category, 'data');
    assert.equal(r.value.min_price_cents, 100);
    assert.equal(r.value.max_price_cents, 900);
    assert.equal(r.value.status, 'open');
    assert.equal(r.value.mine, true);
    assert.equal(r.value.limit, 50);
    assert.equal(r.value.offset, 40);
  }
});

test('job list query rejects garbage', () => {
  assert.equal(parseJobListQuery(new URLSearchParams({ status: 'bogus' })).ok, false);
  assert.equal(parseJobListQuery(new URLSearchParams({ min_price_cents: 'x' })).ok, false);
  assert.equal(parseJobListQuery(new URLSearchParams({ offset: '-1' })).ok, false);
  assert.equal(parseJobListQuery(new URLSearchParams({ deadline_before: 'soon' })).ok, false);
});

test('search text is stripped of PostgREST filter syntax', () => {
  const r = parseJobListQuery(new URLSearchParams({ q: 'a,b(c)%*\\d' }));
  assert.equal(r.ok && r.value.q, 'a b c d');
});

test('offer list query', () => {
  const r = parseOfferListQuery(new URLSearchParams({ mine: '1', limit: '5' }));
  assert.equal(r.ok && r.value.mine, true);
  assert.equal(r.ok && r.value.limit, 5);
});

// ---------- Connect ----------

test('Connect is limited to EEA, UK and CH', () => {
  assert.equal(SUPPORTED_CONNECT_COUNTRIES.length, 32);
  for (const c of ['DE', 'FR', 'RO', 'NL', 'IE', 'NO', 'IS', 'LI', 'GB', 'CH']) {
    assert.equal(isSupportedConnectCountry(c), true, c);
  }
  for (const c of ['US', 'CA', 'IN', 'TR', 'UA', '', 'de ', 'XX']) {
    assert.equal(isSupportedConnectCountry(c), false, c);
  }
  assert.equal(isSupportedConnectCountry('de'), true);
});

test('Connect status from a Stripe account', () => {
  assert.equal(connectStatusFromAccount({ payouts_enabled: true, details_submitted: true }), 'enabled');
  assert.equal(connectStatusFromAccount({ payouts_enabled: false, details_submitted: false }), 'pending');
  assert.equal(connectStatusFromAccount({ payouts_enabled: false, details_submitted: true }), 'restricted');
  assert.equal(
    connectStatusFromAccount({ payouts_enabled: false, details_submitted: false, requirements: { disabled_reason: 'requirements.past_due' } }),
    'restricted',
  );
  assert.equal(
    connectStatusFromAccount({ payouts_enabled: true, details_submitted: true, requirements: { disabled_reason: 'rejected.fraud' } }),
    'disabled',
  );
  assert.equal(connectStatusFromAccount({}), 'pending');
});

// ---------- Checkout ----------

test('contract checkout: one EUR line item for the customer total, transfer group, contract metadata', () => {
  const p = buildContractCheckoutParams({
    contractId: 'c1', jobId: 'j1', bidId: 'b1', jobTitle: 'CSV importer',
    customerTotalCents: 34500, currency: 'eur',
    successUrl: 'https://x/ok', cancelUrl: 'https://x/no',
  });
  assert.equal(p.mode, 'payment');
  assert.equal(p.line_items?.length, 1);
  const item = p.line_items![0];
  assert.equal(item.quantity, 1);
  assert.equal(item.price_data?.currency, 'eur');
  assert.equal(item.price_data?.unit_amount, 34500);
  assert.equal(p.payment_intent_data?.transfer_group, 'contract_c1');
  assert.equal(transferGroupFor('c1'), 'contract_c1');
  assert.equal(p.metadata?.kind, 'contract');
  assert.equal(p.metadata?.contract_id, 'c1');
  assert.equal(p.payment_intent_data?.metadata?.contract_id, 'c1');
  assert.equal(p.client_reference_id, 'c1');
  assert.equal(p.success_url, 'https://x/ok');
  assert.equal(p.cancel_url, 'https://x/no');
  // must not look like a credits top-up to the webhook
  assert.equal(p.metadata?.clerkUserId, undefined);
  assert.equal(p.metadata?.rawDepositAmount, undefined);
});
